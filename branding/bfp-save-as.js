/* BrightForge Photo – local Save As bridge, version 2.
 * Works with the upstream browser build's blob: downloads. Does not modify
 * PhotoCraft WASM, its document identity, or its saved/dirty revision.
 * File handles may be stored in IndexedDB on this device; no server sync.
 */
(() => {
  'use strict';
  if (window.__BFP_LOCAL_SAVE_V2__) return;
  window.__BFP_LOCAL_SAVE_V2__ = true;

  const rawAnchorClick = HTMLAnchorElement.prototype.click;
  const pending = [];
  const handles = new Map();
  let presenting = false;

  // IndexedDB stores FileSystemFileHandle objects by structured clone on
  // browsers supporting the File System Access API. It is best effort:
  // private browsing/managed browsers can disable it without breaking saving.
  function database() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      let request;
      try { request = indexedDB.open('brightforge-photo-local-files', 1); }
      catch { return resolve(null); }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  async function remembered(name) {
    if (handles.has(name)) return handles.get(name);
    const db = await database();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const request = db.transaction('handles', 'readonly').objectStore('handles').get(name);
        request.onsuccess = () => {
          const value = request.result || null;
          if (value && typeof value.createWritable === 'function') handles.set(name, value);
          db.close();
          resolve(value && typeof value.createWritable === 'function' ? value : null);
        };
        request.onerror = () => { db.close(); resolve(null); };
      } catch { db.close(); resolve(null); }
    });
  }
  async function remember(name, handle) {
    handles.set(name, handle);
    const db = await database();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, name);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      } catch { resolve(); }
    });
    db.close();
  }

  // The Rust editor only clears a document's unsaved marker after this event
  // confirms that the native File System Access writer actually closed.
  // A fallback download, failed write, or cancelled picker is NOT confirmation.
  function saveReceipt(item, saved) {
    if (!item.saveId) return; // Old published engines do not supply save ids.
    window.dispatchEvent(new CustomEvent('bfp-save-result', {
      detail: {id:item.saveId, saved:!!saved}
    }));
  }

  function safeName(a) {
    const suggested = (a.getAttribute('download') || '').split(/[\\/]/).pop() || 'Untitled.pcraft';
    return suggested.replace(/[\u0000-\u001f]/g, '').slice(0, 180) || 'Untitled.pcraft';
  }
  function extensionType(filename) {
    const ext = (filename.match(/\.[a-z0-9]+$/i) || [])[0]?.toLowerCase();
    const mime = {
      '.pcraft':'application/octet-stream', '.psd':'image/vnd.adobe.photoshop',
      '.psb':'application/octet-stream', '.png':'image/png', '.jpg':'image/jpeg',
      '.jpeg':'image/jpeg', '.webp':'image/webp', '.tif':'image/tiff',
      '.tiff':'image/tiff', '.gif':'image/gif', '.bmp':'image/bmp'
    }[ext];
    return ext && mime ? [{description: `${ext.slice(1).toUpperCase()} file`, accept:{[mime]:[ext]}}] : [];
  }
  function fallbackDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.download = name;
    a.href = url;
    document.body.append(a);
    rawAnchorClick.call(a);
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function button(label, primary=false) {
    const el = document.createElement('button');
    el.type='button';
    el.textContent=label;
    el.style.cssText='border-radius:8px;border:1px solid '+(primary?'#0ab9dd':'#5a6a82')+
      ';padding:10px 13px;font:600 14px system-ui;cursor:pointer;color:'+
      (primary?'#021a2c':'#e6f2ff')+';background:'+(primary?'#24d7ec':'#203349');
    return el;
  }
  async function write(handle, blob) {
    if (typeof handle.queryPermission === 'function') {
      let p = await handle.queryPermission({mode:'readwrite'});
      if (p !== 'granted' && typeof handle.requestPermission === 'function') {
        p = await handle.requestPermission({mode:'readwrite'});
      }
      if (p !== 'granted') throw new Error('File write permission was not granted');
    }
    const writer = await handle.createWritable();
    try { await writer.write(blob); await writer.close(); }
    catch (e) { try { await writer.abort(); } catch {} throw e; }
  }
  async function promptFor(item, blob) {
    // Lookup must finish *before* presenting buttons, to ensure the native
    // picker invocation itself happens directly on the user's click.
    const previous = await remembered(item.name);
    return new Promise((resolve) => {
      const shade=document.createElement('div');
      shade.dataset.bfpSaveDialog='true';
      shade.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(3,10,22,.80);display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:16px';
      const panel=document.createElement('section');
      panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
      panel.setAttribute('aria-label','Save BrightForge Photo file');
      panel.style.cssText='box-sizing:border-box;width:min(480px,100%);background:#102238;color:#f5faff;border-radius:14px;border:1px solid #526683;padding:23px;box-shadow:0 22px 80px rgba(0,0,0,.6);font:14px/1.5 system-ui';
      const title=document.createElement('h2'); title.textContent='Save BrightForge Photo file'; title.style.cssText='font:700 21px system-ui;margin:0 0 10px';
      const desc=document.createElement('p'); desc.textContent=`File: ${item.name}`; desc.style.cssText='overflow-wrap:anywhere;color:#8fe8f8;margin:0 0 8px';
      const note=document.createElement('p'); note.textContent='Choose the folder and filename in the system dialog. The editor determines the file format; changing only its extension will not convert it.';
      note.style.cssText='color:#c8d7e8;margin:0 0 14px';
      const error=document.createElement('p'); error.setAttribute('role','alert');error.style.cssText='color:#ffbcbc;margin:0 0 10px';
      const actions=document.createElement('div'); actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px';
      const choose=button('Save As – choose folder and filename',true);
      const download=button('Download instead');
      const cancel=button('Cancel');
      const controls=[choose,download,cancel];
       const done=(saved=false) => {
        document.removeEventListener('keydown',esc);
        shade.remove();
        saveReceipt(item,saved);
        resolve();
       };
      const esc=(e)=>{if(e.key==='Escape'&&!controls.some(b=>b.disabled)){e.preventDefault();done();}};
      const working=(state)=>{for(const b of controls){b.disabled=state;b.style.opacity=state?'0.5':'1';}};
      choose.addEventListener('click',async()=>{
        error.textContent='';
        if (typeof window.showSaveFilePicker !== 'function') {
          error.textContent='This browser does not permit direct file saving. Try Chrome or Edge, or choose Download instead.';return;
        }
        working(true);
        try {
          const options={id:'bfp-project-save',suggestedName:item.name};
          const types=extensionType(item.name);
          if(types.length) options.types=types;
          // Direct click is required for a browser picker – do not await first.
          const handle=await window.showSaveFilePicker(options);
          await write(handle,blob);
          await remember(item.name,handle);
          done(true);
        } catch(e){ if(e?.name!=='AbortError') error.textContent=`Could not save: ${e?.message||String(e)}`; }
        finally {working(false);}
      });
      if(previous){
        const update=button(`Update previously selected file: ${previous.name||item.name}`);
        controls.unshift(update);
        update.addEventListener('click',async()=>{
          error.textContent='';working(true);
          try {await write(previous,blob);done(true);}
          catch(e){error.textContent=`Could not update the previous file: ${e?.message||String(e)}. Use Save As to choose a file.`;}
          finally {working(false);}
        });
        actions.append(update);
        const caution=document.createElement('p');
        caution.textContent='“Update” replaces the previously selected file. Check its name before proceeding.';
        caution.style.cssText='color:#c9d8ed;margin:0 0 14px';
        panel.append(title,desc,note,caution,error,actions);
      } else panel.append(title,desc,note,error,actions);
      download.addEventListener('click',()=>{fallbackDownload(blob,item.name);done();});
      cancel.addEventListener('click',done);
      actions.append(choose,download,cancel);
      shade.append(panel);document.body.append(shade);
      document.addEventListener('keydown',esc);
      choose.focus();
    });
  }
  async function drain() {
    if(presenting) return;
    presenting=true;
    try {
      while(pending.length){
        const item=pending.shift();
        try {await promptFor(item,await item.blob);}
        catch(e) {
          console.error('BrightForge Photo: save failed',e);
          saveReceipt(item,false);
        }
      }
    } finally {presenting=false;}
  }
  HTMLAnchorElement.prototype.click=function(...args){
    if(this.hasAttribute('download') && this.href?.startsWith('blob:')) {
      // Blob URLs are revoked by the WASM engine shortly after this call.
      const blob=fetch(this.href).then(r=>{if(!r.ok) throw new Error(`Save data unavailable (${r.status})`);return r.blob();});
       pending.push({name:safeName(this),blob,saveId:this.getAttribute('data-bfp-save-id')});
      void drain();
      return;
    }
    return rawAnchorClick.apply(this,args);
  };
})();
