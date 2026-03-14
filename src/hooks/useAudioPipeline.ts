import { useState, useRef, useEffect, useCallback, type MutableRefObject } from 'react';

const SPEECH_RMS_THRESHOLD = 200;
const SILENCE_MS_BEFORE_TURN_COMPLETE = 600;
const MIN_SPEECH_MS_BEFORE_END = 300;

// The Audio Pipeline Hook
// INPUT:  16kHz, 16-bit mono PCM (microphone → Gemini)
// OUTPUT: 24kHz, 16-bit mono PCM (Gemini audio → speakers)
// getCanSendRef: ref to a function () => boolean; if provided, onAudioInput is only called when it returns true (avoids stale closure).
// options.onUserStoppedSpeaking: called after SILENCE_MS_BEFORE_TURN_COMPLETE ms of silence following speech; use to send clientContent.turnComplete to Gemini.
export function useAudioPipeline(
    onAudioInput: (base64Audio: string) => void,
    getCanSendRef?: MutableRefObject<() => boolean>,
    options?: { onUserStoppedSpeaking?: () => void }
) {
    const [isRecording, setIsRecording] = useState(false);
    const onUserStoppedSpeakingRef = useRef(options?.onUserStoppedSpeaking);
    onUserStoppedSpeakingRef.current = options?.onUserStoppedSpeaking;
    const lastSpeechTimeRef = useRef<number>(0);
    const speechStartTimeRef = useRef<number>(0);

    // Separate contexts: recording must be 16kHz, playback must match Gemini output (24kHz)
    const recordingCtxRef = useRef<AudioContext | null>(null);
    const playbackCtxRef = useRef<AudioContext | null>(null);

    const streamRef = useRef<MediaStream | null>(null);
    const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
    const playbackQueueRef = useRef<Int16Array[]>([]);
    const isPlayingRef = useRef(false);
    const nextPlayTimeRef = useRef(0);
    const playLogCountRef = useRef(0);
    const playbackGainRef = useRef<GainNode | null>(null);
    // Accumulate small PCM chunks into larger buffers to reduce scheduling jitter and choppiness
    const playbackAccumulatorRef = useRef<Int16Array[]>([]);
    const playbackAccumulatorSamplesRef = useRef(0);
    const TARGET_SAMPLES = 2880; // 120ms at 24kHz

    // Track all in-flight BufferSourceNodes so bargeIn() can stop them immediately
    const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
    // Monotonically-increasing generation counter — incremented on every bargeIn() call.
    // Each scheduled source captures the generation at schedule time; its onended callback
    // ignores the chain if the generation has moved on (i.e. a bargeIn fired meanwhile).
    const playbackGenRef = useRef(0);

    // ─── Playback ────────────────────────────────────────────────────────────
    const scheduleAudioPlayback = useCallback(() => {
        const ctx = playbackCtxRef.current;
        const qLen = playbackQueueRef.current.length;
        if (!ctx || qLen === 0) {
            isPlayingRef.current = false;
            return;
        }

        // Mark playing BEFORE the suspended early-return so that concurrent
        // queuePlayback calls don't race and schedule duplicate chains.
        isPlayingRef.current = true;

        if (ctx.state === 'suspended') {
            ctx.resume().then(() => scheduleAudioPlayback());
            return;
        }

        // Capture the current playback generation so the onended callback can
        // detect a bargeIn() that occurred while this source was in-flight.
        const myGen = playbackGenRef.current;

        const pcmData = playbackQueueRef.current.shift()!;

        // Int16 → Float32
        const float32 = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
            float32[i] = Math.max(-1, Math.min(1, pcmData[i] / 32768));
        }

        // Gemini outputs 24kHz PCM audio
        const buffer = ctx.createBuffer(1, float32.length, 24000);
        buffer.copyToChannel(float32, 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const dest = playbackGainRef.current ?? ctx.destination;
        source.connect(dest);

        const playTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
        source.start(playTime);
        nextPlayTimeRef.current = playTime + buffer.duration;

        // Register for cancellation by bargeIn()
        activeSourcesRef.current.push(source);

        if (playLogCountRef.current === 0) {
            console.log('[AudioPipeline] Playback started, queue length:', playbackQueueRef.current.length);
        }
        if (process.env.NODE_ENV === 'development' && playLogCountRef.current < 8) {
            playLogCountRef.current += 1;
            fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'useAudioPipeline.ts:scheduleAudioPlayback',message:'source.start() called',data:{ctxState:ctx.state,duration:buffer.duration,queueRemaining:playbackQueueRef.current.length},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
        }

        source.onended = () => {
            // Evict from the active-sources registry (may already be gone if bargeIn fired)
            activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
            // If bargeIn() incremented the generation while this source was playing,
            // discard the chain — the new response will create its own chain.
            if (playbackGenRef.current !== myGen) return;
            scheduleAudioPlayback();
        };
    }, []);

    // Call from a user gesture (e.g. Connect click) so playback can run without being suspended.
    // Use default context sample rate; buffers are created at 24kHz to match Gemini output.
    const preparePlayback = useCallback(async (): Promise<void> => {
        if (!playbackCtxRef.current) {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            playbackCtxRef.current = ctx;
            const gain = ctx.createGain();
            gain.gain.value = 1;
            gain.connect(ctx.destination);
            playbackGainRef.current = gain;
        }
        const ctx = playbackCtxRef.current;
        const stateBefore = ctx.state;
        if (ctx.state === 'suspended') {
            await ctx.resume();
            if (process.env.NODE_ENV === 'development') fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'useAudioPipeline.ts:preparePlayback',message:'resume() resolved',data:{stateBefore,stateAfter:ctx.state},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
        }
        if (process.env.NODE_ENV === 'development') fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'useAudioPipeline.ts:preparePlayback',message:'preparePlayback called',data:{state:ctx.state},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    }, []);

    const flushAccumulator = useCallback(() => {
        const chunks = playbackAccumulatorRef.current;
        const total = playbackAccumulatorSamplesRef.current;
        if (total === 0) return;
        playbackAccumulatorRef.current = [];
        playbackAccumulatorSamplesRef.current = 0;
        const merged = new Int16Array(total);
        let offset = 0;
        for (const c of chunks) {
            merged.set(c, offset);
            offset += c.length;
        }
        playbackQueueRef.current.push(merged);
        const ctx = playbackCtxRef.current;
        if (ctx && !isPlayingRef.current) {
            nextPlayTimeRef.current = ctx.currentTime;
            scheduleAudioPlayback();
        }
    }, [scheduleAudioPlayback]);

    const queuePlayback = useCallback((base64Pcm: string | ArrayBuffer | Uint8Array) => {
        if (!playbackCtxRef.current) {
            console.warn('[AudioPipeline] queuePlayback called but no playback context; call preparePlayback() on user gesture first.');
            return;
        }

        const ctx = playbackCtxRef.current;
        if (ctx.state === 'suspended') {
            ctx.resume().catch((e) => console.warn('[AudioPipeline] resume failed:', e));
        }

        let pcm16: Int16Array;
        try {
            let binaryStr: string;
            if (typeof base64Pcm === 'string') {
                binaryStr = window.atob(base64Pcm);
            } else if (base64Pcm instanceof Uint8Array) {
                const bytes = base64Pcm;
                const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                const numSamples = ab.byteLength >> 1;
                pcm16 = new Int16Array(ab, 0, numSamples);
                playbackAccumulatorRef.current.push(pcm16);
                playbackAccumulatorSamplesRef.current += numSamples;
                if (playbackAccumulatorSamplesRef.current >= TARGET_SAMPLES) flushAccumulator();
                if (!isPlayingRef.current && playbackQueueRef.current.length > 0) {
                    nextPlayTimeRef.current = ctx.currentTime;
                    scheduleAudioPlayback();
                }
                return;
            } else {
                const ab = base64Pcm instanceof ArrayBuffer ? base64Pcm : (base64Pcm as ArrayBuffer);
                const numSamples = ab.byteLength >> 1;
                pcm16 = new Int16Array(ab, 0, numSamples);
                playbackAccumulatorRef.current.push(pcm16);
                playbackAccumulatorSamplesRef.current += numSamples;
                if (playbackAccumulatorSamplesRef.current >= TARGET_SAMPLES) flushAccumulator();
                if (!isPlayingRef.current && playbackQueueRef.current.length > 0) {
                    nextPlayTimeRef.current = ctx.currentTime;
                    scheduleAudioPlayback();
                }
                return;
            }
            const byteLen = binaryStr.length;
            const ab = new ArrayBuffer(byteLen);
            const bytes = new Uint8Array(ab);
            for (let i = 0; i < byteLen; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            const numSamples = byteLen >> 1;
            pcm16 = new Int16Array(ab, 0, numSamples);
        } catch (e) {
            console.error('[AudioPipeline] queuePlayback decode error:', e);
            return;
        }
        playbackAccumulatorRef.current.push(pcm16);
        playbackAccumulatorSamplesRef.current += pcm16.length;

        if (playbackAccumulatorSamplesRef.current >= TARGET_SAMPLES) {
            flushAccumulator();
        }
        if (!isPlayingRef.current && playbackQueueRef.current.length > 0) {
            nextPlayTimeRef.current = ctx.currentTime;
            scheduleAudioPlayback();
        }
    }, [scheduleAudioPlayback, flushAccumulator]);

    const flushPlayback = useCallback(() => {
        flushAccumulator();
        const ctx = playbackCtxRef.current;
        if (ctx && !isPlayingRef.current && playbackQueueRef.current.length > 0) {
            nextPlayTimeRef.current = ctx.currentTime;
            scheduleAudioPlayback();
        }
    }, [flushAccumulator, scheduleAudioPlayback]);

    const bargeIn = useCallback(() => {
        // Advance the generation so all stale onended callbacks are silently dropped.
        playbackGenRef.current += 1;

        // Immediately stop every in-flight BufferSourceNode.
        // Calling stop() on a source that was scheduled but hasn't started yet also
        // prevents it from ever playing and fires its onended event (which we ignore
        // because the generation has advanced).
        const sourcesToStop = activeSourcesRef.current;
        activeSourcesRef.current = [];
        for (const src of sourcesToStop) {
            try { src.stop(); } catch { /* already ended or not yet started — safe to ignore */ }
        }

        const cleared = playbackQueueRef.current.length;
        playbackQueueRef.current = [];
        playbackAccumulatorRef.current = [];
        playbackAccumulatorSamplesRef.current = 0;
        isPlayingRef.current = false;
        nextPlayTimeRef.current = playbackCtxRef.current?.currentTime ?? 0;
        if (process.env.NODE_ENV === 'development') fetch('http://127.0.0.1:7337/ingest/7000f127-91ad-4ea2-ab32-21d686745005',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eed6f8'},body:JSON.stringify({sessionId:'eed6f8',location:'useAudioPipeline.ts:bargeIn',message:'bargeIn cleared queue',data:{cleared,sourcesKilled:sourcesToStop.length},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
    }, []);

    // ─── Recording ───────────────────────────────────────────────────────────
    const startRecording = async () => {
        try {
            // 16kHz AudioContext for the microphone → Gemini stream
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 16000,
            });
            recordingCtxRef.current = ctx;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            await ctx.audioWorklet.addModule('/pcm-processor.js');

            const source = ctx.createMediaStreamSource(stream);
            const workletNode = new AudioWorkletNode(ctx, 'pcm-processor');
            audioWorkletNodeRef.current = workletNode;

            let chunkCount = 0;
            workletNode.port.onmessage = (event) => {
                const payload = event.data;
                const buffer = typeof payload?.buffer !== 'undefined' ? payload.buffer : (payload as ArrayBuffer);
                const rms = typeof payload?.rms === 'number' ? payload.rms : undefined;
                const uint8 = new Uint8Array(buffer);
                let binary = '';
                for (let i = 0; i < uint8.length; i++) {
                    binary += String.fromCharCode(uint8[i]);
                }
                const canSend = !getCanSendRef || getCanSendRef.current?.() === true;
                if (canSend) {
                    onAudioInput(window.btoa(binary));
                    chunkCount++;
                    if (chunkCount % 50 === 0) {
                        console.log(`[AudioPipeline] Sent ${chunkCount} mic chunks to Gemini`);
                    }
                }
                if (typeof rms === 'number') {
                    const now = Date.now();
                    if (rms > SPEECH_RMS_THRESHOLD) {
                        if (lastSpeechTimeRef.current === 0) speechStartTimeRef.current = now;
                        lastSpeechTimeRef.current = now;
                    } else if (lastSpeechTimeRef.current > 0) {
                        const silenceDuration = now - lastSpeechTimeRef.current;
                        const speechDuration = lastSpeechTimeRef.current - speechStartTimeRef.current;
                        if (silenceDuration >= SILENCE_MS_BEFORE_TURN_COMPLETE && speechDuration >= MIN_SPEECH_MS_BEFORE_END) {
                            if (getCanSendRef?.current?.()) {
                                lastSpeechTimeRef.current = 0;
                                speechStartTimeRef.current = 0;
                                onUserStoppedSpeakingRef.current?.();
                            }
                        }
                    }
                }
            };

            // IMPORTANT: The worklet MUST be connected to destination (even silently)
            // or the Web Audio graph won't schedule process() calls.
            // A GainNode at 0 keeps the graph alive without looping mic to speakers.
            const silentGain = ctx.createGain();
            silentGain.gain.value = 0;

            source.connect(workletNode);
            workletNode.connect(silentGain);
            silentGain.connect(ctx.destination);

            setIsRecording(true);
        } catch (err) {
            console.error('Error establishing audio pipeline:', err);
            throw err;
        }
    };

    const stopRecording = useCallback(() => {
        setIsRecording(false);

        if (audioWorkletNodeRef.current) {
            audioWorkletNodeRef.current.disconnect();
            audioWorkletNodeRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (recordingCtxRef.current) {
            recordingCtxRef.current.close().catch(console.error);
            recordingCtxRef.current = null;
        }
        // Leave the playback context alive until the component unmounts
    }, []);

    /** Stop all in-flight playback without incrementing generation (used on full teardown). */
    const stopAllPlayback = useCallback(() => {
        const srcs = activeSourcesRef.current;
        activeSourcesRef.current = [];
        for (const src of srcs) { try { src.stop(); } catch { /* ignored */ } }
        playbackQueueRef.current = [];
        playbackAccumulatorRef.current = [];
        playbackAccumulatorSamplesRef.current = 0;
        isPlayingRef.current = false;
    }, []);

    useEffect(() => {
        return () => {
            stopRecording();
            stopAllPlayback();
            playbackCtxRef.current?.close().catch(console.error);
            playbackCtxRef.current = null;
            playbackGainRef.current = null;
        };
    }, [stopRecording, stopAllPlayback]);

    return { isRecording, startRecording, stopRecording, queuePlayback, bargeIn, preparePlayback, flushPlayback };
}
