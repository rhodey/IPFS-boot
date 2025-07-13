import { httpGatewayRouting } from '@helia/routers'
import { createVerifiedFetch } from '@helia/verified-fetch'

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

// todo: replace with your cloudflare bucket
// todo: if no cloudflare bucket replace with empty array
const fast = ['https://ipfs.lock.host']
fast.map((url, idx) => {
  createVerifiedFetch({ gateways: [url], routers: [] })
    .then((vfetch) => fast[idx] = vfetch)
})

// public gateways as fallbacks
const maybeFast = ['https://trustless-gateway.link', 'https://dweb.link']
maybeFast.map((url, idx) => {
  createVerifiedFetch({ gateways: [url], routers: [] })
    .then((vfetch) => maybeFast[idx] = vfetch)
})

// accept success from any and reject if all reject
const verifiedFetchMulti = (url) => {
  const okOr404 = (res) => {
    if (res.ok || res.status === 404) { return res }
    return Promise.reject(res)
  }
  let aborts = []
  const go = (vfetch) => {
    const ctrl = new AbortController()
    aborts.push(ctrl)
    const abort = () => {
      aborts.filter((c) => c !== ctrl).forEach((c) => c.abort())
      aborts = []
    }
    const { signal } = ctrl
    return vfetch(url, { signal }).then(okOr404).then((ok) => {
      abort()
      return ok
    })
  }
  const idx = Math.floor(Math.random() * maybeFast.length)
  const gateways = [...fast, maybeFast[idx]]
  return Promise.any(gateways.map(go))
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
    const { protocol, cidOrPeerIdOrDnslink: cid, path } = gateway
    console.log('sw intercept', protocol, cid, path)
    url = `${protocol}://${cid}/${path}`
  }
  const fn = gateway ? verifiedFetchMulti : fetch
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
