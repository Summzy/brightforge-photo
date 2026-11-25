/* BrightForge Photo: device Save As dialog for PhotoCraft v0.23.1 browser build.
 * No server upload. The original editor issues a Blob URL download on export.
 * This intercepts only programmatic <a download="..." href="blob:..."> clicks.
 * A user click in our UI is necessary before showSaveFilePicker() can run.
 * Browser download remains the fallback if direct file access is unavailable.
 * This is NOT a replacement for the editor's full native document-save engine.
 */
(() => {
  'use strict';
  const nativeClick = HTMLAnchorElement.prototype.click;
  const queue = [];
  const previouslySaved = new Map();
  let busy = false;

  const filenameFrom = (anchor) => {
    const name = (anchor.getAttribute('download') || '').split(/[\\/]/).pop() || 'Untitled.pcraft';
    return name.replace(/[\u0000-\u001f]/g, '').slice(0, 200) || 'Untitled.pcraft';
  };

  function fallbackDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    // Call the native method, not our interception hook.
    nativeClick.call(a);
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function makeButton(label, primary = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = `cursor:pointer;border:1px solid ${primary ? '#10cee8' : '#4c6178'};border-radius:8px;padding:10px 14px;font:600 14px system-ui;min-height:42px;color:${primary ? '#021b29' : '#e9f2fe'};background:${primary ? '#25d6ed' : '#23344b'};`;
    return b;
  }

  function present(item, blob) {
    return new Promise((resolve) => {
      const shade = document.createElement('div');
      shade.setAttribute('role', 'presentation');
      shade.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(3,10,22,.78);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box';
      const panel = document.createElement('section');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Save BrightForge Photo file');
      panel.style.cssText = 'box-sizing:border-box;width:min(440px,100%);background:#102138;color:#f5faff;border:1px solid #415b75;border-radius:14px;padding:22px;box-shadow:0 22px 80px rgba(0,0,0,.55);font:14px/1.5 system-ui, sans-serif';
      const title = document.createElement('h2');
      title.textContent = 'Save file';
      title.style.cssText = 'font:700 21px system-ui;margin:0 0 8px';
      const explain = document.createElement('p');
      explain.textContent = 'Choose where to save your file, and type the filename in the system Save As window.';
      explain.style.cssText = 'color:#c6d6e8;margin:0 0 12px';
      const name = document.createElement('p');
      name.textContent = `Suggested name: ${item.name}`;
      name.style.cssText = 'overflow-wrap:anywhere;color:#7feafb;margin:0 0 16px';
      const error = document.createElement('p');
      error.setAttribute('role', 'alert');
      error.style.cssText = 'color:#ffc0c0;min-height:0;margin:0 0 8px';
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:9px';
      const saveAs = makeButton('Choose folder and filename', true);
      const download = makeButton('Download instead');
      const cancel = makeButton('Cancel');
      const close = () => { shade.remove(); resolve(); };
      const setWorking = (active) => {
        saveAs.disabled = download.disabled = cancel.disabled = active;
        saveAs.style.opacity = download.style.opacity = cancel.style.opacity = active ? '.6' : '1';
      };
      saveAs.addEventListener('click', async () => {
        error.textContent = '';
        if (typeof window.showSaveFilePicker !== 'function') {
          error.textContent = 'This browser does not support choosing local files directly. Use Download instead.';
          return;
        }
        setWorking(true);
        try {
          // Must be called synchronously from the real user click (before awaiting anything).
          const handle = await window.showSaveFilePicker({suggestedName: item.name, id: 'brightforge-photo-save'});
          const writer = await handle.createWritable();
          try {
            await writer.write(blob);
            await writer.close();
          } catch (e) {
            await writer.abort().catch(() => {});
            throw e;
          }
          previouslySaved.set(item.name, handle);
          close();
        } catch (e) {
          if (e?.name !== 'AbortError') error.textContent = `Could not save file: ${e?.message || String(e)}`;
        } finally { setWorking(false); }
      });
      const handle = previouslySaved.get(item.name);
      if (handle) {
        const overwrite = makeButton('Save to previous file');
        overwrite.addEventListener('click', async () => {
          error.textContent = '';
          setWorking(true);
          overwrite.disabled = true;
          try {
            const writer = await handle.createWritable();
            try {
              await writer.write(blob);
              await writer.close();
            } catch (e) {
              await writer.abort().catch(() => {});
              throw e;
            }
            close();
          } catch (e) {
            error.textContent = `Cannot update previous file: ${e?.message || String(e)}. Choose folder and filename instead.`;
          } finally { setWorking(false); overwrite.disabled = false; }
        });
        actions.append(overwrite);
      }
      download.addEventListener('click', () => { fallbackDownload(blob, item.name); close(); });
      cancel.addEventListener('click', close);
      actions.append(saveAs, download, cancel);
      panel.append(title, explain, name, error, actions);
      shade.append(panel);
      document.body.append(shade);
      saveAs.focus();
    });
  }

  async function processQueue() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const item = queue.shift();
      try {
        const blob = await item.blob;
        await present(item, blob);
      } catch (e) {
        console.error('BrightForge Photo: could not prepare save data', e);
      }
    }
    busy = false;
  }

  HTMLAnchorElement.prototype.click = function (...args) {
    if (this.hasAttribute('download') && this.href?.startsWith('blob:')) {
      // Fetch now, before PhotoCraft revokes the Blob URL after its scheduled timeout.
      const blob = fetch(this.href).then((response) => {
        if (!response.ok) throw new Error(`File data unavailable (${response.status})`);
        return response.blob();
      });
      queue.push({name: filenameFrom(this), blob});
      void processQueue();
      return;
    }
    return nativeClick.apply(this, args);
  };
})();
