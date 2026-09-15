import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('requestfailed', request => {
    console.log(`Request failed: ${request.url()} - ${request.failure().errorText}`);
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    console.log(await page.title());
  } catch (e) {
    console.error(e);
  }

  await browser.close();
})();
