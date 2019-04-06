const puppeteer = require('puppeteer-core')
const penthouse = require('penthouse')
const md5 = require('md5');
const path = require('path');
const fs = require('fs').promises
const prom = require('prom-client');

const crawlingTime = new prom.Histogram({
  name: 'cc_crawling_time',
  help: 'Crawling time',
  buckets: prom.linearBuckets(2000, 2000, 10)
});

const DEBUG = process.env.DEBUG === 'true'
const CHROME_BIN = process.env.CHROME_BIN

if (!CHROME_BIN) {
  throw new Error('CHROME_BIN env variable is mandatory!')
}

async function waitForJSIdle(page) {
  return  page.evaluate(() => {
    return new Promise(resolve => {
      requestIdleCallback(resolve)
    })
  });
}
async function crawlPage(url, headers, key, isMobile) {
  const end = crawlingTime.startTimer()
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
  if (isMobile) {
    await page.setViewport({
      width: 1024,
      height: 1000,
      isMobile: true,
      hasTouch: true
    })
  } else {
    await page.setViewport({
      width: 1440,
      height: 2000,
    })
  }
  await page.goto(url, {
    waitUntil: [
      'networkidle0',
      'load',
      'domcontentloaded'
    ]
  })
  await waitForJSIdle(page)
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
  end()
  return criticalCss;
}

module.exports = crawlPage