const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer, WebSocket } = require('ws');
const { loadEnvConfig } = require('@next/env');
const fs = require('fs');
const DEBUG_LOG_PATH = '/home/dexkcd/code/vantaige/.cursor/debug-eed6f8.log';
function debugLog(obj) {
    try {
        fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ ...obj, timestamp: Date.now() }) + '\n');
    } catch (_) {}
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

// Load environment variables from .env.local etc.
loadEnvConfig(process.cwd());

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
            // #region agent log
            debugLog({ sessionId: 'eed6f8', location: 'server.js:connection', message: 'Closing client: GEMINI_API_KEY not set', data: {}, hypothesisId: 'H2' });
            // #endregion
            console.error('GEMINI_API_KEY is not set');
            clientWs.close(1011, 'Server configuration error');
            return;
        }

        const host = 'generativelanguage.googleapis.com';
        // This is the Multimodal Live API endpoint. 
        // Note: The model is specified in the 'setup' message payload, not the URL itself for BidiGenerateContent.
        const mmlUrl = `wss://${host}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

        console.log('PROXY: Connecting to Gemini Multimodal Live API...');
        const geminiWs = new WebSocket(mmlUrl);
        const messageQueue = [];

        geminiWs.on('open', () => {
            console.log('PROXY [V2]: Connected to Gemini Live API');
            // Drain the buffer
            while (messageQueue.length > 0) {
                const queuedData = messageQueue.shift();
                console.log(`PROXY: Sending buffered message to Gemini (${queuedData.length} bytes)`);
                geminiWs.send(queuedData);
            }
        });

        clientWs.on('message', (data) => {
            const message = data.toString();
            try {
                const parsed = JSON.parse(message);
                if (parsed.setup) {
                    console.log('PROXY: Received SETUP from Client for model:', parsed.setup.model);
                } else if (parsed.clientContent) {
                    console.log('PROXY: Received TEXT from Client');
                } else if (parsed.realtimeInput) {
                    // Don't log full binary chunks, just count
                } else {
                    console.log('PROXY: Received OTHER from Client:', Object.keys(parsed));
                }
            } catch (e) {
                console.log('PROXY: Received non-JSON from Client');
            }

            if (geminiWs.readyState === WebSocket.OPEN) {
                geminiWs.send(data);
            } else if (geminiWs.readyState === WebSocket.CONNECTING) {
                messageQueue.push(data);
            } else {
                console.warn('PROXY: Gemini socket not open/connecting, dropping message');
            }
        });

        geminiWs.on('message', (data) => {
            const message = data.toString();
            try {
                const parsed = JSON.parse(message);
                if (parsed.setupComplete) {
                    console.log('PROXY: Gemini responded with SetupComplete');
                } else if (parsed.error) {
                    console.error('PROXY: Gemini responded with ERROR:', parsed.error);
                } else if (parsed.serverContent) {
                    // Log text/tool calls, don't log audio blobs
                    const sc = parsed.serverContent;
                    if (sc.modelTurn) {
                        const texts = sc.modelTurn.parts.filter(p => p.text).map(p => p.text);
                        const tools = sc.modelTurn.parts.filter(p => p.functionCall).map(p => p.functionCall.name);
                        if (texts.length) console.log('PROXY: Gemini said:', texts.join(' '));
                        if (tools.length) console.log('PROXY: Gemini called tools:', tools.join(', '));
                    }
                } else if (parsed.toolCall) {
                    console.log('PROXY: Gemini called tools (top-level):', parsed.toolCall.functionCalls?.map(f => f.name));
                }
            } catch (e) {
                // Ignore parse errors (likely binary blobs)
            }

            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data);
            }
        });

        geminiWs.on('close', (code, reason) => {
            // #region agent log
            debugLog({ sessionId: 'eed6f8', location: 'server.js:geminiWs.close', message: 'Gemini closed upstream', data: { code, reason: reason && reason.toString() }, hypothesisId: 'H3' });
            // #endregion
            console.log(`PROXY: Gemini Live API connection closed. Code: ${code}, Reason: ${reason.toString()}`);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close();
            }
        });

        clientWs.on('close', (code, reason) => {
            console.log(`PROXY [V2]: Client connection closed. Code: ${code}, Reason: ${reason.toString()}`);
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
