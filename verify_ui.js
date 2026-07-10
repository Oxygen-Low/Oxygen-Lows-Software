import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const page = await browser.newPage();

  // Go to the auth page (which should show the badge even without login)
  await page.goto("http://localhost:8080/auth");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "auth_page_badge.png" });

  const badgeExists = await page
    .locator('img[alt="Aikido Security Audit Report"]')
    .count();
  console.log(`Badge count on Auth page: ${badgeExists}`);

  await browser.close();
  process.exit(badgeExists > 0 ? 0 : 1);
})();
