import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  console.log('Starting Vite server...');
  const server = await createServer({
    server: { port: 5174, host: '127.0.0.1' },
    root: process.cwd(),
  });
  await server.listen();

  console.log('Server started. Launching Puppeteer...');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1400, height: 900 });

  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle2' });

  const takeThemeScreenshot = async (themeName, filename) => {
    await page.evaluate((theme) => {
      localStorage.setItem('afk-theme', JSON.stringify(theme));
      localStorage.setItem('afk-showAfkColumn', JSON.stringify(false));
      localStorage.setItem('afk-showEconomicsColumn', JSON.stringify(false));
      localStorage.setItem('afk-showGeLimitColumn', JSON.stringify(false));
      localStorage.setItem('afk-showGpXpColumn', JSON.stringify(false));
    }, themeName);
    
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    
    await page.screenshot({ 
      path: filename, 
      clip: { x: 0, y: 0, width: 700, height: 900 }
    });
  };

  await takeThemeScreenshot('dark', 'dark.png');
  await takeThemeScreenshot('light', 'light.png');
  await takeThemeScreenshot('rsmode', 'rsmode.png');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 30px;
            background: #1f2937; 
            display: flex;
            gap: 30px;
            justify-content: center;
          }
          .screenshot {
            display: flex;
            flex-direction: column;
            align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #d1d5db;
          }
          img {
            width: 700px;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
          }
          h2 { margin-bottom: 20px; font-weight: 600; letter-spacing: 1px; font-size: 24px; }
        </style>
      </head>
      <body>
        <div class="screenshot">
          <h2>Dark Mode</h2>
          <img src="file://${process.cwd().replace(/\\/g, '/')}/dark.png" />
        </div>
        <div class="screenshot">
          <h2>Light Mode</h2>
          <img src="file://${process.cwd().replace(/\\/g, '/')}/light.png" />
        </div>
        <div class="screenshot">
          <h2>OSRS Mode</h2>
          <img src="file://${process.cwd().replace(/\\/g, '/')}/rsmode.png" />
        </div>
      </body>
    </html>
  `;
  
  fs.writeFileSync('composite.html', htmlContent);
  
  const compPage = await browser.newPage();
  await compPage.setViewport({ width: 2250, height: 1000 });
  
  await compPage.goto(`file://${process.cwd().replace(/\\/g, '/')}/composite.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));
  
  await compPage.screenshot({ path: 'previews.png', fullPage: true });

  await browser.close();
  
  fs.unlinkSync('dark.png');
  fs.unlinkSync('light.png');
  fs.unlinkSync('rsmode.png');
  fs.unlinkSync('composite.html');
  
  await server.close();
  console.log('Successfully generated previews.png');
  process.exit(0);
})();
