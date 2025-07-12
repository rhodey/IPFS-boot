import { httpGatewayRouting } from '@helia/routers'
import { createVerifiedFetch } from '@helia/verified-fetch'

const cacheName = 'ipfsboot'

// todo: offline files go here
const cacheAssets = ['/', '/sw.js', '/bundle.js', '/assets/favicon.png', '/assets/style.css']

// dont cache bootloader files while using dev server
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

// todo: replace with your filebase gateway
let fast = 'https://medieval-silver-salmon.myfilebase.com'
createVerifiedFetch({ gateways: [fast], routers: [] })
  .then((vfetch) => fast = vfetch)

// default gateways as fallbacks
const slow = ['https://trustless-gateway.link', 'https://dweb.link']
slow.map((url, idx) => {
  createVerifiedFetch({ gateways: [url] })
    .then((vfetch) => slow[idx] = vfetch)
})

// accept success from any and reject if all reject
const fetchMulti = (url) => {
  const okOrThrow = (res) => {
    if (res.ok || res.status === 404) { return res }
    return Promise.reject(res)
  }

  const works = []
  const ctrl = new AbortController()
  works.push(fast(url).then(okOrThrow).then((ok) => {
    ctrl.abort()
    return ok
  }))

  const { signal } = ctrl
  const sloww = Math.random() >= 0.5 ? slow[0] : slow[1]
  works.push(sloww(url, { signal }).then(okOrThrow))
  return Promise.any(works)
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
  const fn = gateway ? fetchMulti : fetch
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
