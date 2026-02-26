import { useState, useRef, useEffect, useCallback } from 'react';

// The Audio Pipeline Hook
// Handles 16kHz, 16-bit Mono PCM for input (microphone)
// Handles playback of incoming PCM 16kHz audio with Barge-in capability.
export function useAudioPipeline(onAudioInput: (base64Audio: string) => void) {
    const [isRecording, setIsRecording] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
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

            // Load the worklet from the public folder
            await ctx.audioWorklet.addModule('/pcm-processor.js');

            const source = ctx.createMediaStreamSource(stream);
            const workletNode = new AudioWorkletNode(ctx, 'pcm-processor');
            audioWorkletNodeRef.current = workletNode;

            workletNode.port.onmessage = (event) => {
                const buffer = event.data;
                const uint8 = new Uint8Array(buffer);
                let binary = '';
                // Chunk the base64 building to be hyper-safe off the worklet thread size
                for (let i = 0; i < uint8.length; i++) {
                    binary += String.fromCharCode(uint8[i]);
                }
                const base64PCM = window.btoa(binary);
                onAudioInput(base64PCM);
            };

            source.connect(workletNode);
            workletNode.connect(ctx.destination);

            setIsRecording(true);
        } catch (err) {
            console.error('Error establishing audio pipeline:', err);
        }
    };

    const stopRecording = useCallback(() => {
        setIsRecording(false);
        if (audioWorkletNodeRef.current) {
            audioWorkletNodeRef.current.disconnect();
            audioWorkletNodeRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.error);
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
