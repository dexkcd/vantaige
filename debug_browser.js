const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome' });
    // Grant microphone and camera permissions
    const context = await browser.newContext({
        permissions: ['microphone', 'camera']
    });
    const page = await context.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning' || true) {
            console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
        }
    });

    page.on('pageerror', error => {
        console.log(`[BROWSER EXCEPTION] ${error.message}`);
    });

    console.log("Navigating to localhost:3000...");
    await page.goto('http://localhost:3000');

    console.log("Waiting for Connect button...");
    const connectBtn = page.getByRole('button', { name: /Connect/i });
    await connectBtn.waitFor({ state: 'visible' });

    console.log("Clicking Connect...");
    await connectBtn.click();

    console.log("Waiting 3 seconds to catch errors...");
    await page.waitForTimeout(3000);

    console.log("Closing browser...");
    await browser.close();
})();
