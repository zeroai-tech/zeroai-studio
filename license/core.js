// ZeroAI Studio Legacy — offline license core (Ed25519).
// Used by BOTH the owner CLI (to mint) and the app (to verify).
// The app embeds only PUBLIC_KEY; the private key never ships.
const crypto = require('crypto')
const os = require('os')

// --- Machine fingerprint: stable per-device, no network, privacy-safe (hashed).
function machineId() {
  const cpus = os.cpus()
  const nets = os.networkInterfaces()
  const mac = Object.values(nets).flat().map(n => n && n.mac).find(m => m && m !== '00:00:00:00:00:00') || ''
  const raw = [os.platform(), os.arch(), os.hostname(), (cpus[0] && cpus[0].model) || '', cpus.length, mac].join('|')
  return crypto.createHash('sha256').update(raw).digest('base64url').slice(0, 20)
}

const b64u = obj => Buffer.from(JSON.stringify(obj)).toString('base64url')
const unb64u = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))

// --- Owner side: create the one-time keypair (keep private.pem SECRET, offline).
function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicPem:  publicKey.export({ type: 'spki', format: 'pem' }),
  }
}

// --- Owner side: mint a license bound to one school's machine.
function mint({ school, machine, plan = 'legacy', days = 0 }, privatePem) {
  const payload = { school, machine, plan, iat: Date.now(),
                    exp: days > 0 ? Date.now() + days * 864e5 : 0 }
  const head = b64u(payload)
  const sig = crypto.sign(null, Buffer.from(head), privatePem).toString('base64url')
  return `ZAI1.${head}.${sig}`   // ZAI1 = format version
}

// --- App side: verify a pasted key against THIS machine (offline, no network).
function verify(key, publicPem, thisMachine = machineId()) {
  try {
    const [ver, head, sig] = String(key).trim().split('.')
    if (ver !== 'ZAI1' || !head || !sig) return { ok: false, reason: 'malformed key' }
    const good = crypto.verify(null, Buffer.from(head), publicPem, Buffer.from(sig, 'base64url'))
    if (!good) return { ok: false, reason: 'invalid signature (forged or edited key)' }
    const p = unb64u(head)
    if (p.machine !== thisMachine) return { ok: false, reason: 'key is for a different machine' }
    if (p.exp && Date.now() > p.exp) return { ok: false, reason: 'license expired' }
    return { ok: true, license: p }
  } catch (e) { return { ok: false, reason: 'unreadable key' } }
}

module.exports = { machineId, generateKeypair, mint, verify }
