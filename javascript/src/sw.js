import { CID } from 'multiformats/cid'
import { UnixFS } from 'ipfs-unixfs'
import { decode as decodeDagPB } from '@ipld/dag-pb'
import { importer } from 'ipfs-unixfs-importer'
import { fixedSize } from 'ipfs-unixfs-importer/chunker'
import { MemoryBlockstore } from 'blockstore-core/memory'

const cacheName = 'ipfsboot'

// offline files go here
const cacheAssets = ['/', '/sw.js', '/bundle.js', '/assets/favicon.png', '/assets/style.css']

const pathGatewayRegex = /^.*\/(?<protocol>ip[fn]s)\/(?<cidOrPeerIdOrDnslink>[^/?#]*)(?<path>.*)$/
const subdomainGatewayRegex = /^(?:https?:\/\/|\/\/)?(?<cidOrPeerIdOrDnslink>[^/]+)\.(?<protocol>ip[fn]s)\.(?<parentDomain>[^/?#]*)(?<path>.*)$/

const isFile = (obj) => obj.type === 'file'
const isDir = (obj) => obj.type === 'directory' || obj.type === 'hamt-sharded-directory'

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

self.addEventListener('activate', (event) => {
  console.log('sw activate')
  event.waitUntil(self.clients.claim())
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
  const OK = (buf) => new Response(buf, { status: 200, statusText: 'OK' })
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
