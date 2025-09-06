const fetch = require('./fetch.js')

const decodeCsv = (encoded) => {
  encoded = new TextDecoder().decode(encoded.slice(0, encoded.indexOf(0)))
  encoded = encoded.split(',')
  const PCR = encoded.slice(0, 3).map((str) => str.toUpperCase())
  const [publicKey, nonce] = encoded.slice(3, 5).map((str) => Uint8Array.fromBase64(str))
  return { PCR, publicKey, nonce }
}

const other = async (urlAttest) => {
  const urlCert = '/assets/root.pem'
  let cert = fetch(urlCert).then((res) => res.arrayBuffer())
  let attest = fetch(urlAttest).then((res) => res.arrayBuffer())
  [cert, attest] = await Promise.all([cert, attest])

  cert = new Uint8Array(cert)
  const ptrCert = WASM._malloc(cert.length)
  WASM.HEAPU8.set(cert, ptrCert)

  attest = new Uint8Array(attest)
  const ptrAttest = WASM._malloc(attest.length)
  WASM.HEAPU8.set(attest, ptrAttest)

  let csv = new Uint8Array(attest.length)
  const ptrCsv = WASM._malloc(csv.length)
  WASM.HEAPU8.set(csv, ptrCsv)

  const code = WASM._validate(ptrCert, cert.length, ptrAttest, attest.length, ptrCsv, csv.length)
  if (code !== 0) { throw new Error(`attest failed with code ${code}`) }

  csv = new Uint8Array(WASM.HEAPU8.buffer, ptrCsv, csv.length)
  const result = decodeCsv(csv, json)

  WASM._free(ptrCert)
  WASM._free(ptrAttest)
  WASM._free(ptrCsv)

  return result
}

module.exports = function attestSession(WASM, sodium) {
  let session = null
  return async function useAttestSession(event) {
    const request = event.request
    const url = new URL(request.url)
    const notFound = () => new Response('', { status: 405, statusText: 'Some Thing' })
    let h = sodium.crypto_generichash(64, sodium.from_string('test'))
    console.log('sodium', sodium.to_hex(h))
    return notFound()
  }
}
