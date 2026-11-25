# BrightForge Photo – Local Save As v2

This update replaces the existing `branding/bfp-save-as.js` **only**. It deliberately leaves the working Rust/WebAssembly engine, startup code, and original approved 6B logo untouched.

## Changes

- Uses your browser's native Save As picker to choose a folder and filename (where supported by Chrome or Edge).
- Writes the editor's exported bytes directly to the chosen local file.
- Offers **Update previously selected file** on later saves using the same suggested filename. This action requires an explicit click; it never silently overwrites a file.
- Stores the selected file handle in device-local IndexedDB where supported, allowing you to reconnect to a previously selected file after reloading the page. Browser permissions can require renewed approval, and site-data clearing removes remembered connections.
- Keeps **Download instead** for browsers and managed computers without direct file access.
- Preserves the existing sequential save queue so multiple saves do not overlap.

## Important limitations

1. The original PhotoCraft WebAssembly app still considers browser writes **unconfirmed**. Even when the native Save As succeeds, the app may continue to show an unsaved indicator. This update does **not** tell the Rust engine that the save was confirmed.
2. The remembered file association uses the suggested filename. **Different files can share the same name.** The interface therefore requires you to deliberately select **Update previously selected file**; verify the displayed file name before clicking. Never use it for a different same-named document.
3. Reopening a file through the original File → Open picker does **not** automatically connect the project to its file handle. Saving back to the same file still requires choosing/reconnecting it. Full Open → Edit → Ctrl+S → Reopen semantics require modifying/rebuilding the Rust browser service.
4. Changing the filename extension in the system dialog does not convert an image to a different format. The format is determined by PhotoCraft's File menu.
5. This is a browser-local file workflow, not cloud storage or sync.

## Install

Upload `brightforge-photo-save-v2.zip` to the root of the GitHub Codespace, then run:

```bash
cd /workspaces/brightforge-photo
unzip -o brightforge-photo-save-v2.zip -d .
node --check branding/bfp-save-as.js
git add branding/bfp-save-as.js README-SAVE-V2.md
git commit -m "Improve local Save As and remembered file handles"
git push origin main
```

Run the **BrightForge Photo — Web deployment** workflow, branch `main`, with `Deploy to Cloudflare` on.

## Verify in Chrome / Edge

1. Create a disposable, small document with a layer.
2. File → Save As → **Save As – choose folder and filename**. Pick a test folder and `.pcraft` filename.
3. Make a change and save again; select **Update previously selected file: <name>**.
4. Confirm the local file's modified time changes and no extra numbered download is created.
5. Reload, reopen the `.pcraft` file and make another change. Try saving; the prior file-handle option may be available depending on browser permissions. Choose it only if you are certain it is the right project file.

Do not test by overwriting an important existing project.
