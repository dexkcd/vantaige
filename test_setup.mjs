import WebSocket from 'ws';
import fs from 'fs';

// Read api key from .env.local
const env = fs.readFileSync('.env.local', 'utf-8');
const apiKeyMatch = env.match(/GEMINI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : '';

const mmlUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

const setupMessage = {
    setup: {
        model: 'models/gemini-3-flash-preview',
        generationConfig: {
            responseModalities: ["AUDIO"]
        },
        systemInstruction: {
            parts: [{ text: `You are vantAIge.` }]
        },
        tools: [
            {
                functionDeclarations: [
                    {
                        name: 'end_session',
                        description: 'Ends the current session when the conversation is naturally finished or the user requests to leave.',
                        parameters: {
                            type: 'OBJECT',
                            properties: {},
                            required: []
                        }
                    }
                ]
            }
        ]
    }
};

const ws = new WebSocket(mmlUrl);

ws.on('open', () => {
    console.log('Connected directly to Gemini API');
    ws.send(JSON.stringify(setupMessage));
});

ws.on('message', (data) => {
    console.log('Received Message:', data.toString());
    ws.close();
});

ws.on('close', (code, reason) => {
    console.log('Gemini Live API connection closed:', code, reason.toString());
});

ws.on('error', (err) => {
    console.error('Error:', err);
});
