# BrightForge Photo — first website deployment

## Contents

This overlay installs into your existing `Summzy/brightforge-photo` fork:

- `.github/workflows/bfp-deploy.yml` — GitHub Actions one-click build and optional Cloudflare deployment
- `scripts/prepare-bfp-site.py` — builds a complete branded static website from the official PhotoCraft WebAssembly release
- `branding/bfp-lens-6b.webp` — the **approved Concept 6B**, reused without redesign
- `branding/bfp-icon-192.png`, `branding/bfp-icon-512.png` — sizes of the same approved lens
- `branding/bfp.css` — dark navy/cyan/magenta loading page styling
- `wrangler.jsonc` — Cloudflare Worker `bfp`, asset directory `site`

This package is a **repository overlay**, not a standalone HTML app. It must be unpacked into the existing GitHub fork (repository root) and then run via GitHub Actions. Do not open index.html locally.

## On your Samsung tablet (GitHub Codespaces)

1. Open `https://github.com/Summzy/brightforge-photo` in Chrome.
2. Choose **Code → Codespaces → Create codespace on main** (if you don't already have a Codespace for this fork).
3. Download the deployment ZIP from the ChatGPT message to your tablet.
4. In Codespaces' browser-based VS Code Explorer, **upload** the ZIP into the root of `brightforge-photo`.
5. Open the Codespaces Terminal and paste:

```bash
unzip -o brightforge-photo-deploy-kit.zip -d .
rm -f brightforge-photo-deploy-kit.zip
git add .github/workflows/bfp-deploy.yml scripts/prepare-bfp-site.py branding wrangler.jsonc README-BFP-DEPLOY.md
git commit -m "Set up BrightForge Photo web deployment and 6B branding"
git push origin main
```

If Codespaces reports the file is in another folder, move into the repository root first, typically `cd /workspaces/brightforge-photo`.

## First test (no Cloudflare secrets necessary)

6. On GitHub, select **Actions → BrightForge Photo — Web deployment → Run workflow**.
7. Leave `deploy` **false** and run. The action downloads the full published PhotoCraft v0.23.1 WebAssembly browser package, combines its bootloader/wasm chunks with your approved branding, validates the files, and attaches a `brightforge-photo-website` artifact.

## Enable Cloudflare deployment

8. In Cloudflare, create an API token limited to the necessary **Workers edit/deploy** permissions and select the correct Cloudflare account. Never paste tokens into chat or commit them to the repository.
9. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**. Add:
   - `CLOUDFLARE_API_TOKEN` (the token)
   - `CLOUDFLARE_ACCOUNT_ID` (your account ID)
10. Rerun the workflow with `deploy` **true**. It targets Worker name `bfp`. If your Cloudflare account's workers.dev subdomain is `brightforgestudio`, its URL will be `https://bfp.brightforgestudio.workers.dev/`.
11. Test in Chrome on Samsung tablet, Chromebook and Windows desktop.

## What works and what isn't implemented yet

This initial deployment uses the **real PhotoCraft browser editor**, not a static preview. The app canvas, tools and document formats come from PhotoCraft's published v0.23.1 web build. The loading/splash branding, tab title and PWA manifest are BrightForge Photo, but the in-app UI still identifies itself as PhotoCraft. This must be changed through source changes and a future compiled fork build.

Critically, the browser's Open and Save in the upstream engine still use browser pickers and downloads. Same-file Save, Save As, persistent file handles, tablet support for direct overwrite, and document crash recovery **have not yet been implemented** in this package. We should treat those as Phase 2. Always save downloaded project files until Phase 2 is tested.

The PWA manifest is included, but offline editing / full installability is not guaranteed yet; service worker and platform tests remain future work.

This deployment is **not automatic**: running the GitHub Action with `deploy=true` and valid Cloudflare secrets is required.

## Source licensing

PhotoCraft is MIT OR Apache-2.0. Keep the fork's existing `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`, `ATTRIBUTION.md` and related original notices. The published web package's existing attributions must remain alongside redistributed code. Your independent branding is separate from the upstream project identity.
