const Koa = require('koa')
const route = require('koa-route')
const bodyParser = require('koa-bodyparser');
const timeout = require('@uswitch/koa-timeout').default
const isMobileJs = require('ismobilejs')
const { promisify } = require('util');
const client = require('redis').createClient(process.env.REDIS)
const Limiter = require('async-limiter')
const prom = require('prom-client');
const crawlPage = require('./crawlPage')


prom.collectDefaultMetrics({ prefix: 'cc_' })
const responseTime = new prom.Histogram({
  name: 'cc_response_time',
  help: 'Response time',
  buckets: prom.linearBuckets(0, 0.005, 10)
});
const cacheHit = new prom.Counter({
  name: 'cc_cache_hit',
  help: 'cache_hit',
});
const cacheMiss = new prom.Counter({
  name: 'cc_cache_miss',
  help: 'cache_miss',
});
const errorsCount = new prom.Counter({
  name: 'cc_errors',
  help: 'all request errors',
});
const crawlingErrorsCount = new prom.Counter({
  name: 'cc_crawling_errors',
  help: 'errors in crawling script',
});
const queueSize = new prom.Gauge({
  name: 'cc_queue_size',
  help: 'Amount ok keys that should be processed',
});
const t = new Limiter({ concurrency: 1 });
const R = {
  get: promisify(client.get).bind(client),
  set: promisify(client.set).bind(client),
  del: promisify(client.del).bind(client)
}

const app = new Koa()
PROCESSING = 'PROCESSING'
app.use(route.get('/healthz', ctx => ctx.body = 'OK'))
app.use(route.get('/metrics', ctx => ctx.body = prom.register.metrics()))
app.use(timeout(20, { status: 499 }))
app.use(async (ctx, next) => {
  const end = responseTime.startTimer()
  try {
    await next()
  } catch (e) {
    console.error(e)
    errorsCount.inc()
  }
  end()
})
app.use(bodyParser())
app.use(route.post('/', async (ctx) => {
  const { headers, version, url, key: optionalKey } = ctx.request.body
  const deviceInfo = isMobileJs(headers['user-agent'])
  const deviceName = (deviceInfo.phone && 'phone') || (deviceInfo.tablet && 'tablet') || 'desktop'
  const key = `${optionalKey || url}-${version}-${deviceName}`
  const mayBeCss = await R.get(key)
  if (mayBeCss && (mayBeCss !== PROCESSING)) {
    ctx.status = 200;
    ctx.body = mayBeCss;
    cacheHit.inc()
    return
  }
  ctx.status = 404;
  ctx.body = 'Preparing css';
  cacheMiss.inc()
  if (!mayBeCss) {
    process.nextTick(async () => {
      await R.set(key, PROCESSING)
      queueSize.inc()
      t.push(async (cb) => {
        try {
          await R.set(key, await crawlPage(url, headers, key, deviceInfo.mobile))
        } catch (e) {
          console.error(e)
          R.del(key)
          crawlingErrorsCount.inc()
        } finally {
          queueSize.dec()
          cb()
        }
      })
    })
  }
}))
app.listen(3000, () => {
  console.log('started')
})