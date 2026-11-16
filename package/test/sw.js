const test = require('tape')
const vm = require('node:vm')
const path = require('node:path')
const { buildSync } = require('esbuild')

const bundle = buildSync({
  entryPoints: [path.join(__dirname, '../src/sw.js')],
  bundle: true,
  write: false,
  define: { DEV: 'false' }
}).outputFiles[0].text

function worker({ files = {}, cached = {}, origin = 'https://boot.example' } = {}) {
  const handlers = {}
  const requests = []
  const entries = new Map(Object.entries(cached).map(([url, body]) => [new URL(url, origin).href, new Response(body)]))
  const state = { claimed: false, skipped: false }
  const waits = []
  const key = (url) => new URL(typeof url === 'string' ? url : url.url, origin).href
  const fetch = async (url) => {
    requests.push(typeof url === 'string' ? url : url.url)
    const file = files[key(url)] ?? files[new URL(key(url)).pathname]
    if (file instanceof Error) { throw file }
    return file === undefined ? new Response('missing', { status: 404 }) : new Response(file)
  }
  const cache = {
    put: async (url, response) => { entries.set(key(url), response.clone()) },
    match: async (url) => entries.get(key(url))?.clone(),
    addAll: async (urls) => {
      const responses = await Promise.all(urls.map(fetch))
      if (responses.some((response) => !response.ok)) { throw new Error('Cannot cache missing asset') }
      await Promise.all(urls.map((url, i) => cache.put(url, responses[i])))
    }
  }
  const context = {
    console, URL, TextEncoder, TextDecoder, Request, Response, Headers, Event,
    fetch,
    self: {
      location: { origin },
      addEventListener: (name, handler) => { handlers[name] = handler },
      skipWaiting: () => { state.skipped = true },
      clients: { claim: async () => { state.claimed = true } }
    },
    caches: {
      open: async () => cache,
      match: cache.match
    }
  }
  vm.runInNewContext(bundle, context)
  const waitUntil = (promise) => waits.push(promise)
  return {
    state, requests, cache,
    install: async () => {
      handlers.install({ waitUntil })
      await Promise.all(waits)
      handlers.activate({ waitUntil })
      await Promise.all(waits)
    },
    fetch: (url) => {
      let response
      handlers.fetch({
        request: new Request(new URL(url, origin)),
        waitUntil,
        respondWith: (promise) => { response = promise }
      })
      return response
    }
  }
}

const assets = {
  '/sw.js': 'worker',
  '/bundle.js': 'bootloader',
  '/assets/favicon.png': 'icon',
  '/assets/style.css': 'styles'
}

test('service worker installs when index.html exists and root is missing', async (t) => {
  const sw = worker({ files: { ...assets, '/index.html': 'R2 index' } })
  await sw.install()
  t.ok(sw.state.skipped, 'installs immediately')
  t.ok(sw.state.claimed, 'claims clients')
  t.equal(sw.requests[0], '/index.html', 'tries the full filename first')
  t.notOk(sw.requests.includes('/'), 'does not require the missing root URL')
  for (const url of ['/', '/index.html', '/duck']) {
    t.equal(await (await sw.fetch(url)).text(), 'R2 index', 'serves cached index for ' + url)
  }
  for (const [url, body] of Object.entries(assets)) {
    t.equal(await (await sw.fetch(url)).text(), body, 'serves cached asset ' + url)
  }
  t.equal(sw.requests.length, 5, 'cached navigation and assets need no further network requests')
  t.equal(sw.fetch('https://api.example/data'), undefined, 'leaves ordinary cross-origin API requests to the browser')
  t.end()
})

test('service worker falls back to root after an index HTTP error', async (t) => {
  const sw = worker({ files: { ...assets, '/': 'gateway index' } })
  await sw.install()
  t.deepEqual(sw.requests.slice(0, 2), ['/index.html', '/'], 'tries the full filename before root')
  t.equal(await (await sw.cache.match('/index.html')).text(), 'gateway index', 'caches fallback under the canonical filename')
  t.equal(await (await sw.fetch('/filter/lion')).text(), 'gateway index', 'SPA routes use the cached fallback')
  t.end()
})

test('service worker falls back to root after an index network error', async (t) => {
  const sw = worker({ files: { ...assets, '/index.html': new Error('network unavailable'), '/': 'gateway index' } })
  await sw.install()
  t.equal(await (await sw.fetch('/index.html')).text(), 'gateway index', 'network error does not prevent root fallback')
  t.end()
})

test('service worker rejects installation when neither entry page exists', async (t) => {
  const sw = worker({ files: assets })
  try {
    await sw.install()
    t.fail('installation should fail')
  } catch (err) {
    t.ok(err.message.includes('/index.html or /'), 'reports both missing entry paths')
  }
  t.notOk(sw.state.claimed, 'failed worker does not activate')
  t.end()
})

test('cached index.html takes precedence and older root caches still work', async (t) => {
  const current = worker({ cached: { '/index.html': 'current', '/': 'old' } })
  t.equal(await (await current.fetch('/')).text(), 'current', 'prefers the canonical cached page')
  const legacy = worker({ cached: { '/': 'legacy' } })
  t.equal(await (await legacy.fetch('/index.html')).text(), 'legacy', 'can use an older cached root offline')
  t.equal(legacy.requests.length, 0, 'legacy fallback does not require network access')
  t.end()
})

test('a missing static asset does not replace the previously cached index', async (t) => {
  const sw = worker({ files: { '/index.html': 'new' }, cached: { '/index.html': 'old' } })
  try {
    await sw.install()
    t.fail('installation should fail')
  } catch (err) {
    t.equal(err.message, 'Cannot cache missing asset', 'installation fails when required assets are missing')
  }
  t.equal(await (await sw.cache.match('/index.html')).text(), 'old', 'keeps the previous index after failed installation')
  t.end()
})

test('service worker can refill an evicted entry page', async (t) => {
  const sw = worker({ files: { '/index.html': 'refetched' } })
  t.equal(await (await sw.fetch('/duck')).text(), 'refetched', 'navigation refetches a missing cached entry')
  t.equal(await (await sw.cache.match('/index.html')).text(), 'refetched', 'refetched entry is cached')
  t.end()
})

test('IPFS Companion app requests continue through the local gateway', async (t) => {
  const app = 'http://bafyapp.ipfs.localhost:8080/index.html'
  const sw = worker({
    origin: 'http://bafyboot.ipfs.localhost:8080',
    files: { [app]: 'local IPFS app' }
  })
  t.equal(await (await sw.fetch(app)).text(), 'local IPFS app', 'loads the app from local IPFS')
  t.deepEqual(sw.requests, [app], 'preserves the gateway port and makes no R2 requests')
  t.end()
})
