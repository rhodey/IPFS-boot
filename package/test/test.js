const test = require('tape')
const crypto = require('crypto')
const storage = require('../src/storage.js')

const now = Date.now()
let plus = 0

const rand = () => {
  const timems = now + plus++
  const cid = crypto.randomUUID()
  const version = crypto.randomUUID()
  return { cid, version, timems }
}

test('test remote and local match', (t) => {
  t.plan(1)
  const remote = [rand(), rand(), rand()]
  const local = [...remote]
  storage.verifyHistory(remote, local)
  t.pass('ok')
})

test('test remote has two more than local', (t) => {
  t.plan(1)
  const remote = [rand(), rand(), rand()]
  const local = remote.slice(0, 1)
  storage.verifyHistory(remote, local)
  t.pass('ok')
})

test('test remote has one more than local', (t) => {
  t.plan(1)
  const remote = [rand(), rand(), rand()]
  const local = remote.slice(0, 2)
  storage.verifyHistory(remote, local)
  t.pass('ok')
})

test('test remote does not have latest local', (t) => {
  t.plan(1)
  const remote = [rand(), rand(), rand()]
  const local = [...remote]
  local.push(rand())

  try {
    storage.verifyHistory(remote, local)
    t.fail('no error')
  } catch (err) {
    t.pass('ok')
  }
})

test('test remote does not have two latest local', (t) => {
  t.plan(1)
  const remote = [rand(), rand(), rand()]
  const local = [...remote]
  local.push(rand())
  local.push(rand())

  try {
    storage.verifyHistory(remote, local)
    t.fail('no error')
  } catch (err) {
    t.pass('ok')
  }
})

test('test remote does not have early local', (t) => {
  t.plan(1)
  const remote = [rand(), rand(), rand()]
  const local = [...remote]
  remote.splice(1, 1)

  try {
    storage.verifyHistory(remote, local)
    t.fail('no error')
  } catch (err) {
    t.pass('ok')
  }
})

test('test remote does not have first local', (t) => {
  t.plan(1)
  const remote = [rand(), rand(), rand()]
  const local = [...remote]
  remote.splice(0, 1)

  try {
    storage.verifyHistory(remote, local)
    t.fail('no error')
  } catch (err) {
    t.pass('ok')
  }
})

test('test remote has middle missing from local', (t) => {
  t.plan(1)
  const remote = [rand(), rand(), rand()]
  const a = rand()
  const b = rand()
  const local = [...remote, b]
  remote.push(a)
  remote.push(b)

  try {
    storage.verifyHistory(remote, local)
    t.fail('no error')
  } catch (err) {
    t.pass('ok')
  }
})
