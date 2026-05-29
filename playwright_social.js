import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set window size
  await page.setViewportSize({ width: 1280, height: 720 });

  // Since we can't easily login in this environment without real credentials,
  // we'll just try to visit the apps page and user profile page to see if they render without crashing.
  // Note: VITE_PUBLIC_MODE might be needed if it allows viewing without login.

  try {
    console.log('Visiting Apps page...');
    await page.goto('http://localhost:8080/apps');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'apps_page.png' });

    console.log('Visiting User Profile page...');
    await page.goto('http://localhost:8080/users/testuser'); // might redirect to login
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'user_profile.png' });

  } catch (e) {
    console.error('Error during verification:', e);
  }

  await browser.close();
})();
