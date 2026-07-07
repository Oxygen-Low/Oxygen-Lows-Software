const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Perform login flow for the seeded test user
    await page.goto("http://localhost:8080/auth");
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "password123"); // Assuming seeded user password
    await page.click('button[type="submit"]');

    // Wait for navigation or successful login indication
    await page.waitForURL("http://localhost:8080/");

    // Now navigate to characters
    await page.goto("http://localhost:8080/characters");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "characters_page.png" });
    console.log("Took characters_page.png");

    await page.click("text=New Character");
    await page.waitForSelector('[role="dialog"]', { state: "visible" });
    await page.screenshot({ path: "new_character_dialog.png" });
    console.log("Took new_character_dialog.png");

    await page.goto("http://localhost:8080/apps");
    await page.waitForLoadState("networkidle");
    // Assuming Chatbot is one of the apps
    await page.click("text=Chatbot");
    await page.waitForSelector('[role="dialog"]', { state: "visible" });
    await page.screenshot({ path: "chatbot_with_characters.png" });
    console.log("Took chatbot_with_characters.png");
  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
