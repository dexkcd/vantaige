import { useState, useRef, useEffect, useCallback } from 'react';

// The Compositor Hook
// Captures both screen and webcam.
// Composites them onto a 1280x720 canvas at 1 FPS.
// Outputs base64 JPEG parts via a callback.
export function useCompositor(onFrame: (base64: string) => void) {
    const [isCapturing, setIsCapturing] = useState(false);
    const videoRefCamera = useRef<HTMLVideoElement>(null);
    const videoRefScreen = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const startCompositor = async () => {
        try {
            // 1. Get User Media (Camera)
            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 480, height: 360 }, // Lower res for the PiP camera
            });
            if (videoRefCamera.current) {
                videoRefCamera.current.srcObject = cameraStream;
                await videoRefCamera.current.play();
            }

            // 2. Get Display Media (Screen share)
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: 1280, height: 720 },
            });
            if (videoRefScreen.current) {
                videoRefScreen.current.srcObject = screenStream;
                await videoRefScreen.current.play();
            }

            setIsCapturing(true);

            // 3. Setup canvas & context
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // 4. Start 1 FPS loop
            intervalRef.current = setInterval(() => {
                // Draw screen full size
                if (videoRefScreen.current) {
                    ctx.drawImage(videoRefScreen.current, 0, 0, 1280, 720);
                }

                // Draw camera Picture-in-Picture (bottom right)
                if (videoRefCamera.current) {
                    const pipWidth = 320;
                    const pipHeight = 240;
                    const padding = 20;
                    ctx.drawImage(
                        videoRefCamera.current,
                        1280 - pipWidth - padding,
                        720 - pipHeight - padding,
                        pipWidth,
                        pipHeight
                    );
                }

                // Get base64 JPEG string
                const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                if (base64Data) {
                    onFrame(base64Data);
                }
            }, 1000); // 1 FPS

            // Stop handling if user closes screenshare via browser UI
            screenStream.getVideoTracks()[0].onended = () => {
                stopCompositor();
            };
        } catch (err) {
            console.error('Error starting compositor streams', err);
        }
    };

    const stopCompositor = useCallback(() => {
        setIsCapturing(false);
        if (intervalRef.current) clearInterval(intervalRef.current);

        // Stop camera tracks
        if (videoRefCamera.current && videoRefCamera.current.srcObject) {
            const stream = videoRefCamera.current.srcObject as MediaStream;
            stream.getTracks().forEach((track) => track.stop());
            videoRefCamera.current.srcObject = null;
        }

        // Stop screen tracks
        if (videoRefScreen.current && videoRefScreen.current.srcObject) {
            const stream = videoRefScreen.current.srcObject as MediaStream;
            stream.getTracks().forEach((track) => track.stop());
            videoRefScreen.current.srcObject = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            stopCompositor();
        };
    }, [stopCompositor]);

    return {
        isCapturing,
        startCompositor,
        stopCompositor,
        videoRefCamera,
        videoRefScreen,
        canvasRef
    };
}
