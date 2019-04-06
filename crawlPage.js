const puppeteer = require('puppeteer-core')
const penthouse = require('penthouse')
const md5 = require('md5');
const path = require('path');
const fs = require('fs').promises

const DEBUG = process.env.DEBUG === 'true'
const CHROME_BIN = process.env.CHROME_BIN

if (!CHROME_BIN) {
  throw new Error('CHROME_BIN env variable is mandatory!')
}

let jobsDone = 0;

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      let totalHeight = 0;
      const distance = 100;
      function scrollTick() {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          return resolve();
        }
        requestIdleCallback(scrollTick)
      }
      scrollTick()
    });
  });
}
async function crawlPage(url, headers, key) {
  const id = jobsDone
  console.time(id)
  const browser = await puppeteer.launch({
    headless: !DEBUG,
    ignoreHTTPSErrors: true,
    args: ['--disable-setuid-sandbox', '--no-sandbox'],
    executablePath: process.env.CHROME_BIN
  })
  const page = await browser.newPage()
  const allCss = []
  page.on('response', async response => {
    if (response.request().resourceType() === 'stylesheet') {
      allCss.push(await response.text())
    }
  });
  await page.setExtraHTTPHeaders(headers)
  if (headers['user-agent']) {
    await page.setUserAgent(headers['user-agent'])
  }
  await page.goto(url, {
    waitUntil: 'networkidle0'
  })
  await autoScroll(page)
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  await page.close()
  const allCssString = allCss.join('\n')
  const fileName = path.resolve(__dirname, `${md5(key)}.html`)
  await fs.writeFile(fileName, html)
  const criticalCss = await penthouse({
    url: `file:///${fileName}`,
    keepLargerMediaQueries: true,
    userAgent: headers['user-agent'],
    customPageHeaders: headers,
    cssString: allCssString,
    propertiesToRemove: [],
    puppeteer: {
      getBrowser: () => browser
    }
  })
  await browser.close()
  await fs.unlink(fileName)
  console.timeEnd(id)
  jobsDone++
  return criticalCss;
}

module.exports = crawlPage