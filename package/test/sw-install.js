const test = require('tape')
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/sw-install.js'), 'utf8')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Flush registration/ready continuations without waiting for real timers.
async function flush() {
  for (let i = 0; i < 5; i++) { await Promise.resolve() }
}

function browser({ supported = true, controller = null, syncClaim = false,
                   registration, ready, scriptURL = 'https://boot.example/sw.js' } = {}) {
  const listeners = new Set()
  const timers = new Map()
  const messages = []
  const registered = []
  const state = { resolved: false }
  const active = {
    scriptURL,
    postMessage: (message) => {
      messages.push(message)
      if (syncClaim) { control(active) }
    }
  }
  const reg = { scope: 'https://boot.example/', active }
  const sw = {
    controller,
    ready: ready ?? Promise.resolve(reg),
    register: (url) => {
      registered.push(url)
      return registration ?? Promise.resolve(reg)
    },
    addEventListener: (name, handler) => {
      if (name === 'controllerchange') { listeners.add(handler) }
    },
    removeEventListener: (name, handler) => {
      if (name === 'controllerchange') { listeners.delete(handler) }
    }
  }
  function control(worker) {
    sw.controller = worker
    for (const handler of [...listeners]) { handler() }
  }
  const module = { exports: {} }
  let nextTimer = 0
  vm.runInNewContext(source, {
    module, URL,
    navigator: supported ? { serviceWorker: sw } : {},
    console: { log: () => {} },
    setTimeout: (callback, ms) => {
      const id = ++nextTimer
      timers.set(id, { callback, ms })
      return id
    },
    clearTimeout: (id) => timers.delete(id)
  })
  return {
    state, sw, reg, active, listeners, timers, messages, registered, control,
    start: () => module.exports().then(() => { state.resolved = true }),
    timeout: () => {
      for (const { callback } of [...timers.values()]) { callback() }
    }
  }
}

function cleanedUp(t, env) {
  t.equal(env.listeners.size, 0, 'removes the controllerchange listener')
  t.equal(env.timers.size, 0, 'clears the control timeout')
}

test('hard reload asks the active bootloader worker to claim and waits for control', async (t) => {
  const ready = deferred()
  const env = browser({ ready: ready.promise })
  const result = env.start()
  await flush()
  t.deepEqual(env.registered, ['/sw.js'], 'registers the bootloader worker')
  t.deepEqual(env.messages, ['ipfs-boot:claim'], 'asks the existing active worker to claim without waiting for ready')
  t.notOk(env.state.resolved, 'boot waits while the page is uncontrolled')
  env.control(null)
  await flush()
  t.notOk(env.state.resolved, 'an event without a controller does not unblock boot')
  env.control(env.active)
  await result
  t.ok(env.state.resolved, 'boot resumes after control is established')
  cleanedUp(t, env)
  t.end()
})

test('fresh installation waits for ready and handles a synchronous claim event', async (t) => {
  const installing = deferred()
  const env = browser({ ready: installing.promise, syncClaim: true })
  env.reg.active = null
  const result = env.start()
  await flush()
  t.deepEqual(env.messages, [], 'does not message a worker before installation is ready')
  t.notOk(env.state.resolved, 'boot waits for installation')
  installing.resolve({ ...env.reg, active: env.active })
  await result
  t.deepEqual(env.messages, ['ipfs-boot:claim'], 'claims after the worker becomes active')
  t.equal(env.sw.controller, env.active, 'handles control changing during postMessage')
  cleanedUp(t, env)
  t.end()
})

test('registration rejection keeps gateway loading available', async (t) => {
  const registration = deferred()
  const env = browser({ registration: registration.promise })
  const result = env.start()
  registration.reject(new Error('Gateway returned HTML for sw.js'))
  await result
  t.ok(env.state.resolved, 'registration failure is nonfatal to boot')
  t.deepEqual(env.messages, [], 'does not send a claim request after registration failed')
  cleanedUp(t, env)
  t.end()
})

test('an already-controlled page proceeds without messaging another worker', async (t) => {
  const registration = deferred()
  const otherWorker = { scriptURL: 'https://boot.example/ipfs-sw-sw.js' }
  const env = browser({ controller: otherWorker, registration: registration.promise })
  const result = env.start()
  await result
  t.ok(env.state.resolved, 'existing control unblocks boot before registration finishes')
  registration.resolve(env.reg)
  await flush()
  t.deepEqual(env.messages, [], 'late registration does not request a claim')
  t.equal(env.sw.controller, otherWorker, 'does not change the existing controller')
  cleanedUp(t, env)
  t.end()
})

test('a ready registration for a different worker is not asked to claim', async (t) => {
  const env = browser({ scriptURL: 'https://boot.example/ipfs-sw-sw.js' })
  await env.start()
  t.deepEqual(env.messages, [], 'only the bootloader script receives the claim message')
  t.ok(env.state.resolved, 'a gateway worker does not block boot')
  cleanedUp(t, env)
  t.end()
})

test('control timeout cleans up and prevents late claims', async (t) => {
  for (const waitingFor of ['registration', 'ready']) {
    const pending = deferred()
    const env = browser({ [waitingFor]: pending.promise })
    if (waitingFor === 'ready') { env.reg.active = null }
    const result = env.start()
    await flush()
    t.equal([...env.timers.values()][0].ms, 15_000, 'sets a bounded wait for ' + waitingFor)
    env.timeout()
    await result
    t.ok(env.state.resolved, 'timeout allows boot while waiting for ' + waitingFor)
    cleanedUp(t, env)
    pending.resolve({ ...env.reg, active: env.active })
    await flush()
    t.deepEqual(env.messages, [], 'late ' + waitingFor + ' completion cannot claim the page')
  }
  t.end()
})

test('browsers without service worker support can boot immediately', async (t) => {
  const env = browser({ supported: false })
  await env.start()
  t.ok(env.state.resolved, 'unsupported API does not block boot')
  t.deepEqual(env.registered, [], 'does not try to register')
  cleanedUp(t, env)
  t.end()
})
