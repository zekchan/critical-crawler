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
    width: 600,
    height: 1500
}

const DESKTOP_SIZES = {
    width: 3000,
    height: 1500
}

if (!CHROME_BIN) {
    throw new Error('CHROME_BIN env variable is mandatory!')
}

async function waitForJSIdle(page) {
    return page.evaluate(() => {
        return new Promise(resolve => {
            requestIdleCallback(resolve)
        })
    });
}
function responseIsCss(response) {
    return response.request().resourceType() === 'stylesheet' || response.url().endsWith('.css')
}
async function crawlPage(url, headers, key, isMobile) {
    const killTimeout = setTimeout(() => {
        console.error({ url, key, info: 'timeout' });
        process.exit(1);
    }, 3 * 60 * 1000);
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
        if (responseIsCss(response)) {
            allCss.push(await response.text())
            console.log('New CSS')
            console.log(response.url())
        }
    });
    const UA = headers['User-Agent'] || headers['User-agent'] || headers['user-agent']
    await page.setExtraHTTPHeaders(headers)
    if (UA) {
        await page.setUserAgent(UA)
    }
    if (isMobile) {
        await page.setViewport({
            ...MOBILE_SIZES,
            isMobile: true,
            hasTouch: true
        })
    } else {
        await page.setViewport(DESKTOP_SIZES)
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
    if (allCss.length === 0) {
        throw new Error('No css!')
    }
    console.log('Html got')
    await page.close()
    const criticalCss = await penthouse({
        url: url,
        keepLargerMediaQueries: true,
        userAgent: UA,
        customPageHeaders: headers,
        cssString: allCssString,
        renderWaitTime: 10000,
        maxEmbeddedBase64Length: 10000,
        blockJSRequests: false,
        puppeteer: {
            getBrowser: () => browser
        },
        ...(isMobile ? MOBILE_SIZES : DESKTOP_SIZES)
    })

    console.log('Critical css got')
    await browser.close()

    console.log('Browser closed')
    clearTimeout(killTimeout)
    end()
    return criticalCss;
}

module.exports = crawlPage