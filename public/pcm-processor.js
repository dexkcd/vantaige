class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];
            const pcm16 = new Int16Array(channelData.length);
            let sumSq = 0;

            for (let i = 0; i < channelData.length; i++) {
                let s = Math.max(-1, Math.min(1, channelData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                const n = pcm16[i] / 32768;
                sumSq += n * n;
            }

            const rms = Math.sqrt(sumSq / channelData.length) * 32768;
            this.port.postMessage({ buffer: pcm16.buffer, rms }, [pcm16.buffer]);
        }
        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);
