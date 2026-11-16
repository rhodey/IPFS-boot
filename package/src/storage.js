const equal = (a, b) => a?.cid === b?.cid && a?.version === b?.version && a?.timems === b?.timems

function verifyHistory(remote, local) {
  remote.sort((a, b) => a.timems - b.timems)
  local.sort((a, b) => a.timems - b.timems)

  let ok = local.every((l) => remote.some((r) => equal(r, l)))
  if (!ok) { throw new Error('remote is missing one or more versions found in local') }

  const localLatest = local[local.length - 1]
  const idx = remote.findIndex((e) => equal(e, localLatest))

  ok = (idx + 1) === local.length
  if (!ok) { throw new Error('remote is trying to add versions into the past') }

  remote = remote.slice(idx + 1)
  ok = remote.every((r) => r.timems > localLatest.timems)
  if (!ok) { throw new Error('remote is trying to add versions into the past') }
}

function versions(versions) {
  if (!versions) {
    const value = localStorage.getItem('versions')
    return value ? JSON.parse(value) : null
  }
  versions = JSON.stringify(versions)
  localStorage.setItem('versions', versions)
}

function version(version) {
  if (!version) {
    const value = localStorage.getItem('version')
    return value ? JSON.parse(value) : null
  }
  version = JSON.stringify(version)
  localStorage.setItem('version', version)
}

module.exports = {
  verifyHistory,
  versions,
  version
}
