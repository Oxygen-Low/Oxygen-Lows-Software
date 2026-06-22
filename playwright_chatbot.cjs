const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:8080/apps');
    // Assertion before screenshot
    await page.waitForSelector('h2:has-text("Apps")');
    await page.screenshot({ path: 'apps_page.png' });

    await page.goto('http://localhost:8080/account');
    // Assertion before screenshot
    await page.waitForSelector('h1:has-text("Account")');
    await page.screenshot({ path: 'account_page.png' });
  } catch (e) {
    console.error("Navigation or screenshot failed:", e);
    process.exit(1);
  }

  await browser.close();
})();
