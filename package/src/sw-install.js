module.exports = function swInstall() {
  if (!('serviceWorker' in navigator)) { return Promise.resolve() }
  const sw = navigator.serviceWorker
  return new Promise((resolve) => {
    let finished = false
    const finish = () => {
      finished = true
      clearTimeout(timer)
      sw.removeEventListener('controllerchange', controlled)
      resolve()
    }
    const controlled = () => {
      if (sw.controller) { finish() }
    }
    // Keep gateway loading available if installation or claiming never finishes.
    const timer = setTimeout(() => {
      console.log('sw control timeout')
      finish()
    }, 15_000)
    sw.addEventListener('controllerchange', controlled)
    sw.register('/sw.js').then(async (reg) => {
      console.log('sw init')
      if (finished) { return }
      if (!reg.active) { reg = await sw.ready }
      if (finished) { return }
      const script = new URL('/sw.js', reg.scope).href
      if (reg.active?.scriptURL !== script) { return finish() }
      // Hard reload leaves an existing worker active but the page uncontrolled.
      reg.active.postMessage('ipfs-boot:claim')
      controlled()
    }).catch((err) => {
      console.log('sw error', err)
      finish()
    })
    controlled()
  })
}
