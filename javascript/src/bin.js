#!/usr/bin/env node

const fs = require('fs')

function onError(err) {
  console.log('error =', err.message)
  process.exit(1)
}

async function init(args) {
  const [repo, name] = args
  let ok = ['https://', 'ipfs://']
  ok = ok.some((str) => (typeof repo) === 'string' && repo.startsWith(str))
  if (!ok) { throw new Error('repo requires https://* or ipfs://*') }
  ok = (typeof name) === 'string' && name.length > 0
  if (!ok) { throw new Error('name requires string') }

  // allow update repo and name
  let file = null
  try {
    file = fs.readFileSync('versions.json', 'utf8')
  } catch (err) { }

  try {
    file && (file = JSON.parse(file))
  } catch (err) {
    throw new Error('versions.json is not json')
  }

  const arr = file ? file.arr : []
  file = { repo, name, arr }

  try {
    file = JSON.stringify(file, null, 2)
    fs.writeFileSync('versions.json', file, 'utf8')
  } catch (err) {
    err = err.message
    throw new Error(`versions.json write error - ${err}`)
  }
}

async function publish(opts) {
  let { cid, version, notes } = opts
  let ok = (typeof cid) === 'string' && cid.length === 59
  if (!ok) { throw new Error('cid requires string length 59') }
  ok = ((typeof version) === 'string') || ((typeof version) === 'number')
  if (!ok) { throw new Error('version requires string or number') }
  ok = (version += '').length > 0
  if (!ok) { throw new Error('version requires string or number') }
  ok = (typeof notes) === 'string' && notes.length > 0
  if (!ok) { throw new Error('notes requires string') }

  let file = null
  try {
    file = fs.readFileSync('versions.json', 'utf8')
  } catch (err) {
    err = err.message
    throw new Error(`versions.json read error - ${err}`)
  }

  try {
    file = JSON.parse(file)
  } catch (err) {
    throw new Error('versions.json is not json')
  }

  if (!Array.isArray(file.arr)) {
    throw new Error('versions.json invalid')
  }

  ok = file.arr.find((v) => v.version === version) === undefined
  if (!ok) { throw new Error('duplicate version') }

  const entry = { version, timems: Date.now(), cid, notes }
  file.arr.push(entry)

  try {
    file = JSON.stringify(file, null, 2)
    fs.writeFileSync('versions.json', file, 'utf8')
  } catch (err) {
    err = err.message
    throw new Error(`versions.json write error - ${err}`)
  }
}

const minimist = require('minimist')
const argv = minimist(process.argv.slice(2))
const cmd = argv._[0]

if (cmd === 'init') {
  init(argv._.slice(1)).catch(onError)
} else if (cmd === 'publish') {
  publish(argv).catch(onError)
} else {
  onError(new Error('need cmd: init, publish'))
}
