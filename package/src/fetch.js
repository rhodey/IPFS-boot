function timeout(ms) {
  let timer = null
  const timedout = new Promise((res, rej) => {
    timer = setTimeout(() => rej({ timedout: true }), ms)
  })
  return [timer, timedout]
}

const noop = () => {}

module.exports = function fetchWithTimeout(request, timeoutms=15_000) {
  if (typeof request === 'string') { request = new Request(request) }
  if (!(request instanceof Request)) { return Promise.reject(new Error('fetch accepts url or instance of Request')) }
  let info = null

  try {
    const url = new URL(request.url)
    info = `${url.origin} ${url.pathname} ${url.search}`
  } catch (err) {
    return Promise.reject(new Error(`invalid url ${request.url}`))
  }

  const [timer, timedout] = timeout(timeoutms)
  const result = new Promise((res, rej) => {
    timedout.catch((err) => rej(new Error(`http timeout ${info}`)))
    fetch(request).then((response) => {
      if (response.ok) {
        res(response)
        return
      }
      rej(new Error(`http error ${info} status ${response.status}`))
    }).catch(rej)
  })

  result.catch(noop).finally(() => clearTimeout(timer))
  return result
}
