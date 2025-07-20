import { CID } from 'multiformats/cid'
import { UnixFS } from 'ipfs-unixfs'
import { decode as decodeDagPB } from '@ipld/dag-pb'

const cacheName = 'ipfsboot'

// offline files go here
const cacheAssets = ['/', '/sw.js', '/bundle.js', '/assets/favicon.png', '/assets/style.css']

// dont cache bootloader files when dev server running
const isDev = DEV === true

const pathGatewayRegex = /^.*\/(?<protocol>ip[fn]s)\/(?<cidOrPeerIdOrDnslink>[^/?#]*)(?<path>.*)$/
const subdomainGatewayRegex = /^(?:https?:\/\/|\/\/)?(?<cidOrPeerIdOrDnslink>[^/]+)\.(?<protocol>ip[fn]s)\.(?<parentDomain>[^/?#]*)(?<path>.*)$/

self.addEventListener('install', (event) => {
  console.log('sw install')
  !isDev && event.waitUntil(
    caches.open(cacheName)
      .then((cache) => cache.addAll(cacheAssets))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('sw activate')
  event.waitUntil(self.clients.claim())
})

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

const fast = ['https://ipfs.lock.host']
const maybeFast = ['https://trustless-gateway.link', 'https://dweb.link']

// accept success from any and reject if all reject
const fetchBlock = (cid) => {
  const okOr404 = (res) => {
    if (res.ok || res.status === 404) { return res }
    return Promise.reject(new Error('Status ' + res?.status))
  }
  const go = (gateway) => {
    const url = `${gateway}/ipfs/${cid}?format=raw`
    return fetch(url)
      .then(okOr404)
      .then((res) => res.arrayBuffer())
  }
  const idx = Math.floor(Math.random() * maybeFast.length)
  const gateways = [...fast, maybeFast[idx]]
  return Promise.any(gateways.map(go)).catch((err) => {
    err.message = err.errors.map((e) => e.message).join(', ')
    return Promise.reject(err)
  })
}

const fetchAndDecode = async (cid) => {
  let buf = await fetchBlock(cid)
  const node = decodeDagPB(buf)
  const unixfs = UnixFS.unmarshal(node.Data)
  if (isDir(unixfs)) {
    return node.Links
  } else if (isFile(unixfs) && node.Links && node.Links.length > 0) {
    const bufs = []
    for (const link of node.Links) {
      buf = await fetchAndDecode(link.Hash)
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
    if (!next) { next = children[match.Hash] = fetchAndDecode(match.Hash) }
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

const verifiedFetch = async (args) => {
  const [cid, path] = args
  let root = roots[cid]
  if (!root) { root = roots[cid] = fetchAndDecode(cid) }
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
  if (selff && isDev) { return }
  let gateway = selff ? null : (url.href.match(pathGatewayRegex) ?? url.href.match(subdomainGatewayRegex))
  if (!selff && !gateway?.groups) { return }
  const doIndex = selff && !cacheAssets.includes(url.pathname)
  if (doIndex) { return event.respondWith(caches.match('/')) }
  const ipfs = isIpfsCompanion(url)
  gateway = ipfs ? null : gateway?.groups
  event.respondWith(cacheFirst(event.request, event, gateway))
})
