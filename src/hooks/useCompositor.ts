import { useState, useRef, useEffect, useCallback } from 'react';

// Separate screen share and camera — no mixing to reduce AI hallucination.
// Screen and camera are independent toggles. When both on, we send screen only (clearer context).
const VIDEO_FRAME_INTERVAL_MS = 3000;
const CAMERA_WIDTH = 640;
const CAMERA_HEIGHT = 480;

export type CameraFacingMode = 'user' | 'environment';

export function getOppositeFacingMode(mode: CameraFacingMode): CameraFacingMode {
    return mode === 'user' ? 'environment' : 'user';
}

export function getCameraConstraintCandidates(facingMode: CameraFacingMode): MediaTrackConstraints[] {
    return [
        { width: CAMERA_WIDTH, height: CAMERA_HEIGHT, facingMode: { exact: facingMode } },
        { width: CAMERA_WIDTH, height: CAMERA_HEIGHT, facingMode },
        { width: CAMERA_WIDTH, height: CAMERA_HEIGHT },
    ];
}

export function useCompositor(onFrame: (base64: string) => void) {
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>('user');
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

    const clearCameraFeed = useCallback(() => {
        if (cameraIntervalRef.current) {
            clearInterval(cameraIntervalRef.current);
            cameraIntervalRef.current = null;
        }
        if (videoRefCamera.current?.srcObject) {
            (videoRefCamera.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
            videoRefCamera.current.srcObject = null;
        }
    }, []);

    const stopCamera = useCallback(() => {
        setIsCameraOn(false);
        clearCameraFeed();
    }, [clearCameraFeed]);

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

    const startCamera = useCallback(async (preferredFacingMode?: CameraFacingMode) => {
        stopScreenShare();
        clearCameraFeed();
        const targetFacingMode = preferredFacingMode ?? cameraFacingMode;
        try {
            let stream: MediaStream | null = null;
            let lastError: unknown;
            const candidateConstraints = getCameraConstraintCandidates(targetFacingMode);
            for (const constraints of candidateConstraints) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
                    break;
                } catch (err) {
                    lastError = err;
                }
            }
            if (!stream) {
                throw lastError ?? new Error('No camera stream available');
            }

            const detectedFacingMode = stream.getVideoTracks()[0]?.getSettings()?.facingMode;
            if (detectedFacingMode === 'user' || detectedFacingMode === 'environment') {
                setCameraFacingMode(detectedFacingMode);
            } else {
                setCameraFacingMode(targetFacingMode);
            }

            if (videoRefCamera.current) {
                videoRefCamera.current.srcObject = stream;
                await videoRefCamera.current.play();
            }
            setIsCameraOn(true);

            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            canvas.width = CAMERA_WIDTH;
            canvas.height = CAMERA_HEIGHT;

            cameraIntervalRef.current = setInterval(() => {
                const vid = videoRefCamera.current;
                if (vid && vid.readyState >= 2) {
                    ctx.drawImage(vid, 0, 0, CAMERA_WIDTH, CAMERA_HEIGHT);
                    const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                    if (b64) onFrame(b64);
                }
            }, VIDEO_FRAME_INTERVAL_MS);
        } catch (err) {
            console.error('Error starting camera:', err);
        }
    }, [cameraFacingMode, clearCameraFeed, onFrame, stopScreenShare]);

    const toggleCameraFacingMode = useCallback(async () => {
        const nextFacingMode = getOppositeFacingMode(cameraFacingMode);
        if (!isCameraOn) {
            setCameraFacingMode(nextFacingMode);
            return;
        }
        await startCamera(nextFacingMode);
    }, [cameraFacingMode, isCameraOn, startCamera]);

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
        cameraFacingMode,
        startScreenShare,
        stopScreenShare,
        startCamera,
        stopCamera,
        toggleCameraFacingMode,
        stopCompositor,
        videoRefCamera,
        videoRefScreen,
        canvasRef,
    };
}
