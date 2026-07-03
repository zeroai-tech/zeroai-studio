# ZeroAI Studio

The ZeroAI STEM suite as **one installable desktop app** — Adobe-Creative-Cloud
style. An Electron shell with a branded launcher: the five apps (ZeroSpark,
ZaiSim, ZaiBlock, ZaiPy, ZaiCAD) **install on demand** from the catalog, run
fully **offline**, and save projects locally. Windows · macOS · Linux.

## Run it locally

```bash
npm install     # downloads the Electron binary
npm start       # opens the Studio launcher
```

## How it works

- `main.js` registers a privileged **`app://`** scheme. `app://studio/` is the
  bundled launcher; every other host serves an installed app from the user's
  data dir. Absolute asset paths (`/assets/…`) work as-is — no per-app rebuild —
  and security headers are set per app (COOP/COEP for ZaiPy's Pyodide via
  `NEEDS_COI`).
- The launcher reads **`manifest.json` from this repo's `main` branch** and
  installs each app zip from the pinned release URL. Downloads are verified
  against the manifest's **sha256** before extraction.
- `preload.js` gives every app `window.__ZEROAI_DESKTOP__`, the shared Supabase
  config, and offline project save/load (including proprietary `.zspark`/`.zsim`/…
  project files).

## Publishing app updates (the pipeline)

Apps in users' Studios update from the catalog — **web deploys alone don't
reach desktop users.** To ship fresh bundles:

**Automated (preferred):** Actions → *Publish app bundles* → enter a version
like `1.2.0`. The workflow builds each app repo, zips the dists, publishes an
`apps-v1.2.0` release here, and commits the `manifest.json` bump (versions,
sizes, sha256, URLs). Every installed Studio then shows the updates on refresh.
Requires the `APPS_PAT` repo secret (fine-grained PAT: read on the five
`Lottie128/<app>` repos, read/write contents here).

**Manual:** build each `dist/`, zip its *contents* (index.html at zip root),
`gh release create apps-vX.Y.Z ... *.zip`, update `manifest.json` accordingly.

## Shell releases

Push a `vX.Y.Z` tag → `.github/workflows/release.yml` builds and attaches
installers (mac dmg x64/arm64 · one universal Windows NSIS exe · Linux
AppImage/deb). The launcher checks the releases feed and shows a "Studio vX.Y.Z
is out" chip to users on older shells (interim until electron-updater lands).

## Classroom / lab provisioning

- **Install all** — one click in the launcher installs the whole suite.
- **Headless imaging** — `"ZeroAI Studio" --install-all` installs every catalog
  app with progress on stdout and exits (for lab setup scripts).
- **Full offline installer** — bake the suite into the installer itself for
  schools with poor connectivity:

  ```bash
  node scripts/bundle-apps.cjs   # downloads + verifies current catalog zips
  npm run dist:full              # installer with bundled-apps seeded on first run
  ```

## Code signing (TODO — needs accounts)

Unsigned builds trigger Gatekeeper/SmartScreen warnings. When ready:
1. **macOS:** Apple Developer Program ($99/yr) → `Developer ID Application`
   cert → add `CSC_LINK`/`CSC_KEY_PASSWORD` + notarization (`APPLE_ID`,
   `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) as repo secrets —
   electron-builder picks them up in the existing release workflow.
2. **Windows:** Azure Trusted Signing (cheapest) or an OV/EV cert →
   electron-builder `win.signtoolOptions`/`azureSignOptions`.
