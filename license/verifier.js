// App-side license verifier for ZeroAI Studio Legacy.
// Embeds only the PUBLIC key (public.pem) — the private key never ships.
const fs = require('fs')
const path = require('path')
const { machineId, verify } = require('./core')

let PUBLIC = ''
try {
  PUBLIC = fs.readFileSync(path.join(__dirname, 'public.pem'), 'utf8')
} catch { /* no key bundled → licensing effectively disabled (status stays not-activated) */ }

const licensePath = (userDataDir) => path.join(userDataDir, 'license.dat')

// { ok, license } if this machine is licensed; { ok:false, reason } otherwise.
function status(userDataDir) {
  if (!PUBLIC) return { ok: false, reason: 'no public key bundled' }
  try {
    const key = fs.readFileSync(licensePath(userDataDir), 'utf8')
    return verify(key, PUBLIC)
  } catch {
    return { ok: false, reason: 'not activated' }
  }
}

// Verify a pasted key against this machine; persist it on success.
function activate(userDataDir, key) {
  if (!PUBLIC) return { ok: false, reason: 'no public key bundled' }
  const res = verify(key, PUBLIC)
  if (res.ok) fs.writeFileSync(licensePath(userDataDir), String(key).trim(), { mode: 0o600 })
  return res
}

module.exports = { machineId, status, activate, hasPublicKey: () => !!PUBLIC }
