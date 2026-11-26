# BrightForge Photo — Save completion confirmation (source build preview)

**Do not overwrite the current production worker `bfp` with this preview.** This is an unverified Rust/WebAssembly source change. It updates the current PhotoCraft 0.23.1 source so the asterisk can disappear only after a native file write has been confirmed, not after a download request.

## Changes

- Adds an opaque save operation ID to browser-generated Blob download anchors.
- The existing native Save As JavaScript dialog reports a success receipt only when `FileSystemWritableFileStream.close()` completes; Download instead / Cancel / Escape / failed blob requests report no confirmed save.
- The Rust browser shell correlates the receipt to the correct document ID and exact revision.
- The editor updates that document's saved revision only when successful; later unsaved edits stay dirty.
- Normal live site packaging and native 6B splash logo remain unchanged.
- Adds an **independent, opt-in** GitHub Action that compiles a custom WebAssembly build and can deploy to `bfp-preview.brightforgestudio.workers.dev` only. It never targets `bfp`.

## Install

Unzip the archive into the root `/workspaces/brightforge-photo`, using `unzip -o brightforge-photo-save-confirm-beta.zip -d .`.

```sh
cd /workspaces/brightforge-photo
python3 install-bfp-save-confirm.py
node --check branding/bfp-save-as.js
python3 -m py_compile scripts/prepare-bfp-site.py install-bfp-save-confirm.py
# Review before committing:
git diff --stat
git diff --check

git add apps/photocraft-web/src/web.rs apps/photocraft-web/Cargo.toml \
  crates/ui-egui/src/services.rs crates/ui-egui/src/app/files.rs \
  branding/bfp-save-as.js install-bfp-save-confirm.py \
  .github/workflows/bfp-source-preview.yml README-SAVE-CONFIRM-BETA.md
git commit -m 'Stage browser file-save confirmation bridge for preview'
git push origin main
```

## Build *preview* (not production)

Open `https://github.com/Summzy/brightforge-photo/actions/workflows/bfp-source-preview.yml`. First run **without preview deployment** to check Rust/WebAssembly compilation. If it passes, run again with **Deploy preview = ON**. This builds and deploys `bfp-preview` only, not `bfp`.

Test with a disposable layered `.pcraft` document. Check:

1. New document has `*`.
2. Save As to a chosen folder and filename. **After** successful picker write, `*` disappears.
3. Edit the document again; `*` returns.
4. Save to the same previously selected file; `*` disappears.
5. Cancel Save As; `*` remains.
6. Download instead; `*` remains (browser cannot confirm download completion).
7. Edit again before a slow save finishes; the later changes remain dirty even if that earlier save completes.
8. Open the saved project again and check that layers and content persist.

If the preview build fails, **do not deploy**. Use its GitHub Actions build log to diagnose compilation. Only move this to production after the preview passes these tests.

## Scope / limitations

This is a focused prototype for the unsaved asterisk, not full persistent document identity. On reloading the tab, the current JavaScript remembers permitted handles by filename via IndexedDB; the editor does not yet automatically attach an opened file handle to the correct document, and Ctrl+S may still show a confirmation dialog. Same-named files in different folders require additional document-aware handle mapping.

The source implementation has not been compiled here because a full Rust toolchain and dependency cache are not available in this environment. The existing live application is unchanged.
