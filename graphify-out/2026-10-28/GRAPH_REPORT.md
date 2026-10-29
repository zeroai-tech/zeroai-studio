# Graph Report - /Users/lottie/Code/zeroai-studio  (2026-08-06)

## Corpus Check
- Corpus is ~14,179 words - fits in a single context window. You may not need a graph.

## Summary
- 258 nodes · 322 edges · 24 communities (16 shown, 8 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Electron Main Process
- Arduino CLI Integration
- Build Configuration
- Package Dependencies
- License Core Engine
- Arduino Board Packs Builder
- Activation & License Minting UI
- Build File References
- App Publishing CI/CD
- Studio Launcher UI
- Legacy Pack Script
- License CLI Tool
- App Bundle Downloader
- Legacy App Bundler
- Board Packs CI/CD
- Preload Bridge
- Release Workflow
- Config Fetcher
- App Manifest Catalog
- Shell Update Check
- Studio View Manager
- Studio Launcher Entry
- License Minter Entry
- Code Signing Plan

## God Nodes (most connected - your core abstractions)
1. `build` - 12 edges
2. `files` - 12 edges
3. `setup()` - 11 edges
4. `cli()` - 9 edges
5. `scripts` - 9 edges
6. `installFromPack()` - 8 edges
7. `ROOT()` - 7 edges
8. `installApp()` - 7 edges
9. `BIN()` - 6 edges
10. `DATA_DIR()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `manifest.json Catalog Distribution` --conceptually_related_to--> `refresh(silent) App Catalog Syncer`  [INFERRED]
  README.md → apps/studio/index.html
- `manifest.json Catalog Distribution` --shares_data_with--> `manifest.json bump inline script`  [INFERRED]
  README.md → .github/workflows/publish-apps.yml
- `activate() Activation Handler` --shares_data_with--> `mint(school, machine, days) License Signer`  [INFERRED]
  activate.html → license/minter.html
- `window.zeroaiLicense Preload Bridge` --conceptually_related_to--> `Ed25519 Signed Offline Licensing Architecture`  [INFERRED]
  activate.html → license/README.md
- `mint(school, machine, days) License Signer` --semantically_similar_to--> `cli.js keygen & mint Tooling`  [INFERRED] [semantically similar]
  license/minter.html → license/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Ed25519 Offline Licensing Ecosystem** — license_readme_ed25519_licensing, license_minter_mint_function, activate_activate_function, activate_zeroai_license_bridge [INFERRED 0.95]
- **ZeroAI Studio GitHub Actions CI/CD Workflows** — _github_workflows_board_packs_build_arduino_board_packs, _github_workflows_publish_apps_publish_app_bundles, _github_workflows_release_build_installers [EXTRACTED 1.00]
- **App Catalog Build, Publish, and Sync Flow** — _github_workflows_publish_apps_job_publish, readme_manifest_json_catalog, apps_studio_index_refresh_catalog, apps_studio_index_install_app [INFERRED 0.95]

## Communities (24 total, 8 thin omitted)

### Community 0 - "Electron Main Process"
Cohesion: 0.08
Nodes (31): AdmZip, { app, BrowserWindow, Menu, protocol, shell, ipcMain, dialog, screen }, APPS_DIR, arduino, buildMenu(), createWindow(), crypto, download() (+23 more)

### Community 1 - "Arduino CLI Integration"
Cohesion: 0.16
Nodes (28): AdmZip, { app }, assetName(), BIN(), BOARD_URLS, cli(), cliJSON(), compile() (+20 more)

### Community 2 - "Build Configuration"
Cohesion: 0.08
Nodes (26): build, appId, copyright, directories, extraResources, linux, mac, nsis (+18 more)

### Community 3 - "Package Dependencies"
Cohesion: 0.08
Nodes (24): adm-zip, electron, electron-builder, electron-updater, author, dependencies, adm-zip, electron-updater (+16 more)

### Community 4 - "License Core Engine"
Cohesion: 0.16
Nodes (16): b64u(), crypto, { execSync }, fs, machineId(), mint(), os, stableHwId() (+8 more)

### Community 5 - "Arduino Board Packs Builder"
Cohesion: 0.18
Nodes (15): BOARD_URLS, BOARDS, buildBoard(), cliAsset(), download(), downloadRetry(), ensureCli(), fs (+7 more)

### Community 6 - "Activation & License Minting UI"
Cohesion: 0.19
Nodes (13): activate() Activation Handler, Activate ZeroAI Studio Legacy Page, Machine ID Display & Clipboard Copier, window.zeroaiLicense Preload Bridge, b64url(bytes) Encoding Utility, gen.onclick Batch License Generator, importPem(pem) WebCrypto PKCS8 Importer, loadPem(pem) Key Validator (+5 more)

### Community 7 - "Build File References"
Cohesion: 0.17
Nodes (11): files, activate.html, apps/**/*, arduino.js, license/core.js, !license/private.pem, license/public.pem, license/verifier.js (+3 more)

### Community 8 - "App Publishing CI/CD"
Cohesion: 0.20
Nodes (10): ZeroAI App Repositories (zerospark, zaiblock, zaisim, zaipy, zaicad), apps-v<version> GitHub Release, publish job, manifest.json bump inline script, Publish App Bundles Workflow, Privileged app:// Scheme Architecture, manifest.json Catalog Distribution, Offline Classroom & Lab Provisioning (+2 more)

### Community 9 - "Studio Launcher UI"
Cohesion: 0.40
Nodes (10): BRAND Gradient & Glow Mapping, install(a, rowEl) App Download & Installer, launch(a) App Execution Launcher, openMenu(rowEl, a) Overflow Action Menu, refresh(silent) App Catalog Syncer, renderHero(apps) Dashboard Hero Manager, row(a) App Row Renderer, toast(text, kind) Toast System (+2 more)

### Community 10 - "Legacy Pack Script"
Cohesion: 0.20
Nodes (8): brand, CFG, { execSync }, fs, path, REL, renames, root

### Community 11 - "License CLI Tool"
Cohesion: 0.22
Nodes (6): [cmd, ...args], fs, L, path, PRIV, PUB

### Community 12 - "App Bundle Downloader"
Cohesion: 0.25
Nodes (6): crypto, fs, https, manifest, OUT, path

### Community 13 - "Legacy App Bundler"
Cohesion: 0.25
Nodes (7): APPS, CODE, { execSync }, fs, OUT, path, versions

### Community 14 - "Board Packs CI/CD"
Cohesion: 0.50
Nodes (5): board-packs GitHub Release, Build Arduino Board Packs Workflow, build matrix job (macOS/Win/Linux), create-release job, scripts/build-arduino-packs.cjs

### Community 16 - "Release Workflow"
Cohesion: 0.50
Nodes (4): Build Installers Workflow, node scripts/fetch-config.cjs, build job (macOS/Windows/Ubuntu), zeroai-tech/zeroai-studio-releases Repository

## Knowledge Gaps
- **136 isolated node(s):** `{ app }`, `fs`, `fsp`, `path`, `os` (+131 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `build` connect `Build Configuration` to `Package Dependencies`, `Build File References`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `files` connect `Build File References` to `Build Configuration`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `{ app }`, `fs`, `fsp` to the rest of the system?**
  _136 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Electron Main Process` be split into smaller, more focused modules?**
  _Cohesion score 0.08108108108108109 - nodes in this community are weakly interconnected._
- **Should `Build Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._