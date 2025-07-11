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

// try to load fast by send to multi gateways
const gateways = ['https://trustless-gateway.link', 'https://gateway.pinata.cloud', 'https://dweb.link']

gateways
  .map((url) => createVerifiedFetch({ gateways: [url] }))
  .map((p, idx) => p.then((vfetch) => gateways[idx] = vfetch))

const fetchMulti = (url) => {
  const works = gateways.map((vfetch) => vfetch(url))
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const selff = url.href.startsWith(self.location.origin)
  if (selff && isDev) { return }
  const gateway = selff ? null : (url.href.match(pathGatewayRegex) ?? url.href.match(subdomainGatewayRegex))
  if (!selff && !gateway?.groups) { return }
  const doIndex = selff && !cacheAssets.includes(url.pathname)
  if (doIndex) { return event.respondWith(caches.match('/')) }
  event.respondWith(cacheFirst(event.request, event, gateway?.groups))
})
