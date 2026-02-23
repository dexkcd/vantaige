import { useState, useRef, useEffect, useCallback } from 'react';

// The Audio Pipeline Hook
// Handles 16kHz, 16-bit Mono PCM for input (microphone)
// Handles playback of incoming PCM 16kHz audio with Barge-in capability.
export function useAudioPipeline(onAudioInput: (base64Audio: string) => void) {
    const [isRecording, setIsRecording] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null); // Note: AudioWorklet is better, but ScriptProcessor is simpler for inline demo
    const playbackQueueRef = useRef<Int16Array[]>([]);
    const isPlayingRef = useRef(false);
    const nextPlayTimeRef = useRef(0);

    // Buffer management for playback
    const scheduleAudioPlayback = useCallback(() => {
        if (!audioContextRef.current || playbackQueueRef.current.length === 0) {
            isPlayingRef.current = false;
            return;
        }

        isPlayingRef.current = true;
        const ctx = audioContextRef.current;

        // Dequeue next chunk
        const pcmData = playbackQueueRef.current.shift()!;

        // Convert Int16 (PCM) to Float32 array for playback
        const float32Array = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
            const s = Math.max(-1, Math.min(1, pcmData[i] / 32768));
            float32Array[i] = s;
        }

        const buffer = ctx.createBuffer(1, float32Array.length, 16000);
        buffer.copyToChannel(float32Array, 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        // Schedule slightly in the future to avoid clipping
        const currentTime = ctx.currentTime;
        const playTime = Math.max(currentTime, nextPlayTimeRef.current);

        source.start(playTime);
        nextPlayTimeRef.current = playTime + buffer.duration;

        source.onended = () => {
            scheduleAudioPlayback();
        };
    }, []);

    const queuePlayback = useCallback((base64Pcm: string) => {
        // Decode base64 to binary string
        const binaryStr = window.atob(base64Pcm);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        // Int16Array from the bytes
        const pcm16 = new Int16Array(bytes.buffer);

        playbackQueueRef.current.push(pcm16);

        if (!isPlayingRef.current) {
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume();
            }
            nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
            scheduleAudioPlayback();
        }
    }, [scheduleAudioPlayback]);

    const bargeIn = useCallback(() => {
        // Clear the queue entirely immediately.
        // In a more complex AudioWorklet setup we would flush the audio context perfectly,
        // but here we just drop upcoming chunks to simulate the barge in immediately.
        playbackQueueRef.current = [];
        nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
    }, []);

    const startRecording = async () => {
        try {
            // 16kHz for Gemini Multimodal Native
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 16000,
            });
            audioContextRef.current = ctx;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const source = ctx.createMediaStreamSource(stream);
            // Deprecated but highly standard for 16-bit PCM conversion without an external worklet file.
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0); // Float32
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    // Convert back to 16-bit PCM
                    let s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                // Base64 encode the Int16Array
                const uint8 = new Uint8Array(pcm16.buffer);
                let binary = '';
                const chunkSize = 8192;
                // avoid maximum call stack size exceeded on large chunks
                for (let i = 0; i < uint8.length; i += chunkSize) {
                    const chunk = uint8.subarray(i, i + chunkSize);
                    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
                }
                const base64PCM = window.btoa(binary);
                onAudioInput(base64PCM);
            };

            source.connect(processor);
            processor.connect(ctx.destination);

            setIsRecording(true);
        } catch (err) {
            console.error('Error establishing audio pipeline:', err);
        }
    };

    const stopRecording = useCallback(() => {
        setIsRecording(false);
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, [stopRecording]);

    return {
        isRecording,
        startRecording,
        stopRecording,
        queuePlayback,
        bargeIn
    };
}
