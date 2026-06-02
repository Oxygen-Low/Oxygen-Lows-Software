const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  // Set up local storage for mock auth if needed, or just visit the pages
  // Since we are in a dev environment without a real supabase backend running,
  // we might just see the login page.

  try {
    await page.goto('http://localhost:8080/apps');
    await page.screenshot({ path: 'apps_page.png' });

    await page.goto('http://localhost:8080/account');
    await page.screenshot({ path: 'account_page.png' });
  } catch (e) {
    console.log("Could not connect to dev server, skipping screenshots");
  }

  await browser.close();
})();
