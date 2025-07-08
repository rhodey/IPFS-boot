const html = require('choo/html')

function empty() {
  return html`<div id="_boot"></div>`
}

function bootError(state, emit) {
  const { error } = state._boot
  return html`<div id="_boot">Error: ${error}</div>`
}

const equal = (a, b) => a?.cid === b?.cid && a?.version === b?.version

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
    const onClick = (e) => emit('select', v)
    const checked = equal(selected, v) ? 'checked' : ''
    const disabled = equal(v, version) || neww.find((n) => equal(n, v)) ? '' : 'disabled'
    return html`
      <tr>
        <td>${new Date(v.timems).toLocaleString()}</td>
        <td>${v.version}</td>
        <td>...${v.cid.substr(48)}</td>
        <td><input type="radio" id="${v.cid}" onclick=${onClick} ${checked} ${disabled}></input></td>
      </tr>`
  })

  // option button
  const onClick = () => emit('bootUpdate', selected)
  const button = equal(version, selected) ?
    html`<button onclick=${onClick}>resume!</button>`
    : html`<button onclick=${onClick}>boot!</button>`

  // selection
  const detail = html`
    <div>
      <h1>${selected.version}</h1>
      <h2>${selected.cid}</h2>
      <span class="bootNotes">${selected.notes}</span>
      <br/><br/>
      ${button}
    </div>`

  // join
  return html`
    <div id="_boot">
      <div class="bootList">
        <h1>IPFS-boot!</h1>
        <h2>${name} source code is organized <a target="_blank" href="${repo}">here</a></h2>
        <span class="bootDocs">
          You will be notified of updates, and anytime you want to come back here add #boot to the url
        </span>
        <br/><br/>
        <h1>Versions ...</h1>
        <table>
          <tr>
            <th>Date</th>
            <th>V</th>
            <th>CID</th>
            <th></th>
          </tr>
          ${items}
        </table>
        <br/>
        ${detail}
      </div>
    </div>`
}

module.exports = function main(state, emit) {
  const { loading, background, error } = state._boot
  const { remote, local, version, selected } = state._boot

  if (loading && !error) {
    return empty()
  } else if (!background && error) {
    return bootError(state, emit)
  } else if (!version) { // first boot
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
        <div class="toastMessage toastSuccess bootNotif">
          <span class="bootNotifText">
            A new update is available<br/>
            <a class="bootNotifSelect" onclick=${select}>details</a> or <a class="bootNotifDismiss" onclick=${dismiss}>dismiss</a>
          </span>
        </div>
      </div>
    </div>`
}
