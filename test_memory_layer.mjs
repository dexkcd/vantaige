import WebSocket from 'ws';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSession1() {
    console.log("=== Starting Session 1 ===");
    const ws = new WebSocket('ws://localhost:3000/api/proxy');

    return new Promise((resolve) => {
        ws.on('open', async () => {
            console.log("Connected to API Proxy...");

            // Wait a moment before sending text
            await delay(2000);

            // Send the identity update
            const message = {
                clientContent: {
                    turns: [{ role: 'user', parts: [{ text: 'Can you use the upsert_vibe_profile tool to set my brand identity to "My brand color is Electric Blue"?' }] }],
                    turnComplete: true
                }
            };
            ws.send(JSON.stringify(message));
            console.log("Sent user message asking to update brand color.");
        });

        ws.on('message', (data) => {
            const resp = JSON.parse(data.toString());
            if (resp.serverContent?.modelTurn) {
                const parts = resp.serverContent.modelTurn.parts;
                for (const part of parts) {
                    if (part.functionCall) {
                        console.log("Received Function Call:", part.functionCall);
                    }
                    if (part.text) {
                        console.log("Gemini:", part.text);
                    }
                }
            }
        });

        setTimeout(() => {
            console.log("Closing Session 1...");
            ws.close();
            resolve();
        }, 8000);
    });
}

async function runSession2() {
    console.log("\n=== Starting Session 2 ===");
    const ws = new WebSocket('ws://localhost:3000/api/proxy');

    return new Promise((resolve) => {
        ws.on('open', async () => {
            console.log("Connected to API Proxy...");

            // Give time for setup to settle
            await delay(2000);

            const message = {
                clientContent: {
                    turns: [{ role: 'user', parts: [{ text: 'What is my brand color?' }] }],
                    turnComplete: true
                }
            };
            ws.send(JSON.stringify(message));
            console.log("Sent user message asking about brand color.");
        });

        ws.on('message', (data) => {
            const resp = JSON.parse(data.toString());
            if (resp.serverContent?.modelTurn) {
                const parts = resp.serverContent.modelTurn.parts;
                for (const part of parts) {
                    if (part.text) {
                        console.log("Gemini:", part.text);
                    }
                }
            }
        });

        setTimeout(() => {
            console.log("Closing Session 2...");
            ws.close();
            resolve();
        }, 8000);
    });
}

async function main() {
    await runSession1();
    console.log("Waiting 5 seconds for background summarization...");
    await delay(5000); // Wait for background summary saving logic
    await runSession2();
    console.log("Done checking output. Manually verify output.");
    process.exit(0);
}

main();
