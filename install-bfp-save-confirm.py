#!/usr/bin/env python3
"""Install the experimental, success-only BFP browser-save receipt bridge.

Run at the BrightForge Photo repository root. Fails closed if upstream anchors
have changed. Does NOT deploy or modify the published engine by itself.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent


def patch(path: str, edits: list[tuple[str, str]], already_marker: str) -> tuple[Path, str, bool]:
    target = ROOT / path
    source = target.read_text(encoding="utf-8")
    if already_marker in source:
        print(f"Already installed: {path}")
        return target, source, False
    updated = source
    for old, new in edits:
        count = updated.count(old)
        if count != 1:
            raise SystemExit(f"Refusing to patch {path}: expected one matching source anchor, found {count}: {old[:100]!r}")
        updated = updated.replace(old, new, 1)
    return target, updated, True


services_path = "crates/ui-egui/src/services.rs"
services = patch(services_path, [
    (
        "use super::{Document, OsEvent, Value,",
        "use super::{DocId, Document, OsEvent, Value,",
    ),
    (
        "pub type WriteFn = Box<dyn FnMut(&str, &[u8]) -> Result<(), String>>;",
        """pub type WriteFn = Box<dyn FnMut(&str, &[u8]) -> Result<(), String>>;

/// Called immediately after a browser has staged its file bytes for a real
/// user-mediated save. The asynchronous browser receipt is handled by the web
/// shell; this hook records the document and exact revision being written.
pub type BrowserWritePendingFn = Box<dyn FnMut(DocId, u64, &str, bool)>;""",
    ),
    (
        "    pub write_unconfirmed: bool,",
        """    pub write_unconfirmed: bool,
    /// Optional web-only correlation hook. The browser must report success
    /// separately; merely staging a download must never clear dirty state.
    pub browser_write_pending: Option<BrowserWritePendingFn>,""",
    ),
], "pub browser_write_pending: Option<BrowserWritePendingFn>")

app_files_path = "crates/ui-egui/src/app/files.rs"
app_files = patch(app_files_path, [
    (
        """        write(&path, &bytes)?;
        let revision = saved_revision_after_write(!self.services.write_unconfirmed, written, previous);""",
        """        write(&path, &bytes)?;
        if self.services.write_unconfirmed
            && let Some(on_pending) = self.services.browser_write_pending.as_mut()
        {
            on_pending(doc, written, &path, copy);
        }
        let revision = saved_revision_after_write(!self.services.write_unconfirmed, written, previous);""",
    ),
    (
        """    /// [`Self::saved`] for automation saves: no user-configured hooks (docs/control-protocol.md).""",
        """    /// Mark only the exact revision successfully written by the browser.
    /// Called by the web shell *after* FileSystemWritableFileStream.close()
    /// resolves; a cancelled picker or unconfirmed download never calls it.
    /// If edits occurred after the write started, those edits stay dirty.
    pub fn confirm_browser_write(&mut self, doc: DocId, written: u64, path: &str) -> bool {
        let Some(current) = self.session.documents().iter().find(|st| st.doc.id == doc) else {
            return false;
        };
        if current.path.as_deref() != Some(path) || current.revision < written {
            return false;
        }
        // A delayed completion from an older save must not roll back a newer one.
        if current.saved_revision != u64::MAX && current.saved_revision > written {
            return false;
        }
        let mut confirmed = false;
        let _ = self.with_document(doc, |app| {
            let st = app.session.active_mut().ok_or("Document was closed")?;
            if st.path.as_deref() == Some(path) && st.revision >= written {
                st.saved_revision = written;
                confirmed = true;
            }
            Ok(())
        });
        if confirmed {
            self.ui.status = format!("Saved {path}");
            self.ui.status_error = false;
            self.sync_views();
        }
        confirmed
    }

    /// [`Self::saved`] for automation saves: no user-configured hooks (docs/control-protocol.md).""",
    ),
], "pub fn confirm_browser_write(")

web_path = "apps/photocraft-web/src/web.rs"
web = patch(web_path, [
    (
        "use std::cell::Cell;",
        "use std::cell::{Cell, RefCell};",
    ),
    (
        "use photocraft_doc::Document;",
        "use photocraft_doc::{DocId, Document};",
    ),
    (
        """type Served = Arc<Mutex<ServedFonts>>;

pub fn start() {""",
        """type Served = Arc<Mutex<ServedFonts>>;

// Save events are correlated by an opaque id, not by filename. Two open tabs
// can have identical filenames; the same document can change after saving.
struct BrowserSave {
    id: String,
    path: String,
    doc: Option<DocId>,
    revision: u64,
    copy: bool,
}
type BrowserSaves = Rc<RefCell<Vec<BrowserSave>>>;
type BrowserSaveResults = Rc<RefCell<Vec<(String, bool)>>>;

fn listen_bfp_save_results(results: BrowserSaveResults, ctx: egui::Context) {
    use wasm_bindgen::closure::Closure;
    let Some(window) = web_sys::window() else { return };
    let callback = Closure::<dyn FnMut(web_sys::CustomEvent)>::new(move |event: web_sys::CustomEvent| {
        let detail = event.detail();
        let id = js_sys::Reflect::get(&detail, &wasm_bindgen::JsValue::from_str("id"))
            .ok().and_then(|value| value.as_string());
        let saved = js_sys::Reflect::get(&detail, &wasm_bindgen::JsValue::from_str("saved"))
            .ok().and_then(|value| value.as_bool()).unwrap_or(false);
        if let Some(id) = id {
            results.borrow_mut().push((id, saved));
            ctx.request_repaint();
        }
    });
    if window.add_event_listener_with_callback("bfp-save-result", callback.as_ref().unchecked_ref()).is_ok() {
        callback.forget();
    }
}

pub fn start() {""",
    ),
    (
        """                    let mut services = services(inbox.clone(), place_inbox.clone(), drag_pos_service(pen_target.clone(), drag));""",
        """                    let browser_saves: BrowserSaves = Rc::default();
                    let browser_save_results: BrowserSaveResults = Rc::default();
                    listen_bfp_save_results(browser_save_results.clone(), cc.egui_ctx.clone());
                    let mut services = services(
                        inbox.clone(), place_inbox.clone(), drag_pos_service(pen_target.clone(), drag), browser_saves.clone(),
                    );""",
    ),
    (
        """                        place_inbox,
                        unsaved,
                        served,""",
        """                        place_inbox,
                        browser_saves,
                        browser_save_results,
                        unsaved,
                        served,""",
    ),
    (
        """    place_inbox: PlaceInbox,
    /// Read by the `beforeunload` listener ([`guard_unload`]).""",
        """    place_inbox: PlaceInbox,
    browser_saves: BrowserSaves,
    browser_save_results: BrowserSaveResults,
    /// Read by the `beforeunload` listener ([`guard_unload`]).""",
    ),
    (
        """impl WebShell {
    fn save_presets(&mut self, ctx: &egui::Context) {""",
        """impl WebShell {
    fn apply_browser_save_results(&mut self) {
        let results = std::mem::take(&mut *self.browser_save_results.borrow_mut());
        for (id, success) in results {
            let save = {
                let mut saves = self.browser_saves.borrow_mut();
                saves.iter().position(|s| s.id == id).map(|index| saves.remove(index))
            };
            if let Some(save) = save
                && success
                && !save.copy
                && let Some(doc) = save.doc
            {
                self.app.confirm_browser_write(doc, save.revision, &save.path);
            }
        }
    }

    fn save_presets(&mut self, ctx: &egui::Context) {""",
    ),
    (
        """    fn logic(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame) {
        let dropped""",
        """    fn logic(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame) {
        self.apply_browser_save_results();
        let dropped""",
    ),
    (
        """fn services(inbox: Inbox, place_inbox: PlaceInbox, cursor_pos: photocraft_ui_egui::CursorPosFn) -> Services {
    Services {""",
        """fn services(
    inbox: Inbox, place_inbox: PlaceInbox, cursor_pos: photocraft_ui_egui::CursorPosFn, browser_saves: BrowserSaves,
) -> Services {
    let writer_saves = browser_saves.clone();
    let pending_saves = browser_saves;
    let next_id = Rc::new(Cell::new(0u64));
    Services {""",
    ),
    (
        """        write: Some(Box::new(|path: &str, bytes: &[u8]| download(path, bytes))),
        // A download may be cancelled and never reports back: it doesn't save the document.
        write_unconfirmed: true,""",
        """        write: Some(Box::new(move |path: &str, bytes: &[u8]| {
            let id = next_id.get().wrapping_add(1);
            next_id.set(id);
            let id = id.to_string();
            writer_saves.borrow_mut().push(BrowserSave {
                id: id.clone(), path: path.to_string(), doc: None, revision: 0, copy: false,
            });
            if let Err(error) = download(path, bytes, &id) {
                writer_saves.borrow_mut().retain(|s| s.id != id);
                return Err(error);
            }
            Ok(())
        })),
        // A download may be cancelled and never reports back: it doesn't save the document.
        write_unconfirmed: true,
        browser_write_pending: Some(Box::new(move |doc, revision, path, copy| {
            if let Some(save) = pending_saves.borrow_mut().iter_mut().rev().find(|s| s.doc.is_none() && s.path == path) {
                save.doc = Some(doc);
                save.revision = revision;
                save.copy = copy;
            }
        })),""",
    ),
    (
        """fn download(path: &str, bytes: &[u8]) -> Result<(), String> {""",
        """fn download(path: &str, bytes: &[u8], save_id: &str) -> Result<(), String> {""",
    ),
    (
        """    a.set_download(&name);
    a.style().set_property("display", "none").map_err(js)?;""",
        """    a.set_download(&name);
    a.set_attribute("data-bfp-save-id", save_id).map_err(js)?;
    a.style().set_property("display", "none").map_err(js)?;""",
    ),
], "fn listen_bfp_save_results(")

cargo_path = "apps/photocraft-web/Cargo.toml"
cargo = patch(cargo_path, [
    (
        '"ErrorEvent", "PromiseRejectionEvent"',
        '"ErrorEvent", "PromiseRejectionEvent", "CustomEvent"',
    ),
], '"PromiseRejectionEvent", "CustomEvent"')

js_path = "branding/bfp-save-as.js"
js = patch(js_path, [
    (
        """  function safeName(a) {""",
        """  // The Rust editor only clears a document's unsaved marker after this event
  // confirms that the native File System Access writer actually closed.
  // A fallback download, failed write, or cancelled picker is NOT confirmation.
  function saveReceipt(item, saved) {
    if (!item.saveId) return; // Old published engines do not supply save ids.
    window.dispatchEvent(new CustomEvent('bfp-save-result', {
      detail: {id:item.saveId, saved:!!saved}
    }));
  }

  function safeName(a) {""",
    ),
    (
        """      const done=() => {document.removeEventListener('keydown',esc);shade.remove();resolve();};""",
        """       const done=(saved=false) => {
        document.removeEventListener('keydown',esc);
        shade.remove();
        saveReceipt(item,saved);
        resolve();
       };""",
    ),
    (
        """          await remember(item.name,handle);
          done();""",
        """          await remember(item.name,handle);
          done(true);""",
    ),
    (
        """          try {await write(previous,blob);done();}""",
        """          try {await write(previous,blob);done(true);}""",
    ),
    (
        """        catch(e) {console.error('BrightForge Photo: save failed',e);}""",
        """        catch(e) {
          console.error('BrightForge Photo: save failed',e);
          saveReceipt(item,false);
        }""",
    ),
    (
        """      pending.push({name:safeName(this),blob});""",
        """       pending.push({name:safeName(this),blob,saveId:this.getAttribute('data-bfp-save-id')});""",
    ),
], "function saveReceipt(item, saved)")

# Refuse to leave a partially patched source tree when any anchor changes.
plans = [services, app_files, web, cargo, js]
if all(not changed for _, _, changed in plans):
    print("Already installed; no files changed")
else:
    for target, contents, changed in plans:
        if changed:
            target.write_text(contents, encoding="utf-8")
            print(f"Patched: {target.relative_to(ROOT)}")
print("Success: source-side save confirmation is staged, not deployed")
