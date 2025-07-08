const fetch = require('./fetch.js')

function timeout(ms) {
  let timer = null
  const timedout = new Promise((res, rej) => {
    timer = setTimeout(() => rej({ timedout: true }), ms)
  })
  return [timer, timedout]
}

const noop = () => {}

if ((typeof Module) === 'undefined') { throw new Error('need to include nitro_wasm.js in index.html') }

let ready = false
Module.onRuntimeInitialized = () => ready = true

window.loadAttest = function load(timeoutms=10_000) {

  const hexToBytes = (hex) => {
    if (!hex) { return null }
    return Uint8Array.from(hex.match(/.{1,2}/g).map((b) => parseInt(b, 16)))
  }

  const bytesToUtf8 = (arr) => new TextDecoder('utf-8').decode(arr)

  const decodeCsv = (encoded, json) => {
    encoded = new TextDecoder().decode(encoded.slice(0, encoded.indexOf(0)))
    encoded = encoded.split(',')
    const pcrs = encoded.slice(0, 3).map((str) => str.toUpperCase())
    const [PCR0, PCR1, PCR2] = pcrs
    const [publicKey, nonce] = encoded.slice(3, 5).map(hexToBytes)
    let userData = hexToBytes(encoded[5])
    if (json && userData) {
      userData = bytesToUtf8(userData)
      userData = JSON.parse(userData)
    }
    return { PCR0, PCR1, PCR2, publicKey, nonce, userData }
  }

  function getAttest(urlAttest, json=true) {
    const urlCert = '/assets/root.pem'
    const cert = fetch(urlCert).then((res) => res.arrayBuffer())
    const attest = fetch(urlAttest).then((res) => res.arrayBuffer())

    return Promise.all([cert, attest]).then((both) => {
      let [cert, attest] = both

      cert = new Uint8Array(cert)
      const ptrCert = Module._malloc(cert.length)
      Module.HEAPU8.set(cert, ptrCert)

      attest = new Uint8Array(attest)
      const ptrAttest = Module._malloc(attest.length)
      Module.HEAPU8.set(attest, ptrAttest)

      let csv = new Uint8Array(attest.length)
      const ptrCsv = Module._malloc(csv.length)
      Module.HEAPU8.set(csv, ptrCsv)

      const code = Module._validate(ptrCert, cert.length, ptrAttest, attest.length, ptrCsv, csv.length)
      if (code !== 0) { throw new Error(`attest validation failed with code ${code}`) }

      csv = new Uint8Array(Module.HEAPU8.buffer, ptrCsv, csv.length)
      const result = decodeCsv(csv, json)

      Module._free(ptrCert)
      Module._free(ptrAttest)
      Module._free(ptrCsv)

      return result
    })
  }

  let interval = null
  const [timer, timedout] = timeout(timeoutms)

  const result = new Promise((res, rej) => {
    timedout.catch((err) => rej(new Error('wasm load timeout')))
    const checkReady = () => {
      if (!ready) { return }
      try {
        const sum = Module._add(5, 7)
        if (sum !== 12) { throw new Error(`wasm _add ${sum} != 12`) }
        res(getAttest)
      } catch (err) {
        rej(err)
      }
    }
    interval = setInterval(checkReady, 50)
    checkReady()
  })

  result.catch(noop).finally(() => {
    clearTimeout(timer)
    clearInterval(interval)
  })
  return result

}
