const encodeB64 = (bytes) => {
  let binary = ``
  const len = bytes.length
  for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]) }
  return btoa(binary)
}

const decodeB64 = (str) => {
  const binary = atob(str)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) { bytes[i] = binary.charCodeAt(i) }
  return bytes
}

const decodeCsv = (encoded) => {
  encoded = new TextDecoder().decode(encoded.slice(0, encoded.indexOf(0)))
  encoded = encoded.split(',')
  const [publicKey, nonce, userData] = encoded.slice(0, 3).map((str) => decodeB64(str))
  const PCR = encoded.slice(3, 6)
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

// todo: try get root at boot
const attestDocParse = async (WASM, cert, attestDoc) => {
  const ptrCert = WASM._malloc(cert.length)
  WASM.HEAPU8.set(cert, ptrCert)

  const attest = new Uint8Array(attestDoc)
  const ptrAttest = WASM._malloc(attest.length)
  WASM.HEAPU8.set(attest, ptrAttest)

  let csv = new Uint8Array(1024 * 16)
  const ptrCsv = WASM._malloc(csv.length)
  WASM.HEAPU8.set(csv, ptrCsv)

  const code = WASM._validate(ptrCert, cert.length, ptrAttest, attest.length, ptrCsv, csv.length)
  if (code !== 0) { throw new Error(`attest failed with code ${code}`) }

  csv = new Uint8Array(WASM.HEAPU8.buffer, ptrCsv, csv.length)
  const result = decodeCsv(csv)

  WASM._free(ptrCert)
  WASM._free(ptrAttest)
  WASM._free(ptrCsv)

  return result
}

const startState = async (WASM, sodium, PCR, cert, hello, nonce) => {
  const { body, keys } = hello
  const { attestDoc } = body
  const attestDocBytes = new TextEncoder().encode(attestDoc)
  const ok = await attestDocParse(WASM, cert, attestDocBytes)
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

const sendSessionBody = async (target, sessionId, body) => {
  const res = await fetch(`${target}/lockhost/session?sessionId=${sessionId}`, { method: 'POST', body })

  if (res.status !== 200) {
    throw new Error(`session = status ${res.status}`)
  }

  try {
    body = await res.json()
    return body
  } catch (err) {
    throw new Error('session = reply not json')
  }
}

module.exports = async function useAttest(WASM, sodium) {
  const urlCert = '/assets/root.pem'
  let cert = await fetch(urlCert).then((res) => res.arrayBuffer())
  cert = new Uint8Array(cert)

  return async function useAttestSession(PCR, event) {
    const req = event.request.clone()
    const url = new URL(req.url)

    const target = url.origin
    let nonce = sodium.randombytes_buf(32)
    nonce = encodeB64(nonce)
    const hello = await sendHello(sodium, target, nonce)
    const state = await startState(WASM, sodium, PCR, cert, hello, nonce)

    let headers = {}
    const method = req.method
    const path = url.pathname + url.search
    for (const [key, value] of req.headers.entries()) { headers[key] = value }
    let body = await req.arrayBuffer()
    body = encodeB64(body)

    let data = { path, method, headers, body }
    data = JSON.stringify(data)
    data = new TextEncoder().encode(data)

    let key = state.sessionKeys.sharedTx
    nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
    let encrypted = sodium.crypto_secretbox_easy(data, nonce, key)
    nonce = encodeB64(nonce)
    encrypted = encodeB64(encrypted)
    data = { nonce, encrypted }
    data = JSON.stringify(data)

    const sessionId = hello.body.sessionId
    data = await sendSessionBody(target, sessionId, data)
    key = state.sessionKeys.sharedRx
    data.nonce = decodeB64(data.nonce)
    data.encrypted = decodeB64(data.encrypted)
    data = sodium.crypto_secretbox_open_easy(data.encrypted, data.nonce, key)
    data = new TextDecoder().decode(data)
    data = JSON.parse(data)

    const status = data.status
    body = decodeB64(data.body)
    headers = data.headers

    return new Response(body, { status, headers })
  }
}
