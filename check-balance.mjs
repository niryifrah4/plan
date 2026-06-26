import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[${msg.type()}] ${msg.text()}`);
    }
  });
  
  page.on('pageerror', err => {
    console.log(`[pageerror] ${err.message}`);
    console.log(err.stack);
  });
  
  try {
    console.log("Navigating to /balance...");
    await page.goto('http://localhost:5173/balance', { waitUntil: 'networkidle', timeout: 10000 });
    console.log("Waiting 3s for render...");
    await page.waitForTimeout(3000);
    console.log("Done.");
  } catch (err) {
    console.log("Navigation error:", err.message);
  } finally {
    await browser.close();
  }
})();
