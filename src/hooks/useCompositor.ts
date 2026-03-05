import { useState, useRef, useEffect, useCallback } from 'react';

// Separate screen share and camera — no mixing to reduce AI hallucination.
// Screen and camera are independent toggles. When both on, we send screen only (clearer context).
const VIDEO_FRAME_INTERVAL_MS = 3000;

export function useCompositor(onFrame: (base64: string) => void) {
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const videoRefCamera = useRef<HTMLVideoElement>(null);
    const videoRefScreen = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const screenIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const cameraIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const stopScreenShare = useCallback(() => {
        setIsScreenSharing(false);
        if (screenIntervalRef.current) {
            clearInterval(screenIntervalRef.current);
            screenIntervalRef.current = null;
        }
        if (videoRefScreen.current?.srcObject) {
            (videoRefScreen.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
            videoRefScreen.current.srcObject = null;
        }
    }, []);

    const stopCamera = useCallback(() => {
        setIsCameraOn(false);
        if (cameraIntervalRef.current) {
            clearInterval(cameraIntervalRef.current);
            cameraIntervalRef.current = null;
        }
        if (videoRefCamera.current?.srcObject) {
            (videoRefCamera.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
            videoRefCamera.current.srcObject = null;
        }
    }, []);

    const startScreenShare = useCallback(async () => {
        stopCamera();
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: 1280, height: 720 },
            });
            if (videoRefScreen.current) {
                videoRefScreen.current.srcObject = stream;
                await videoRefScreen.current.play();
            }
            setIsScreenSharing(true);
            stream.getVideoTracks()[0].onended = () => stopScreenShare();

            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            canvas.width = 1280;
            canvas.height = 720;

            screenIntervalRef.current = setInterval(() => {
                const vid = videoRefScreen.current;
                if (vid && vid.readyState >= 2) {
                    ctx.drawImage(vid, 0, 0, 1280, 720);
                    const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                    if (b64) onFrame(b64);
                }
            }, VIDEO_FRAME_INTERVAL_MS);
        } catch (err) {
            console.error('Error starting screen share:', err);
        }
    }, [onFrame, stopScreenShare, stopCamera]);

    const startCamera = useCallback(async () => {
        stopScreenShare();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
            });
            if (videoRefCamera.current) {
                videoRefCamera.current.srcObject = stream;
                await videoRefCamera.current.play();
            }
            setIsCameraOn(true);

            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            canvas.width = 640;
            canvas.height = 480;

            cameraIntervalRef.current = setInterval(() => {
                const vid = videoRefCamera.current;
                if (vid && vid.readyState >= 2) {
                    ctx.drawImage(vid, 0, 0, 640, 480);
                    const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                    if (b64) onFrame(b64);
                }
            }, VIDEO_FRAME_INTERVAL_MS);
        } catch (err) {
            console.error('Error starting camera:', err);
        }
    }, [onFrame, stopScreenShare]);

    const stopCompositor = useCallback(() => {
        stopScreenShare();
        stopCamera();
    }, [stopScreenShare, stopCamera]);

    useEffect(() => () => stopCompositor(), [stopCompositor]);

    const isCapturing = isScreenSharing || isCameraOn;

    return {
        isCapturing,
        isScreenSharing,
        isCameraOn,
        startScreenShare,
        stopScreenShare,
        startCamera,
        stopCamera,
        stopCompositor,
        videoRefCamera,
        videoRefScreen,
        canvasRef,
    };
}
