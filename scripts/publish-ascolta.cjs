// Reuse the existing APPS_PAT in this repository. Never expose source or tokens
// in the public download repository. Publish only a fully successful main build.
const { execFileSync } = require('node:child_process')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const source = 'zeroai-tech/ascolta', destination = 'zeroai-tech/ascolta-releases'
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const api = endpoint => JSON.parse(gh('api', endpoint))
const head = api(`repos/${source}/commits/main`).sha
const runs = api(`repos/${source}/actions/workflows/build.yml/runs?branch=main&status=success&per_page=10`).workflow_runs
const run = runs.find(run => run.head_sha === head && ['push', 'workflow_dispatch'].includes(run.event))
if (!run) { console.log('No successful installer build for the current Ascolta main commit yet.'); process.exit(0) }
const tag = `build-${run.id}-${run.head_sha.slice(0, 12)}`
if (api(`repos/${destination}/releases?per_page=30`).some(release => release.tag_name === tag && !release.draft)) {
  console.log(`Already published ${tag}`); process.exit(0)
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ascolta-release-'))
try {
  gh('run', 'download', String(run.id), '--repo', source, '--pattern', 'ascolta-*', '--dir', dir)
  const files = fs.readdirSync(dir).flatMap(folder => fs.readdirSync(path.join(dir, folder)).filter(name => /\.(exe|AppImage)$/.test(name)).map(name => path.join(dir, folder, name)))
  if (!files.some(file => file.endsWith('.exe')) || !files.some(file => file.endsWith('.AppImage'))) throw new Error('Both Windows and Linux installers must be present before publishing.')
  const notes = path.join(dir, 'notes.md')
  fs.writeFileSync(notes, `Windows x64 and Linux x64 installers from Ascolta commit ${run.head_sha}.\n\nModule tests and packaged-app startup checks passed on both platforms. Live audio, licence activation and cloud transcription were not exercised by these checks. Installers are unsigned.\n\nMac installers remain available in earlier releases.\n`)
  // Upload into a draft first; users only see it after every asset is attached.
  const existing = api(`repos/${destination}/releases?per_page=30`).find(release => release.tag_name === tag)
  if (!existing) gh('release', 'create', tag, '--repo', destination, '--draft', '--title', `Ascolta desktop build ${run.run_number}`, '--notes-file', notes)
  gh('release', 'upload', tag, ...files, '--repo', destination, '--clobber')
  gh('release', 'edit', tag, '--repo', destination, '--draft=false', '--latest')
  console.log(`Published https://github.com/${destination}/releases/tag/${tag}`)
} finally { fs.rmSync(dir, { recursive: true, force: true }) }
