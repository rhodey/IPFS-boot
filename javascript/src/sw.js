const { verifiedFetch, createVerifiedFetch } = require('./vfetch.js')

const pathGatewayRegex = /^.*\/(?<protocol>ip[fn]s)\/(?<cidOrPeerIdOrDnslink>[^/?#]*)(?<path>.*)$/

const subdomainGatewayRegex = /^(?:https?:\/\/|\/\/)?(?<cidOrPeerIdOrDnslink>[^/]+)\.(?<protocol>ip[fn]s)\.(?<parentDomain>[^/?#]*)(?<path>.*)$/

self.addEventListener('install', (event) => {
  console.log('sw install')
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('sw activate')
  event.waitUntil(self.clients.claim())
})

const putInCache = async (req, res) => {
  const cache = await caches.open('ipfsboot')
  await cache.put(req, res)
}

const cacheFirst = async (req, event, info) => {
  const cache = await caches.match(req)
  if (cache) { return cache }
  const { protocol, cidOrPeerIdOrDnslink: cid, path } = info
  console.log('sw intercept', protocol, cid, path)
  const url = `${protocol}://${cid}/${path}`
  const ok = await verifiedFetch(url)
  event.waitUntil(putInCache(req, ok.clone()))
  return ok
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url
  const match = url.match(pathGatewayRegex) ?? url.match(subdomainGatewayRegex)
  if (!match?.groups) { return }
  event.respondWith(cacheFirst(event.request, event, match.groups))
})
