const Koa = require('koa')
const route = require('koa-route')
const bodyParser = require('koa-bodyparser');
const isMobileJs = require('ismobilejs')
const { promisify } = require('util');
const client = require('redis').createClient(process.env.REDIS)
const Limiter = require('async-limiter')
const crawlPage = require('./crawlPage')

const t = new Limiter({ concurrency: 1 });
const R = {
  get: promisify(client.get).bind(client),
  set: promisify(client.set).bind(client),
  del: promisify(client.del).bind(client)
}

const app = new Koa()
PROCESSING = 'PROCESSING'
app.use(route.get('/healthz', ctx => ctx.body = 'OK'))
app.use(bodyParser())
app.use(route.post('/', async (ctx) => {
  const { headers, version, url } = ctx.request.body
  const deviceInfo = isMobileJs(headers['user-agent'])
  const deviceName = (deviceInfo.phone && 'phone') || (deviceInfo.tablet && 'tablet') || 'desktop'
  const key = `${url}-${version}-${deviceName}`
  const mayBeCss = await R.get(key)
  if (!mayBeCss || (mayBeCss === PROCESSING)) {
    ctx.status = 404;
    ctx.body = 'Preparing css';
    t.push(async (cb) => {
      try {
        await R.set(key, await crawlPage(url, headers, key))
      } catch (e) {
        console.error(e)
        R.del(key)
      }
      cb()
    })
    await R.set(key, PROCESSING)
  } else {
    ctx.status = 200;
    ctx.body = mayBeCss;
  }
}))
app.listen(3000, () => {
  console.log('started')
})