const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer, WebSocket } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        const { pathname } = parse(request.url);

        if (pathname === '/api/proxy') {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
    });

    wss.on('connection', (clientWs, request) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('GEMINI_API_KEY is not set');
            clientWs.close(1011, 'Server configuration error');
            return;
        }

        const host = 'generativelanguage.googleapis.com';
        const model = 'models/gemini-2.0-flash-exp'; // Ensure we use the right model (gemini-3-flash-preview requested? Wait, gemini-3-flash-preview doesn't exist yet, it's gemini-2.0-flash-exp for multimodal live, but user said `gemini-3-flash-preview`. I will use the requested model string). 
        // User quote: "gemini-3-flash-preview"
        const requestedModel = 'models/gemini-3-flash-preview';

        const url = `wss://${host}/ws/google.cloud.webrtc.v1.WebRtcSignaling/CallSession`; // Wait, Multimodal Live API is `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`
        const mmlUrl = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

        const geminiWs = new WebSocket(mmlUrl);

        geminiWs.on('open', () => {
            console.log('Connected to Gemini Live API');
        });

        geminiWs.on('message', (data) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data);
            }
        });

        clientWs.on('message', (data) => {
            if (geminiWs.readyState === WebSocket.OPEN) {
                geminiWs.send(data);
            }
        });

        geminiWs.on('close', () => {
            console.log('Gemini Live API connection closed');
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close();
            }
        });

        clientWs.on('close', () => {
            console.log('Client connection closed');
            if (geminiWs.readyState === WebSocket.OPEN) {
                geminiWs.close();
            }
        });

        geminiWs.on('error', (error) => {
            console.error('Gemini connection error:', error);
        });

        clientWs.on('error', (error) => {
            console.error('Client connection error:', error);
        });
    });

    server.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
});
