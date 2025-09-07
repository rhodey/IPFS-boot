const encodeB64 = (bytes) => {
  let binary = ``
  const len = bytes.length
  for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]) }
  return btoa(binary)
}

const decodeB64 = (str) => {
  const binary = window.atob(str)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) { bytes[i] = binary.charCodeAt(i) }
  return bytes
}

const decodeCsv = (encoded) => {
  encoded = new TextDecoder().decode(encoded.slice(0, encoded.indexOf(0)))
  encoded = encoded.split(',')
  const PCR = encoded.slice(0, 3)
  const [publicKey, nonce] = encoded.slice(3, 5).map((str) => decodeB64(str))
  return { PCR, publicKey, nonce }
}

const sendHello = async (sodium, target, nonce) => {
  const keys = sodium.crypto_kx_keypair()
  const publicKey = encodeB64(keys.publicKey)
  const params = new URLSearchParams({ publicKey, nonce, envelope: 'json' })

  const res = await fetch(`${target}/lockhost/hello?${params.toString()}`)
  if (res.status !== 200) {
    throw new Error(`hello = status ${status}`)
  }

  try {
    const body = await res.json()
    return { body, keys }
  } catch (err) {
    throw new Error('hello = reply not json')
  }
}

const attestDocParse = async (WASM, attestDoc) => {
  const urlCert = '/assets/root.pem'
  let cert = await fetch(urlCert).then((res) => res.arrayBuffer())
  cert = new Uint8Array(cert)
  const ptrCert = WASM._malloc(cert.length)
  WASM.HEAPU8.set(cert, ptrCert)

  const ptrAttest = WASM._malloc(attestDoc.length)
  WASM.HEAPU8.set(attestDoc, ptrAttest)

  // let csv = new Uint8Array(attestDoc.length)
  let csv = new Uint8Array(1024 * 16)
  const ptrCsv = WASM._malloc(csv.length)
  WASM.HEAPU8.set(csv, ptrCsv)

  const code = WASM._validate(ptrCert, cert.length, ptrAttest, attestDoc.length, ptrCsv, csv.length)
  if (code !== 0) { throw new Error(`attest failed with code ${code}`) }

  csv = new Uint8Array(WASM.HEAPU8.buffer, ptrCsv, csv.length)
  const result = decodeCsv(csv)

  WASM._free(ptrCert)
  WASM._free(ptrAttest)
  WASM._free(ptrCsv)

  return result
}

const startState = async (WASM, sodium, PCR, hello, nonce) => {
  const { body, keys } = hello
  let { attestDoc } = body
  attestDoc = decodeB64(attestDoc)
  const ok = await attestDocParse(WASM, attestDoc)
  const { publicKey, nonce: nonce2, PCR: PCR2 } = ok

  if (nonce !== encodeB64(nonce2)) {
    throw new Error('hello = attest doc nonce not ok')
  } else if (PCR.join(',') !== PCR2.join(',')) {
    throw new Error('hello = attest doc PCR not ok')
  }

  try {
    const sessionKeys = sodium.crypto_kx_client_session_keys(
      keys.publicKey, keys.privateKey,
      publicKey
    )
    return { sessionKeys }
  } catch (err) {
    throw new Error('hello = attest doc key not ok')
  }
}

module.exports = function useAttest(WASM, sodium) {
  return async function useAttestSession(PCR, event) {
    console.log('PCR', PCR)
    const req = event.request
    const url = new URL(req.url)
    const path = url.pathname + url.search
    const method = req.method
    const headers = {}
    for (const [key, value] of req.headers.entries()) { headers[key] = value }
    console.log('have opts')

    let nonce = sodium.randombytes_buf(32)
    nonce = encodeB64(nonce)
    console.log('have nonce')

    const target = url.origin
    const hello = await sendHello(sodium, target, nonce)
    console.log('have hello')
    const state = await startState(WASM, sodium, PCR, hello, nonce)
    console.log('have state')

    const notFound = () => new Response('', { status: 405, statusText: 'Some Thing' })
    return notFound()
  }
}
