# Graph Report - zeroai-studio  (2026-10-28)

## Corpus Check
- 17 files · ~16,651 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 273 nodes · 341 edges · 22 communities (18 shown, 4 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a5e23253`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.js
- arduino.js
- build
- scripts
- verifier.js
- build-arduino-packs.cjs
- mint(school, machine, days) License Signer
- files
- ZeroAI Studio Desktop Architecture
- bundle-hub.cjs
- pack-legacy.cjs
- cli.js
- publish-ascolta.cjs
- verify-package.cjs
- build matrix job (macOS/Win/Linux)
- preload.js
- build job (macOS/Windows/Ubuntu)
- fetch-config.cjs
- manifest.json
- alias-artifacts.cjs
- License Minter Web Application
- Code Signing Plan (macOS & Windows)

## God Nodes (most connected - your core abstractions)
1. `scripts` - 13 edges
2. `build` - 12 edges
3. `setup()` - 11 edges
4. `files` - 11 edges
5. `cli()` - 9 edges
6. `installFromPack()` - 8 edges
7. `ROOT()` - 7 edges
8. `installApp()` - 7 edges
9. `BIN()` - 6 edges
10. `DATA_DIR()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `activate() Activation Handler` --shares_data_with--> `mint(school, machine, days) License Signer`  [INFERRED]
  activate.html → license/minter.html
- `window.zeroaiLicense Preload Bridge` --conceptually_related_to--> `Ed25519 Signed Offline Licensing Architecture`  [INFERRED]
  activate.html → license/README.md
- `mint(school, machine, days) License Signer` --semantically_similar_to--> `cli.js keygen & mint Tooling`  [INFERRED] [semantically similar]
  license/minter.html → license/README.md
- `mint(school, machine, days) License Signer` --implements--> `Ed25519 Signed Offline Licensing Architecture`  [INFERRED]
  license/minter.html → license/README.md
- `loadPem(pem) Key Validator` --references--> `Private Key (private.pem) Security Rationale`  [INFERRED]
  license/minter.html → license/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Ed25519 Offline Licensing Ecosystem** — license_readme_ed25519_licensing, license_minter_mint_function, activate_activate_function, activate_zeroai_license_bridge [INFERRED 0.95]

## Communities (22 total, 4 thin omitted)

### Community 0 - "main.js"
Cohesion: 0.08
Nodes (32): AdmZip, { app, BrowserWindow, Menu, protocol, shell, ipcMain, dialog, screen }, arduino, buildMenu(), createWindow(), crypto, download(), FILE_EXT (+24 more)

### Community 1 - "arduino.js"
Cohesion: 0.16
Nodes (28): AdmZip, { app }, assetName(), BIN(), BOARD_URLS, cli(), cliJSON(), compile() (+20 more)

### Community 2 - "build"
Cohesion: 0.08
Nodes (26): build, appId, copyright, directories, extraResources, linux, mac, nsis (+18 more)

### Community 3 - "scripts"
Cohesion: 0.07
Nodes (28): adm-zip, electron, electron-builder, electron-updater, author, dependencies, adm-zip, electron-updater (+20 more)

### Community 4 - "verifier.js"
Cohesion: 0.15
Nodes (20): b64u(), crypto, { execSync }, fs, machineId(), mint(), os, stableHwId() (+12 more)

### Community 5 - "build-arduino-packs.cjs"
Cohesion: 0.18
Nodes (15): BOARD_URLS, BOARDS, buildBoard(), cliAsset(), download(), downloadRetry(), ensureCli(), fs (+7 more)

### Community 6 - "mint(school, machine, days) License Signer"
Cohesion: 0.19
Nodes (13): activate() Activation Handler, Activate ZeroAI Studio Legacy Page, Machine ID Display & Clipboard Copier, window.zeroaiLicense Preload Bridge, b64url(bytes) Encoding Utility, gen.onclick Batch License Generator, importPem(pem) WebCrypto PKCS8 Importer, loadPem(pem) Key Validator (+5 more)

### Community 7 - "files"
Cohesion: 0.18
Nodes (10): files, activate.html, arduino.js, license/core.js, !license/private.pem, license/public.pem, license/verifier.js, main.js (+2 more)

### Community 8 - "ZeroAI Studio Desktop Architecture"
Cohesion: 0.40
Nodes (5): Privileged app:// Scheme Architecture, manifest.json Catalog Distribution, Offline Classroom & Lab Provisioning, window.__ZEROAI_DESKTOP__ Preload Bridge, ZeroAI Studio Desktop Architecture

### Community 9 - "bundle-hub.cjs"
Cohesion: 0.18
Nodes (9): dist, { execSync }, fs, HUB, LEGACY, MARKETING_ONLY, OUT, path (+1 more)

### Community 10 - "pack-legacy.cjs"
Cohesion: 0.14
Nodes (12): brand, CFG, editionFile, { execSync }, fs, hadConfig, LOCK, path (+4 more)

### Community 11 - "cli.js"
Cohesion: 0.22
Nodes (6): [cmd, ...args], fs, L, path, PRIV, PUB

### Community 12 - "publish-ascolta.cjs"
Cohesion: 0.25
Nodes (8): api(), dir, { execFileSync }, fs, gh(), os, path, run

### Community 13 - "verify-package.cjs"
Cohesion: 0.29
Nodes (6): fail, fs, ok, path, root, roots

### Community 14 - "build matrix job (macOS/Win/Linux)"
Cohesion: 0.50
Nodes (5): board-packs GitHub Release, Build Arduino Board Packs Workflow, build matrix job (macOS/Win/Linux), create-release job, scripts/build-arduino-packs.cjs

### Community 15 - "preload.js"
Cohesion: 0.38
Nodes (5): app(), appId(), cfg, { contextBridge, ipcRenderer }, SUITE

### Community 16 - "build job (macOS/Windows/Ubuntu)"
Cohesion: 0.50
Nodes (4): Build Installers Workflow, node scripts/fetch-config.cjs, build job (macOS/Windows/Ubuntu), zeroai-tech/zeroai-studio-releases Repository

### Community 19 - "alias-artifacts.cjs"
Cohesion: 0.33
Nodes (5): esc, fs, path, REL, RULES

## Knowledge Gaps
- **150 isolated node(s):** `{ app }`, `fs`, `fsp`, `path`, `os` (+145 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `build` connect `build` to `scripts`, `files`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `files` connect `files` to `build`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `{ app }`, `fs`, `fsp` to the rest of the system?**
  _150 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07564102564102564 - nodes in this community are weakly interconnected._
- **Should `build` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `pack-legacy.cjs` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._