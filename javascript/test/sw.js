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

test('service worker installs and activates without attestation runtimes', async (t) => {
  const handlers = {}
  let assets
  let claimed = false
  let skipped = false
  const waits = []
  const context = {
    console, URL, TextEncoder, TextDecoder, Request, Response, Headers, Event,
    self: {
      location: { origin: 'https://boot.example' },
      addEventListener: (name, handler) => { handlers[name] = handler },
      skipWaiting: () => { skipped = true },
      clients: { claim: async () => { claimed = true } }
    },
    caches: {
      open: async () => ({ addAll: async (urls) => { assets = urls } })
    }
  }
  vm.runInNewContext(bundle, context)
  const event = { waitUntil: (promise) => waits.push(promise) }
  handlers.install(event)
  handlers.activate(event)
  await Promise.all(waits)
  t.ok(skipped, 'installs immediately')
  t.ok(claimed, 'claims clients')
  t.deepEqual(Array.from(assets), ['/', '/sw.js', '/bundle.js', '/assets/favicon.png', '/assets/style.css'], 'caches the bootloader assets')

  let intercepted = false
  handlers.fetch({
    request: new Request('https://api.example/data'),
    respondWith: () => { intercepted = true }
  })
  t.notOk(intercepted, 'leaves ordinary app API requests to the browser')
  t.end()
})
