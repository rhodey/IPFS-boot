import { CID } from 'multiformats/cid'
import { UnixFS } from 'ipfs-unixfs'
import { decode as decodeDagPB } from '@ipld/dag-pb'
import { importer } from 'ipfs-unixfs-importer'
import { fixedSize } from 'ipfs-unixfs-importer/chunker'
import { MemoryBlockstore } from 'blockstore-core/memory'
import _sodium from 'libsodium-wrappers'
import useAttest from './attest.js'
importScripts('/nitro_wasm.js')
import mime from 'mime'

const cacheName = 'ipfsboot'

// offline files go here
const cacheAssets = ['/', '/sw.js', '/bundle.js', '/assets/favicon.png', '/assets/style.css']

const isFile = (obj) => obj.type === 'file'
const isDir = (obj) => obj.type === 'directory' || obj.type === 'hamt-sharded-directory'

const pathGatewayRegex = /^.*\/(?<protocol>ip[fn]s)\/(?<cidOrPeerIdOrDnslink>[^/?#]*)(?<path>.*)$/
const subdomainGatewayRegex = /^(?:https?:\/\/|\/\/)?(?<cidOrPeerIdOrDnslink>[^/]+)\.(?<protocol>ip[fn]s)\.(?<parentDomain>[^/?#]*)(?<path>.*)$/

const noop = () => {}

const timeout = (ms) => {
  let timer = null
  const timedout = new Promise((res, rej) => {
    timer = setTimeout(() => rej(null), ms)
  })
  return [timer, timedout]
}

const concat = (bufs) => {
  const len = bufs.reduce((acc, b) => acc + b.byteLength, 0)
  const res = new Uint8Array(len)
  let pos = 0
  for (const buf of bufs) {
    res.set(new Uint8Array(buf), pos)
    pos += buf.byteLength
  }
  return res
}

self.addEventListener('install', (event) => {
  console.log('sw install')
  !DEV && event.waitUntil(
    caches.open(cacheName)
      .then((cache) => cache.addAll(cacheAssets))
  )
  self.skipWaiting()
})

let attestError = null
let useAttestSession = null
let attestWasmReady = false
Module.onRuntimeInitialized = () => attestWasmReady = true

self.addEventListener('activate', async (event) => {
  console.log('sw activate')

  // load sodium
  let sodium = null
  const [timer, timedout] = timeout(10_000)
  const sodiumLoad = new Promise((res, rej) => {
    timedout.catch((err) => rej(new Error('sodium load timeout')))
    _sodium.ready.then(() => {
      console.log('sw sodium ok')
      sodium = _sodium
      res()
    }).catch(rej)
  })

  // load nitro_wasm
  let interval = null
  const attestLoad = () => new Promise((res, rej) => {
    timedout.catch((err) => rej(new Error('nitro_wasm load timeout')))
    const checkReady = () => {
      if (!attestWasmReady) { return }
      try {
        const sum = Module._add(5, 7)
        if (sum !== 12) { throw new Error(`nitro_wasm _add ${sum} != 12`) }
        useAttest(Module, sodium, cookieStore).then((fn) => {
          console.log('sw attest ok')
          useAttestSession = fn
          res()
        }).catch(rej)
      } catch (err) {
        rej(err)
      }
    }
    interval = setInterval(checkReady, 50)
    checkReady()
  })

  const cleanup = () => {
    clearTimeout(timer)
    clearInterval(interval)
  }

  sodiumLoad
    .then(attestLoad)
    .catch((err) => attestError = err)
    .finally(cleanup)

  event.waitUntil(self.clients.claim())
})

let app = null
let attestPatterns = null

const findPcrForHref = (href) => {
  if (!attestPatterns) { return }
  const match = attestPatterns.find((obj) => obj.pattern.test(href))
  if (!match) { return }
  return match.PCR
}

const sendAttestStatus = () => {
  if (useAttestSession) {
    app.postMessage({ type: 'attestReady' })
    return
  } else if (attestError) {
    app.postMessage({ type: 'attestError', error: attestError.message })
    console.log('sw attestError', attestError)
    return
  }
  setTimeout(sendAttestStatus, 50)
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'connect') { return }
  app = event.ports[0]
  sendAttestStatus()
  app.onmessage = (event) => {
    if (event.data?.type !== 'config') { return }
    attestPatterns = event.data.patterns.map((obj) => {
      obj.pattern = new RegExp(obj.pattern)
      return obj
    })
    app.postMessage({ type: 'config' })
  }
})

// require cid match
const equal = (str1, str2) => {
  const c1 = CID.parse(str1)
  const c2 = CID.parse(str2)
  return c1.multihash.bytes.every((byte, i) => byte === c2.multihash.bytes[i])
}

// require cid match
const verify = async (target, fname, buf) => {
  target = target.toString()
  const cid = []
  const source = [{ content: buf }]
  const blocks = new MemoryBlockstore()
  const opts = { chunker: fixedSize({ chunkSize: 99_999_999 }), cidVersion: 0 }
  for await (const entry of importer(source, blocks, opts)) {
    cid.push(entry.cid.toString())
  }
  if (cid.length !== 1) { throw new Error(`File: ${fname} expected 1 entry for cid`) }
  if (!equal(target, cid[0])) { throw new Error(`File: ${fname} expected: ${target} got: ${cid[0]}`) }
  return buf
}

// todo: replace with your cloudflare bucket or worker
// todo: if no cloudflare replace with empty array
const fast = ['https://ipfs.lock.host']

// public gateways as fallbacks
const maybeFast = ['https://trustless-gateway.link', 'https://dweb.link']

// accept success from any and reject if all reject
const fetchBlock = (cid, fname) => {
  const isOk = (res) => res.ok ? res : Promise.reject(new Error('Status ' + res.status))
  const safe = (buf) => verify(cid, fname, buf)
  const go = (gateway) => {
    const url = `${gateway}/ipfs/${cid}?format=raw`
    return fetch(url)
      .then(isOk)
      .then((res) => res.arrayBuffer())
      .then((buf) => safe(new Uint8Array(buf)))
  }
  const idx = Math.floor(Math.random() * maybeFast.length)
  const gateways = [...fast, maybeFast[idx]]
  return Promise.any(gateways.map(go)).catch((err) => {
    err.message = err.errors.map((e) => e.message).join(', ')
    return Promise.reject(err)
  })
}

// return file contents or links in dir
const fetchAndDecode = async (cid, fname) => {
  let buf = await fetchBlock(cid)
  const node = decodeDagPB(buf)
  const unixfs = UnixFS.unmarshal(node.Data)
  if (isDir(unixfs)) {
    return node.Links
  } else if (isFile(unixfs) && node.Links && node.Links.length > 0) {
    const bufs = []
    for (const link of node.Links) {
      buf = await fetchAndDecode(link.Hash, fname + bufs.length)
      bufs.push(buf)
    }
    return concat(bufs)
  } else if (isFile(unixfs)) {
    return unixfs.data
  }
  return null
}

const roots = {}
const children = {}

// walk root dir until find path
const findFile = async (root, path) => {
  const type = mime.getType(path) ?? 'text/plain'
  const headers = { 'Content-Type': type }
  const OK = (buf) => new Response(buf, { status: 200, statusText: 'OK', headers })
  const notFound = () => new Response('', { status: 404, statusText: 'Not Found' })
  let search = '/'
  let dir = root
  const parts = path.split('/').slice(1)
  for (const part of parts) {
    const match = dir.find((link) => link.Name === part)
    if (!match) { return notFound() }
    let next = children[match.Hash]
    if (!next) { next = children[match.Hash] = fetchAndDecode(match.Hash, search + part) }
    const ok = await next
    search += part
    if (!Array.isArray(ok) && search === path) {
      return OK(ok)
    } else if (!Array.isArray(ok)) {
      return notFound()
    }
    search += '/'
    dir = ok
  }
}

// only fetch root once
const verifiedFetch = async (args) => {
  const [cid, path] = args
  let root = roots[cid]
  if (!root) { root = roots[cid] = fetchAndDecode(cid, 'root') }
  return root.then((root) => findFile(root, path))
}

const putInCache = async (req, res) => {
  const cache = await caches.open(cacheName)
  await cache.put(req, res)
}

const cacheFirst = async (req, event, gateway) => {
  const cache = await caches.match(req)
  if (cache) { return cache }
  let url = req.url
  if (gateway) {
    const { cidOrPeerIdOrDnslink: cid, path } = gateway
    console.log('sw intercept', cid, path)
    url = [cid, path]
  }
  const fn = gateway ? verifiedFetch : fetch
  const ok = await fn(url)
  ok.ok && event.waitUntil(putInCache(req, ok.clone()))
  return ok
}

const isIpfsCompanion = (url) => {
  let host = url.hostname.split('.').slice(1)
  let port = url.port
  port = port ? `:${port}` : ''
  return host[0] === 'ipfs' && host.pop() === 'localhost'
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const PCR = findPcrForHref(url.href)
  if (PCR) { return event.respondWith(useAttestSession(PCR, event)) }
  const selff = url.href.startsWith(self.location.origin)
  if (selff && DEV) { return }
  let gateway = selff ? null : (url.href.match(pathGatewayRegex) ?? url.href.match(subdomainGatewayRegex))
  if (!selff && !gateway?.groups) { return }
  const doIndex = selff && !cacheAssets.includes(url.pathname)
  if (doIndex) { return event.respondWith(caches.match('/')) }
  const ipfs = isIpfsCompanion(url)
  gateway = ipfs ? null : gateway?.groups
  event.respondWith(cacheFirst(event.request, event, gateway))
})
