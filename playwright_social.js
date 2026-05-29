import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set window size
  await page.setViewportSize({ width: 1280, height: 720 });

  try {
    console.log('Visiting Apps page...');
    const response = await page.goto('http://localhost:8080/apps');
    if (!response || response.status() >= 400) {
      throw new Error(`Failed to load Apps page: ${response?.status() || 'No response'}`);
    }
    await page.waitForTimeout(2000);

    console.log('Visiting User Profile page...');
    const profileResponse = await page.goto('http://localhost:8080/users/testuser');
    if (profileResponse && profileResponse.status() >= 500) {
       throw new Error(`Profile page status: ${profileResponse.status()}`);
    }
    await page.waitForTimeout(2000);

    console.log('Verification successful');
  } catch (e) {
    console.error('Error during verification:', e);
    process.exit(1);
  }

  await browser.close();
})();
