// CI helper: writes studio.config.json from the live site's PUBLIC config so the
// installer build is zero-config (no secrets to set up). The anon key is public —
// it already ships in every web bundle — so extracting it here is safe.
// To use your own values instead, set env SUPABASE_URL + SUPABASE_ANON_KEY.
const https = require('node:https')
const fs = require('node:fs')

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ci' } }, r => {
      if ([301, 302, 307, 308].includes(r.statusCode) && r.headers.location && redirects < 6) {
        r.resume(); return resolve(get(r.headers.location, redirects + 1))
      }
      let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d))
    }).on('error', reject)
  })
}

;(async () => {
  let url = process.env.SUPABASE_URL || ''
  let key = process.env.SUPABASE_ANON_KEY || ''
  if (!url || !key) {
    const html = await get('https://spark.zeroaitech.tech/')
    const assets = [...html.matchAll(/\/assets\/[^"]+\.js/g)].map(m => m[0])
    for (const a of assets) {
      const js = await get('https://spark.zeroaitech.tech' + a)
      url = url || (js.match(/https:\/\/[a-z0-9]{18,}\.supabase\.co/) || [])[0] || ''
      key = key || (js.match(/eyJ[\w-]{20,}\.eyJ[\w-]{40,}\.[\w-]{20,}/) || [])[0] || ''
      if (url && key) break
    }
  }
  if (!url || !key) { console.error('Could not resolve Supabase config'); process.exit(1) }
  fs.writeFileSync('studio.config.json', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }, null, 2))
  console.log('studio.config.json written (url set, key len ' + key.length + ')')
})().catch(e => { console.error(e.message); process.exit(1) })
