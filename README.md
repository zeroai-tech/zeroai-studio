# ZeroAI Studio

The ZeroAI STEM suite as **one installable desktop app**. An Electron shell
around a single build of [`zeroai-studio-hub`](https://github.com/Lottie128/zeroai-studio-hub):
the dashboard and all six apps (ZeroSpark, ZaiSim, ZaiBlock, ZaiPy, ZaiCAD,
ZaiMind) ship together, run offline, and save projects locally.
Windows · macOS · Linux.

Two editions:

| | Online | Legacy |
| --- | --- | --- |
| Accounts, classes, competitions | yes | none — the machine is the account |
| AI assistant | the shared relay | `lib/offlineTutor.ts`, a scripted rule table |
| Python | Pyodide from a CDN | Pyodide vendored into the payload |
| Network needed | yes | **never** |

Legacy installs from a USB stick onto a school machine that has no internet
and never will.

## Run it locally

```bash
npm install                # downloads the Electron binary
npm run bundle:hub         # builds the hub from ../zeroai-studio-hub
npm start
```

The hub must sit beside this repo as `../zeroai-studio-hub`; that is where
`scripts/bundle-hub.cjs` looks. `npm start` falls back to its `dist/` directly
if no payload is staged.

## How it works

- `main.js` registers a privileged **`app://`** scheme. `app://studio/` serves
  the hub, and each app is a path under it (`app://studio/zaipy`) resolved by
  the SPA fallback, exactly as on the web. Absolute asset paths (`/assets/…`)
  work as-is.
- `scripts/bundle-hub.cjs` builds the hub once and stages it in `payload/`,
  stamped with which edition it is. `pack-legacy.cjs` refuses to package a
  payload stamped `online` — shipping the wrong edition is invisible until a
  school opens the app and finds a login form it cannot answer.
- `preload.js` gives every app `window.__ZEROAI_DESKTOP__`, the shared Supabase
  config, and offline project save/load (including proprietary `.zspark`/`.zsim`/…
  project files). Its `appId()` reads the first path segment, not the hostname:
  under one host all six apps would otherwise share a single project folder.
- Cross-origin isolation is off. It used to be set per app for ZaiPy's Pyodide,
  which is not possible now they share a host, and applying it to all of them
  breaks ZeroSpark's font loading. Pyodide degrades on its own: Stop becomes
  best-effort rather than guaranteed, the same trade the web app makes.

## Building the installers

```bash
npm run dist:mac      # online edition
npm run dist:legacy   # offline edition, mac + win + linux
```

Each stages its own payload first. They used to share one `bundled-apps/`
directory and `dist:mac` never re-ran a bundler, so whichever edition was
built last silently decided what the *other* one shipped — which is why the
released 0.4.0 online DMGs contain `VITE_LEGACY=1` apps.

Legacy additionally needs Pyodide vendored in the hub first
(`bun run vendor:pyodide` there, 205MB); the hub's build refuses to produce an
offline bundle without it.

**Apps no longer update from a catalog.** They are not separate installs any
more — shipping a new app version means shipping a new Studio.

## Shell releases

Push a `vX.Y.Z` tag → `.github/workflows/release.yml` builds and attaches
installers (mac dmg x64/arm64 · one universal Windows NSIS exe · Linux
AppImage/deb). The launcher checks the releases feed and shows a "Studio vX.Y.Z
is out" chip to users on older shells (interim until electron-updater lands).

## Classroom / lab provisioning

The whole suite is in the installer, so there is nothing to install per app.
For a school with no connectivity, use the Legacy edition: one NSIS installer
on a USB stick, then activate with a machine-bound key
(`node license/cli.js mint --school "Name" --machine <id>`).

## Code signing (TODO — needs accounts)

Unsigned builds trigger Gatekeeper/SmartScreen warnings. When ready:
1. **macOS:** Apple Developer Program ($99/yr) → `Developer ID Application`
   cert → add `CSC_LINK`/`CSC_KEY_PASSWORD` + notarization (`APPLE_ID`,
   `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) as repo secrets —
   electron-builder picks them up in the existing release workflow.
2. **Windows:** Azure Trusted Signing (cheapest) or an OV/EV cert →
   electron-builder `win.signtoolOptions`/`azureSignOptions`.
