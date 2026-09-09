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
const trialPath   = (userDataDir) => path.join(userDataDir, 'trial.dat')

// How long a self-service trial lasts.
//
// The trial exists because "email ZeroAI for a key" is a dead end for anyone
// evaluating the software cold: a teacher trying it before recommending a
// purchase, a university deciding whether it fits their programme, or a
// developer who found it online. They will not wait a day for a reply, they
// will close it. So the app grants itself a trial on first run, offline, with
// nothing to contact.
//
// This is honest about what it can enforce. A determined person can delete
// trial.dat and start again, and there is no way around that for software whose
// entire promise is that it never touches a network. The trial is here to let
// someone evaluate the product, not to stop a thief. What it does prevent is
// the case that actually matters commercially: a school putting the installer
// on forty machines and using it for a year without ever buying a licence.
const TRIAL_DAYS = 30

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

/**
 * Trial state for this machine.
 *
 * Bound to machineId so the file cannot simply be copied to another computer,
 * and carries a `seen` timestamp so winding the clock back is detectable. A
 * clock that has moved backwards past the last run ends the trial rather than
 * extending it.
 */
function trialStatus(userDataDir) {
  let rec
  try {
    rec = JSON.parse(fs.readFileSync(trialPath(userDataDir), 'utf8'))
  } catch {
    return { ok: false, started: false, reason: 'no trial started' }
  }

  const now = Date.now()
  if (rec.machine !== machineId()) return { ok: false, started: true, reason: 'trial belongs to another machine' }
  if (typeof rec.start !== 'number')  return { ok: false, started: true, reason: 'unreadable trial' }
  // A clock earlier than the last recorded run means the date was changed.
  if (typeof rec.seen === 'number' && now < rec.seen - 864e5) {
    return { ok: false, started: true, reason: 'system clock moved backwards' }
  }

  const endsAt   = rec.start + TRIAL_DAYS * 864e5
  const daysLeft = Math.max(0, Math.ceil((endsAt - now) / 864e5))
  if (now > endsAt) return { ok: false, started: true, expired: true, daysLeft: 0, reason: 'trial ended' }

  // Record this run so a later clock change is visible.
  try { fs.writeFileSync(trialPath(userDataDir), JSON.stringify({ ...rec, seen: now }), { mode: 0o600 }) } catch { /* read-only disk is not a reason to lock someone out */ }
  return { ok: true, started: true, daysLeft, endsAt }
}

/** Begin the trial. Does nothing if one was already started on this machine. */
function startTrial(userDataDir) {
  const existing = trialStatus(userDataDir)
  if (existing.started) return existing
  const now = Date.now()
  try {
    fs.writeFileSync(trialPath(userDataDir),
      JSON.stringify({ machine: machineId(), start: now, seen: now }), { mode: 0o600 })
  } catch (e) {
    return { ok: false, started: false, reason: 'could not write trial file' }
  }
  return trialStatus(userDataDir)
}

/**
 * May this machine open the studio, and on what basis?
 *
 * A paid licence always wins. A trial is only consulted when there is no
 * licence, so activating during a trial upgrades cleanly and the trial file
 * becomes irrelevant rather than needing to be cleaned up.
 */
function access(userDataDir) {
  const lic = status(userDataDir)
  if (lic.ok) return { ok: true, kind: 'licensed', license: lic.license }

  const trial = trialStatus(userDataDir)
  if (trial.ok) return { ok: true, kind: 'trial', daysLeft: trial.daysLeft, endsAt: trial.endsAt }

  return {
    ok: false,
    kind: trial.expired ? 'trial-expired' : (trial.started ? 'blocked' : 'none'),
    reason: trial.started ? trial.reason : lic.reason,
    trialAvailable: !trial.started,
  }
}

// Verify a pasted key against this machine; persist it on success.
function activate(userDataDir, key) {
  if (!PUBLIC) return { ok: false, reason: 'no public key bundled' }
  const res = verify(key, PUBLIC)
  if (res.ok) fs.writeFileSync(licensePath(userDataDir), String(key).trim(), { mode: 0o600 })
  return res
}

module.exports = { machineId, status, activate, trialStatus, startTrial, access,
                   TRIAL_DAYS, hasPublicKey: () => !!PUBLIC }
