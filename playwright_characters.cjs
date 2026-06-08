const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set storage state for auth
  const storageState = {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:8080',
        localStorage: [
          {
            name: 'sb-vqmukrmpgvavscsyefqd-auth-token',
            value: JSON.stringify({
              access_token: 'fake-token',
              refresh_token: 'fake-refresh',
              user: { id: '00000000-0000-0000-0000-000000000000', email: 'test@example.com' }
            })
          }
        ]
      }
    ]
  };
  await page.context().addInitScript((storageState) => {
    window.localStorage.setItem('sb-vqmukrmpgvavscsyefqd-auth-token', storageState.origins[0].localStorage[0].value);
  }, storageState);

  try {
    await page.goto('http://localhost:8080/characters');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'characters_page.png' });
    console.log('Took characters_page.png');

    await page.click('text=New Character');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'new_character_dialog.png' });
    console.log('Took new_character_dialog.png');

    await page.goto('http://localhost:8080/apps');
    await page.waitForLoadState('networkidle');
    // Assuming Chatbot is one of the apps
    await page.click('text=Chatbot');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'chatbot_with_characters.png' });
    console.log('Took chatbot_with_characters.png');

  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
