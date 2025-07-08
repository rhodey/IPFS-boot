const chooo = require('choo')
const devtools = require('choo-devtools')
const fetch = require('./fetch.js')
const storage = require('./storage.js')
// require('./attest.js')

// todo: better value for prod
const updateInterval = 10_000

// todo: your https server with cors
const versionsUrl = 'https://rhodey.org/assets/versions.json'

const equal = (a, b) => a?.cid === b?.cid && a?.version === b?.version

let state = null

function store(statee, emitter) {
  state = statee._boot = {}
  state.background = false
  state.loading = true
  state.error = null
  state.remote = null
  state.local = null
  state.name = null
  state.repo = null
  state.version = null
  state.selected = null

  // avoid xss
  const safe = (str) => {
    const doc = new DOMParser().parseFromString(str, 'text/html')
    return doc.body.textContent || ''
  }

  const fetchVersions = (timeout) => {
    return fetch(versionsUrl, timeout).then((res) => res.json()).then((json) => {
      if (typeof json?.repo !== 'string') {
        throw new Error('remote versions invalid')
      } else if (!Array.isArray(json?.arr)) {
        throw new Error('remote versions invalid')
      } else if (json.arr.length <= 0) {
        throw new Error('remote versions length 0')
      }
      state.name = safe(json.name)
      state.repo = safe(json.repo)
      json.arr.forEach((e) => {
        e.cid = safe(e.cid)
        e.version = safe(e.version)
        e.notes = safe(e.notes)
      })
      return json.arr.sort((a, b) => a.timems - b.timems)
    })
  }

  const checkForUpdates = () => {
    fetchVersions().then((remote) => {
      storage.verifyHistory(remote, state.local)
      state.remote = remote
      if (state.remote.length === state.local.length) { return }
      // will show update notif
      emitter.emit('render')
    }).catch((err) => {
      console.log('check updates error', err)
    })
  }

  const firstBoot = async () => {
    console.log('first boot')
    state.remote = await fetchVersions().catch((err) => { throw new Error(`fetch versions error - ${err.message}`) })
    state.local = [...state.remote]
    storage.versions(state.local)
    setInterval(checkForUpdates, updateInterval)
    state.loading = false
    // will show list of boot options
    emitter.emit('render')
  }


  const overrideBoot = async () => {
    console.log('override boot')
    // add app boot style
    if (state.version) {
      const index = getIndexUrl(state.version.cid)
      let base = index.lastIndexOf('/')
      base = index.substring(0, base)
      let style = base + '/_static/boot.css'
      style = fetchAndFixPaths(style, base).catch((err) => '')
      style = await style
      addAppBootStyle(style)
    }
    try {
      const remote = await fetchVersions().catch((err) => { throw new Error(`fetch versions error - ${err.message}`) })
      state.local = storage.versions()
      storage.verifyHistory(remote, state.local)
      state.remote = remote
    } catch (err) {
      console.log('override boot error', err)
      state.local = storage.versions()
    }
    state.loading = false
    emitter.emit('render')
  }

  const removeUrlHash = () => {
    if (!window.location.hash) { return }
    history.replaceState(null, document.title, window.location.pathname + window.location.search)
  }

  const resume = () => {
    console.log('resume boot', state.version.cid)
    removeUrlHash()
    state.local = storage.versions()
    setInterval(checkForUpdates, updateInterval)
    checkForUpdates()
    state.loading = false
    // boot what has been agreed to
    return boot(state.version)
  }

  const start = () => {
    state.version = storage.version()
    if (!state.version) { return firstBoot() }
    const hash = window.location.hash
    if (hash === '#boot') { return overrideBoot() }
    return resume()
  }

  emitter.on('DOMContentLoaded', () => {
    console.log('dom loaded')
    start().catch((err) => {
      console.log('start error', err)
      state.error = err.message
      emitter.emit('render')
    })
  })

  // make relative paths absolute
  // _static is a special path that IPFS-boot apps use to support rewrite
  const fetchAndFixPaths = (url, base) => fetch(url)
    .then((res) => res.text())
    .then((txt) => txt.replaceAll('/_static', `${base}/_static`))

  const unloadApp = () => {
    window.dispatchEvent(new CustomEvent('unload'))
    removeAllListeners()
    Array.from(document.body.children)
      .filter((child) => child.id.startsWith('_boot') === false)
      .forEach((child) => document.body.removeChild(child))
    Array.from(document.head.children)
      .filter((child) => child.id.startsWith('_boot') === false)
      .forEach((child) => document.head.removeChild(child))
  }

  const addAppBootStyle = (style) => {
    const id = '_boot_css_2'
    document.getElementById(id) && (document.getElementById(id).outerHTML = '')
    const elem = document.createElement('style')
    elem.setAttribute('id', id)
    document.head.appendChild(elem)
    elem.innerHTML = style
  }

  const swapElems = async (base, head, styles, scriptsHead, body, scriptsBody) => {
    // prefetch all early to fail early before edit DOM
    styles.forEach((elem) => elem.txt = fetchAndFixPaths(elem.src, base))
    scriptsHead.forEach((elem) => elem.txt = fetchAndFixPaths(elem.src, base))
    scriptsBody.forEach((elem) => elem.txt = fetchAndFixPaths(elem.src, base))
    let bootStyle = base + '/_static/boot.css'
    bootStyle = fetchAndFixPaths(bootStyle, base).catch((err) => '')
    const all = [...styles, ...scriptsHead, ...scriptsBody, bootStyle]
    await Promise.all(all.map((elem) => elem.txt)).catch((err) => { throw new Error(`fetch styles and/or scripts error - ${err.message}`) })

    // let app know we are about to update
    state.background = true
    emitter.emit('render')
    unloadApp()

    // release choo control
    window._onperformance = []
    delete window.choo

    // add head elements which are not styles or scripts
    head = head.map((elem) => elem.outerHTML).join('')
    document.head.insertAdjacentHTML('beforeend', head)

    // add app boot style
    bootStyle = await bootStyle
    addAppBootStyle(bootStyle)

    // add app styles
    let c = 0
    for (const elem of styles) {
      const style = document.createElement('style')
      style.setAttribute('id', `_app_css_${c++}`)
      document.body.appendChild(style)
      style.innerHTML = await elem.txt
    }

    // add body elements which are not scripts
    body = body.map((elem) => elem.outerHTML).join('')
    document.body.insertAdjacentHTML('beforeend', body)

    c = 0
    // add all js scripts found in head
    for (const elem of scriptsHead) {
      const script = document.createElement('script')
      script.setAttribute('id', `_app_js_${c++}`)
      script.setAttribute('type', elem.type)
      document.body.appendChild(script)
      script.text = await elem.txt
    }

    // add all js scripts found in body
    for (const elem of scriptsBody) {
      const script = document.createElement('script')
      script.setAttribute('id', `_app_js_${c++}`)
      script.setAttribute('type', elem.type)
      document.body.appendChild(script)
      script.text = await elem.txt
    }
  }

  const setSrc = (base, elem) => {
    if (elem.href) {
      elem.src = base + new URL(elem.href).pathname
      elem.href = elem.src
    } else if (elem.src) {
      elem.src = base + new URL(elem.src).pathname
    }
    return elem
  }

  const getIndexUrl = (cid) => {
    // opera, etc
    if (document.location.href.startsWith('ipfs://')) { return `ipfs://${cid}/index.html` }
    // ipfs companion browser extension
    let host = document.location.hostname.split('.').slice(1)
    let port = document.location.port
    port = port ? `:${port}` : ''
    const ipfsCompanion = host[0] === 'ipfs' && host.pop() === 'localhost'
    if (ipfsCompanion) { return `http://${cid}.ipfs.localhost${port}/index.html` }
    // use gateway if already in use else use a default
    const gateways = [`ipfs.dweb.link`, `ipfs.w3s.link`]
    host = document.location.hostname.split('.').slice(1)
    const gateway = host[0] === 'ipfs' ? host.join('.') : gateways[0]
    return `https://${cid}.${gateway}/index.html`
  }

  const fetchVersion = async (cid) => {
    const parser = new DOMParser()
    const index = getIndexUrl(cid)
    let base = index.lastIndexOf('/')
    base = index.substring(0, base)
    const html = await fetch(index).then((res) => res.text()).catch((err) => { throw new Error(`fetch cid index failed - ${err.message}`) })
    const doc = parser.parseFromString(html, 'text/html')
    let head = Array.from(doc.head.childNodes).map((elem) => setSrc(base, elem))
    const styles = head.filter((elem) => elem.localName === 'link' && elem.rel === 'stylesheet')
    const scriptsHead = head.filter((elem) => elem.localName === 'script')
    head = head.filter((elem) => styles.indexOf(elem) < 0 && scriptsHead.indexOf(elem) < 0)
    let body = Array.from(doc.body.childNodes).map((elem) => setSrc(base, elem))
    const scriptsBody = body.filter((elem) => elem.localName === 'script')
    body = body.filter((elem) => scriptsBody.indexOf(elem) < 0)
    return [base, head, styles, scriptsHead, body, scriptsBody]
  }

  const boot = (version) => {
    console.log('boot begin', version.cid)
    return fetchVersion(version.cid).then((arr) => {
      const [base, head, styles, scriptsHead, body, scriptsBody] = arr
      return swapElems(base, head, styles, scriptsHead, body, scriptsBody).then(() => {
        state.version = version
        storage.version(version)
        console.log('boot complete', version.cid)
      })
    })
  }

  const bootOrError = (version) => {
    removeUrlHash()
    state.selected = null
    return boot(version).then(() => {
      const remote = state.remote ?? []
      const latest = remote[remote.length - 1]
      if (equal(version, latest)) {
        state.local = [...remote]
        storage.versions(state.local)
      }
    }).catch((err) => {
      console.log('boot error', err)
      state.error = err.message
      emitter.emit('render')
    })
  }

  emitter.on('bootUpdate', bootOrError)

  emitter.on('select', (version) => {
    state.local = storage.versions()
    state.background && unloadApp()
    state.background = false
    state.selected = version
    emitter.emit('render')
    window.location.hash !== '#boot' && (window.location.href += '#boot')
  })

  emitter.on('dismiss', () => {
    const remote = state.remote ?? []
    state.local = [...remote]
    storage.versions(state.local)
    emitter.emit('render')
  })

  emitter.on('override', () => {
    state.background && unloadApp()
    state.background = false
    emitter.emit('render')
  })
}

let listeners = {}

const interceptListeners = () => {
  window._addEventListener = window.addEventListener
  window.addEventListener = (type, listener, opts=undefined) => {
    let list = listeners[type]
    if (!list) { list = listeners[type] = [] }
    list.push({ l: listener, o: opts })
    window._addEventListener(type, listener, opts)
  }
}

const removeAllListeners = () => {
  Object.keys(listeners).forEach((type) => {
    const list = listeners[type]
    list.forEach((l) => window.removeEventListener(type, l.l, l.o))
  })
  listeners = {}
}

const choo = chooo()

window.addEventListener('hashchange', (event) => {
  if (window.location.hash !== '#boot') { return }
  choo.emit('override')
})

// todo: remove for prod
// allows you to force show an update notif by hit enter key
document.addEventListener('keydown', (event) => {
  if (window.location.hash === '#boot') { return }
  if (event.key !== 'Enter') { return }
  if (!state.version) { return }
  state.local.pop()
  choo.emit('render')
})

interceptListeners()
choo.use(devtools())
choo.use(store)

choo.route('/*', require('./view.js'))
choo.mount('#_boot')
