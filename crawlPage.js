const puppeteer = require('puppeteer-core')
const penthouse = require('penthouse')
const md5 = require('md5');
const path = require('path');
const fs = require('fs').promises
const prom = require('prom-client');

const crawlingTime = new prom.Histogram({
  name: 'cc_crawling_time',
  help: 'Crawling time',
  buckets: prom.linearBuckets(5, 1, 10)
});

const DEBUG = process.env.DEBUG === 'true'
const CHROME_BIN = process.env.CHROME_BIN

const MOBILE_SIZES = {
  width: 400,
  height: 800
}

const DESKTOP_SIZES = {
  width: 1440,
  height: 900
}

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
  console.log('Browser launched')
  const page = await browser.newPage()
  console.log('Tab created')
  const allCss = []
  page.on('response', async response => {
    if (response.request().resourceType() === 'stylesheet') {
      allCss.push(await response.text())
      console.log('New CSS')
      console.log(response.url())
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
  
  console.log('Opening page')
  await page.goto(url, {
    waitUntil: [
      'networkidle0',
      'load',
      'domcontentloaded'
    ]
  })
  console.log('Page opened')
  await waitForJSIdle(page)
  console.log('Page idle')
  const allCssString = allCss.join('\n')
  await page.addStyleTag({ content: allCssString })
  await page.waitFor(5000)
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  console.log('Html got')
  await page.close()
  const fileName = path.resolve(__dirname, `${md5(key)}.html`)
  await fs.writeFile(fileName, html)
  const criticalCss = await penthouse({
    url: `file:///${fileName}`,
    keepLargerMediaQueries: true,
    userAgent: headers['user-agent'],
    customPageHeaders: headers,
    cssString: allCssString,
    renderWaitTime: 4000,
    blockJSRequests: false,
    puppeteer: {
      getBrowser: () => browser
    },
    ...(isMobile ? MOBILE_SIZES : DESKTOP_SIZES)
  })
  
  console.log('Critical css got')
  await browser.close()
  
  console.log('Browser closed')
  await fs.unlink(fileName)
  end()
  return criticalCss;
}

module.exports = crawlPage
