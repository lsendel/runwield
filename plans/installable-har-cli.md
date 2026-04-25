# Plan: Make Harness installable as `har`

## Context

Goal: ship Harness as an installable standalone binary named `har` so end users
do **not** need Deno installed.

Confirmed requirements from user:

- Prefer straightforward Deno-supported targets.
- Unsigned binaries are acceptable for now.
- Prioritize macOS + Linux installer flow (`install.sh`), Windows later.
- CLI/help/docs should use `har` as the primary command.
- Plannotator dependency should come from npm package
  `@gandazgul/plannotator-pi-extension-compiled`.
- Agent prompts should be bundled into the binary (overrides can come later).

Codebase findings relevant to installability:

- Entrypoint is `src/cli.js`; help/usage text is currently hardcoded to
  `deno run -A src/cli.js` in multiple files.
- `deno.json` currently points to a local sibling path for plannotator package,
  which is not CI/release friendly.
- Agents are loaded from `CWD/.pi/agents` (`src/shared/session.js`), so compiled
  binary needs bundled defaults.
- Plan review currently loads HTML by resolving package filesystem path in
  `src/tools/submit-plan.js`; this is fragile for compiled distribution.
- Local sibling package repo `../plannotator-pi-extension-compiled` already
  exists with build script + npm publish workflow, but has no commits/remotes
  yet.

## Approach

Implement in two tracks:

1. **Stabilize and publish plannotator package**
   - Create/push the standalone repo with current package contents.
   - Publish it to npm so Harness can depend on it by version instead of sibling
     path.
   - Add a small API export in that package to provide `plannotator.html`
     content directly as a JS export, so Harness no longer depends on runtime
     filesystem reads for UI HTML.

2. **Ship installable `har` binaries from Harness**
   - Update Harness to use npm-based plannotator imports.
   - Bundle agent prompts into compiled binary and add runtime resolution for
     bundled prompts.
   - Add release workflow that cross-compiles `har` for:
     - `aarch64-apple-darwin`
     - `x86_64-apple-darwin`
     - `x86_64-unknown-linux-gnu`
     - `aarch64-unknown-linux-gnu`
   - Publish artifacts + checksums on GitHub Releases.
   - Provide `install.sh` (macOS/Linux) to download, verify, and install `har`.
   - Update help/docs to `har ...` first, with Deno source-run fallback
     documented for contributors.

## Files to modify

### Harness repo

- `deno.json` (switch plannotator imports to npm)
- `deno.lock` (dependency lock updates)
- `src/constants.js` (central CLI binary name/usage helper)
- `src/shared/help-text.js` (primary usage -> `har`)
- `src/cli.js` (top-level usage comment updates)
- `src/cmd/router/index.js` (resume command hints)
- `src/cmd/resume/index.js` (usage/hints)
- `src/plan-store.js` (error message mentions `harness` currently)
- `src/shared/session.js` (bundled agent prompt path strategy)
- `src/tools/submit-plan.js` (consume HTML from package export, remove runtime
  file-path dependency)
- `README.md` (install + usage docs focused on `har`)
- `install.sh` (new; macOS/Linux installer)
- `.github/workflows/release.yml` (new; compile + release artifacts)

### Sibling repo `../plannotator-pi-extension-compiled`

- `package.json` (exports update for HTML provider module if needed)
- `build.mjs` (generate/export embedded HTML module)
- `dist/*` (rebuilt outputs)
- `README.md` (publish/version notes if needed)
- `.github/workflows/npm-publish.yml` (confirm/reuse existing tag publish flow)
- Git metadata (initial commit, remote creation, push)

## Reuse

- Existing command dispatch and argument parsing: `src/cli.js`,
  `src/cmd/registry.js`.
- Existing help rendering centralization: `src/shared/help-text.js`.
- Existing planning/review lifecycle: `src/shared/workflow.js`,
  `src/tools/submit-plan.js`.
- Existing plan persistence and front matter handling: `src/plan-store.js`.
- Existing plannotator package release workflow already present in sibling repo:
  `../plannotator-pi-extension-compiled/.github/workflows/npm-publish.yml`.

## Steps

- [ ] **Package repo bootstrap/publish path**
  - [ ] In `../plannotator-pi-extension-compiled`, verify package exports
        include a JS-accessible `plannotator.html` payload.
  - [ ] Commit package repo contents.
  - [ ] Create GitHub repo via `gh` and push main.
  - [ ] Tag and publish initial npm version
        (`@gandazgul/plannotator-pi-extension-compiled`).

- [ ] **Harness dependency + runtime asset hardening**
  - [ ] Replace local sibling import map entries in `deno.json` with npm package
        specifiers.
  - [ ] Update `submit-plan` to import HTML content from package export (instead
        of `readFileSync(import.meta.resolve(...))`).
  - [ ] Add bundled-agent resolution strategy in `session.js` for compiled
        binary runtime.
  - [ ] Ensure `deno compile` includes bundled agent files
        (`--include .pi/agents`).

- [ ] **Binary release automation**
  - [ ] Add `.github/workflows/release.yml` triggered on `v*` tags.
  - [ ] Cross-compile `har` for macOS/Linux matrix targets.
  - [ ] Archive artifacts with stable names and generate `SHA256SUMS`.
  - [ ] Attach artifacts + checksums to GitHub Release.

- [ ] **Installer**
  - [ ] Add `install.sh` that:
    - detects OS/arch,
    - resolves latest (or requested) release,
    - downloads matching archive + checksum,
    - verifies checksum,
    - installs `har` into target bin dir (`/usr/local/bin` by default).

- [ ] **UX/docs updates**
  - [ ] Replace user-facing `deno run ...` references with `har ...` in help
        text and runtime hints.
  - [ ] Keep contributor section in README for source-running via Deno.
  - [ ] Document install/upgrade/uninstall and supported platforms.

## Verification

- Package repo:
  - `npm ci`
  - `npm run build`
  - `npm pack` (confirm expected files/exports)
  - Push `v*` tag and confirm npm publish workflow triggers.

- Harness source validation:
  - `deno task check`
  - `deno task cli --help` (dev fallback still works)

- Binary/release validation:
  - CI builds all 4 target binaries successfully.
  - Release artifacts include expected names + checksum file.
  - On fresh macOS/Linux environments:
    - run `install.sh`
    - run `har --help`
    - run `har plans`
    - run a request path that reaches plan review UI.

- Regression:
  - Existing planning/execution flows still function end-to-end.
  - `resume` and related instructions point to `har resume ...`.
