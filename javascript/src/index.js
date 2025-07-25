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
  const safe = (val) => {
    const doc = new DOMParser().parseFromString('' + val, 'text/html')
    return doc.body.textContent || ''
  }

  const fetchVersions = (timeout) => {
    return fetch(versionsUrl, timeout).then((res) => res.json()).then((json) => {
      if (typeof json?.name !== 'string') {
        throw new Error('remote versions invalid')
      } else if (typeof json?.repo !== 'string') {
        throw new Error('remote versions invalid')
      } else if (!Array.isArray(json?.arr)) {
        throw new Error('remote versions invalid')
      } else if (json.arr.length <= 0) {
        throw new Error('remote versions length 0')
      }
      json.name = safe(json.name)
      json.repo = safe(json.repo)
      json.arr.forEach((e) => {
        e.cid = safe(e.cid)
        e.version = safe(e.version)
        e.notes = safe(e.notes)
        e.timems = parseInt(e.timems)
      })
      json.arr.sort((a, b) => a.timems - b.timems)
      return json
    })
  }

  const removeUrlHash = () => {
    if (!window.location.hash) { return }
    history.replaceState(null, document.title, window.location.pathname + window.location.search)
  }

  const loadLocal = () => {
    const local = storage.versions()
    if (!local) { return }
    state.name = local.name
    state.repo = local.repo
    state.local = local.arr
  }

  const setRemoteSafe = (remote, store=true) => {
    const arr = Array.isArray(remote) ? remote : remote.arr
    state.local && storage.verifyHistory(arr, state.local)
    state.remote = arr
    if (!store) { return }
    state.name = remote.name ?? state.name
    state.repo = remote.repo ?? state.repo
    state.local = [...state.remote]
    storage.versions({ name: state.name, repo: state.repo, arr: state.local })
  }

  const checkForUpdates = () => {
    fetchVersions().then((remote) => {
      setRemoteSafe(remote, false)
      if (state.remote.length === state.local.length) { return }
      // will show update notif
      emitter.emit('render')
    }).catch((err) => {
      console.log('check updates', err)
    })
  }

  const firstBoot = async () => {
    console.log('first')
    const remote = await fetchVersions().catch((err) => { throw new Error(`fetch versions error - ${err.message}`) })
    setRemoteSafe(remote)
    setInterval(checkForUpdates, updateInterval)
    state.loading = false
    // will show boot list
    emitter.emit('render')
  }

  const showBootList = async () => {
    console.log('list')
    if (state.version) {
      // custom boot style
      const base = getCidUrl(state.version.cid)
      let style = base + '/_static/boot.css'
      style = await fetchAndFixPaths(style, base).catch((err) => '')
      addBootStyle(style)
    }
    loadLocal()
    try {
      // app still loads if remote is down
      const remote = await fetchVersions().catch((err) => { throw new Error(`fetch versions error - ${err.message}`) })
      setRemoteSafe(remote, false)
    } catch (err) {
      console.log('list', err)
    }
    state.loading = false
    emitter.emit('render')
  }

  const resume = () => {
    console.log('resume', state.version.cid)
    loadLocal()
    removeUrlHash()
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
    if (hash === '#boot') { return showBootList() }
    return resume()
  }

  emitter.on('DOMContentLoaded', () => {
    console.log('dom')
    start().catch((err) => {
      console.log('start', err)
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

  const addBootStyle = (style) => {
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
    addBootStyle(bootStyle)

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

  const getCidUrl = (cid) => {
    // opera, etc
    if (document.location.href.startsWith('ipfs://')) { return `ipfs://${cid}` }
    // ipfs companion extension
    let host = document.location.hostname.split('.').slice(1)
    let port = document.location.port
    port = port ? `:${port}` : ''
    const ipfsCompanion = host[0] === 'ipfs' && host.pop() === 'localhost'
    if (ipfsCompanion) { return `http://${cid}.ipfs.localhost${port}` }
    // use gateway (will be intercepted by sw.js)
    return `https://${cid}.ipfs.dweb.link`
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

  const fetchVersion = async (cid) => {
    const parser = new DOMParser()
    const base = getCidUrl(cid)
    const html = await fetch(base + '/index.html').then((res) => res.text()).catch((err) => { throw new Error(`fetch cid index failed - ${err.message}`) })
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
    console.log('begin', version.cid)
    return fetchVersion(version.cid).then((arr) => {
      const [base, head, styles, scriptsHead, body, scriptsBody] = arr
      return swapElems(base, head, styles, scriptsHead, body, scriptsBody).then(() => {
        state.version = version
        storage.version(version)
        console.log('complete', version.cid)
      })
    })
  }

  const bootOrError = (version) => {
    removeUrlHash()
    state.selected = null
    return boot(version).then(() => {
      const remote = state.remote ?? []
      const latest = remote[remote.length - 1]
      if (!equal(version, latest)) { return }
      setRemoteSafe(remote)
    }).catch((err) => {
      console.log('error', err)
      state.error = err.message
      emitter.emit('render')
    })
  }

  emitter.on('bootUpdate', bootOrError)

  emitter.on('select', (version) => {
    loadLocal()
    state.background && unloadApp()
    state.background = false
    state.selected = version
    emitter.emit('render')
    window.location.hash !== '#boot' && (window.location.href += '#boot')
  })

  emitter.on('dismiss', () => {
    setRemoteSafe(state.remote)
    emitter.emit('render')
  })

  emitter.on('show', () => {
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
  choo.emit('show')
})

// todo: remove for prod
// allows you to force show an update notif by hit enter key
document.addEventListener('keydown', (event) => {
  if (window.location.hash === '#boot') { return }
  if (event.key !== 'Enter') { return }
  if (!state.version) { return }
  if (!state.remote) { return }
  state.local.pop()
  choo.emit('render')
})

// service worker
// app still works if fails to load
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((reg) => console.log('sw init'))
    .catch((err) => console.log('sw error', err))
}

interceptListeners()
choo.use(devtools())
choo.use(store)

choo.route('/*', require('./view.js'))
choo.mount('#_boot')
