const html = require('choo/html')

function empty() {
  return html`<div id="_boot"></div>`
}

function brand() {
  return html`<span class="bootBrand">IPFS-boot</span>`
}

function loadingView() {
  return html`
    <div id="_boot">
      <main class="bootScreen bootStatus" aria-busy="true">
        <div class="bootStatusInner" role="status">
          ${brand()}
          <h1>Loading versions…</h1>
          <p>Getting your available releases.</p>
        </div>
      </main>
    </div>`
}

function bootError(state, emit) {
  const { error } = state._boot
  return html`
    <div id="_boot">
      <main class="bootScreen bootStatus">
        <div class="bootStatusInner">
          ${brand()}
          <h1>Unable to boot</h1>
          <p class="bootError" role="alert">${error}</p>
          <button type="button" class="bootPrimary" onclick=${() => window.location.reload()}>Try again</button>
        </div>
      </main>
    </div>`
}

const equal = (a, b) => a?.cid === b?.cid && a?.version === b?.version
const shortCid = (cid) => cid.length > 24 ? `${cid.slice(0, 8)}…${cid.slice(-11)}` : cid

const copyCid = (cid) => async (event) => {
  const group = event.currentTarget.closest('.bootCid')
  const status = group.querySelector('.bootCopyStatus')
  try {
    await navigator.clipboard.writeText(cid)
    status.textContent = 'Copied!'
  } catch (err) {
    group.querySelector('details').open = true
    status.textContent = 'Select the full ID to copy it.'
  }
}

function bootList(state, emit) {
  let { remote, local, name, repo, version, selected } = state._boot
  // newer than installed
  remote = remote ?? local
  let neww = remote.findIndex((r) => equal(r, version))
  neww = neww >= 0 ? neww + 1 : 0
  neww = remote.slice(neww)

  // deduplicate options
  let options = new Set(local.concat(neww).map((v) => v.version))
  options = [...options].map((v) => {
    return local.find((l) => l.version === v) ?? neww.find((n) => n.version === v)
  })

  // selection or default
  options.sort((a, b) => b.timems - a.timems)
  const latest = options[0]
  selected = selected ?? latest

  const items = options.map((v) => {
    const checked = equal(selected, v)
    const disabled = !(equal(v, version) || neww.find((n) => equal(n, v)))
    const date = new Date(v.timems)
    return html`
      <label class="bootVersion ${checked ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}" for=${v.cid}>
        <input type="radio" name="boot-version" id=${v.cid} value=${v.cid}
          checked=${checked} disabled=${disabled} onchange=${() => emit('select', v)}
          aria-label=${`${v.version}${equal(v, latest) ? ', latest release' : ''}${equal(v, version) ? ', current version' : ''}`} />
        <span class="bootVersionName">
          <strong>${v.version}</strong>
          ${equal(v, latest) ? html`<span class="bootBadge">Latest</span>` : ''}
          ${equal(v, version) ? html`<span class="bootBadge bootBadgeCurrent">Current</span>` : ''}
        </span>
        <time datetime=${date.toISOString()} title=${date.toLocaleString()}>${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
        <code class="bootVersionCid" title=${v.cid}>${shortCid(v.cid)}</code>
      </label>`
  })

  // option button
  const onClick = () => emit('bootUpdate', selected)
  const button = html`
    <button type="button" class="bootPrimary" onclick=${onClick}>
      ${equal(version, selected) ? 'Resume' : 'Boot'} ${selected.version}
    </button>`

  // selection
  const detail = html`
    <section class="bootDetails" aria-label=${`${selected.version} details`}>
      <h2>Release notes</h2>
      <p class="bootNotes">${selected.notes}</p>
      <div class="bootCid" id=${`boot-cid-${selected.cid}`}>
        <h2>Content ID</h2>
        <div class="bootCidField">
          <details>
            <summary aria-label="Show full content ID" title="Show full content ID">
              <code>${shortCid(selected.cid)}</code>
            </summary>
            <code class="bootFullCid">${selected.cid}</code>
          </details>
          <button type="button" class="bootCopy" aria-label="Copy content ID" title="Copy content ID" onclick=${copyCid(selected.cid)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="8" y="3" width="13" height="15" rx="2" />
              <path d="M16 18v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
            </svg>
          </button>
        </div>
        <span class="bootCopyStatus" role="status" aria-live="polite"></span>
      </div>
    </section>`

  // join
  return html`
    <div id="_boot">
      <main class="bootScreen">
        <div class="bootList">
          <header class="bootHeader">
            ${brand()}
            <h1 class="bootTitle"><span>${name}</span></h1>
            <p class="bootDocs">Choose a version to open. Updates require your approval.</p>
            <a class="bootSource" target="_blank" rel="noopener noreferrer" href=${repo}>View source</a>
          </header>
          <fieldset class="bootVersions">
            <legend class="bootSrOnly">Choose a version</legend>
            ${items}
          </fieldset>
          ${detail}
          ${button}
          <p class="bootReturn">Return to this screen with <code>#boot</code></p>
        </div>
      </main>
    </div>`
}

module.exports = function main(state, emit) {
  const { loading, background, error } = state._boot
  const { remote, local, version, selected } = state._boot

  if (loading && !error) {
    return loadingView()
  } else if (!background && error) {
    return bootError(state, emit)
  } else if (!background && !version) { // first boot
    return bootList(state, emit)
  } else if (!background || selected) { // user wants list
    return bootList(state, emit)
  }

  // no updates
  if (!remote || (remote.length === local.length)) {
    return empty()
  }

  // show notif
  const latest = remote[remote.length - 1]
  const select = () => emit('select', latest)
  const dismiss = () => emit('dismiss')
  return html`
    <div id="_boot">
      <div class="toastContainer">
        <aside class="toastMessage bootNotif" aria-label="App update">
          <div class="bootNotifText" role="status">
            <strong>Update available</strong>
            <span>${latest.version} is ready for review.</span>
          </div>
          <div class="bootNotifActions">
            <button type="button" class="bootNotifSelect" onclick=${select}>Review update</button>
            <button type="button" class="bootNotifDismiss" onclick=${dismiss}>Dismiss</button>
          </div>
        </aside>
      </div>
    </div>`
}
