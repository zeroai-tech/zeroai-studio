#!/usr/bin/env node
// ZeroAI Studio Legacy — OWNER licensing CLI (offline, for Lottie only).
//   node cli.js keygen                 → make the one-time keypair (KEEP private.pem SECRET)
//   node cli.js machine                → print this machine's id (when you're at a school)
//   node cli.js mint --school "Name" --machine <id> [--days 365]
//   node cli.js verify <key>           → test a key against this machine
const fs = require('fs'); const path = require('path'); const L = require('./core')
const PRIV = path.join(__dirname, 'private.pem'); const PUB = path.join(__dirname, 'public.pem')
const [cmd, ...args] = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d }
const die = m => { console.error(m); process.exit(1) }

if (cmd === 'keygen') {
  if (fs.existsSync(PRIV) && args.indexOf('--force') < 0)
    die('private.pem already exists. Refusing (use --force ONLY if you mean to invalidate every key).')
  const kp = L.generateKeypair()
  fs.writeFileSync(PRIV, kp.privatePem, { mode: 0o600 })
  fs.writeFileSync(PUB, kp.publicPem)
  console.log('✓ keypair created.\n  private.pem  → SECRET. Back it up offline. NEVER commit or ship it.\n  public.pem   → ships inside the app (safe to share).')
} else if (cmd === 'machine') {
  console.log(L.machineId())
} else if (cmd === 'mint') {
  const school = flag('school'), machine = flag('machine'), days = Number(flag('days', 0))
  if (!school || !machine) die('usage: mint --school "Name" --machine <id> [--days 365]')
  if (!fs.existsSync(PRIV)) die('no private.pem — run `node cli.js keygen` first.')
  const key = L.mint({ school, machine, days }, fs.readFileSync(PRIV))
  console.log(key + `\n\n  → give this to ${school} (WhatsApp/paper). Works only on machine ${machine}.`)
} else if (cmd === 'verify') {
  if (!fs.existsSync(PUB)) die('no public.pem'); console.log(L.verify(args[0], fs.readFileSync(PUB)))
} else {
  console.log('commands: keygen | machine | mint --school "X" --machine <id> [--days N] | verify <key>')
}
