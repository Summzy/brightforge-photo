# BrightForge Photo — In-App Branding Update

This update applies the **BrightForge Photo** brand inside the running editor UI, not just on the loading screen.

## What it changes

- Replaces visible **PhotoCraft** labels with **BrightForge Photo** where possible.
- Replaces **About PhotoCraft** with **About BrightForge Photo**.
- Replaces **PhotoCraft Website** and **PhotoCraft on GitHub** menu items with BrightForge Photo equivalents.
- Replaces the **ArtCraft Discord** item with a **BrightForge Photo Support** link.
- Keeps the existing editor engine intact.
- Does **not** yet rebuild the Rust engine or rewrite every embedded upstream string.

## Install in Codespaces or the repo root

From the `brightforge-photo` repository root:

```bash
unzip -o brightforge-photo-branding-update.zip -d .
python3 install-bfp-branding.py

git add scripts/prepare-bfp-site.py branding/bfp-app-branding.js branding/bfp-app-branding.css install-bfp-branding.py README-BRANDING.md
git commit -m "Apply BrightForge Photo in-app branding"
git push origin main
```

Then rerun the GitHub Actions workflow:

- **BrightForge Photo — Web deployment**
- Branch: `main`
- **Deploy to Cloudflare**: ON

## Notes

This is a runtime branding overlay designed for the current browser-based build.
A deeper Rust-side rebuild would be needed to fully replace every embedded upstream string and icon in all dialogs.
