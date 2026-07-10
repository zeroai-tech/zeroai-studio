#!/usr/bin/env node
// Package "ZeroAI Studio Legacy": swap in the offline config (legacy=true, no
// Supabase), build the Windows installer, then ALWAYS restore the online config.
// Run `node scripts/bundle-apps-legacy.cjs` first to bake the offline app builds.
const fs = require('node:fs'); const path = require('node:path'); const { execSync } = require('node:child_process')
const root = path.join(__dirname, '..')
const CFG = path.join(root, 'studio.config.json'); const BAK = CFG + '.online.bak'
const legacyCfg = { supabaseUrl: '', supabaseAnonKey: '', legacy: true }

fs.copyFileSync(CFG, BAK)
try {
  fs.writeFileSync(CFG, JSON.stringify(legacyCfg, null, 2))
  execSync(
    'npx electron-builder --win zip -c.productName="ZeroAI Studio Legacy" -c.appId=tech.zeroai.studio.legacy --publish never',
    { cwd: root, stdio: 'inherit' },
  )
} finally {
  fs.copyFileSync(BAK, CFG); fs.rmSync(BAK)   // always restore the online config
  console.log('restored online studio.config.json')
}
