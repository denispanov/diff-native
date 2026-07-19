use wasm_bindgen::prelude::*;

use crate::patch::types::Patch;

#[wasm_bindgen(module = "/src/patch-boundary.js")]
extern "C" {
    #[wasm_bindgen(js_name = isUnixBoundary, catch)]
    fn is_unix_boundary(patch: &JsValue) -> Result<bool, JsValue>;
    #[wasm_bindgen(js_name = isWinBoundary, catch)]
    fn is_win_boundary(patch: &JsValue) -> Result<bool, JsValue>;
    #[wasm_bindgen(js_name = unixToWinBoundary, catch)]
    fn unix_to_win_boundary(patch: &JsValue) -> Result<JsValue, JsValue>;
    #[wasm_bindgen(js_name = winToUnixBoundary, catch)]
    fn win_to_unix_boundary(patch: &JsValue) -> Result<JsValue, JsValue>;
}

pub(crate) fn is_unix_internal(patch: &Patch) -> bool {
    patch.hunks.iter().all(|h| {
        h.lines
            .iter()
            .all(|l| l.starts_with('\\') || !l.ends_with('\r'))
    })
}

pub(crate) fn is_win_internal(patch: &Patch) -> bool {
    patch
        .hunks
        .iter()
        .any(|h| h.lines.iter().any(|l| l.ends_with('\r')))
        && patch.hunks.iter().all(|h| {
            h.lines.iter().enumerate().all(|(i, l)| {
                if l.starts_with('\\') || l.ends_with('\r') {
                    true
                } else {
                    matches!(h.lines.get(i + 1), Some(nxt) if nxt.starts_with('\\'))
                }
            })
        })
}

pub(crate) fn win_to_unix_internal(p: &Patch) -> Patch {
    let mut out = p.clone();
    for h in &mut out.hunks {
        for l in &mut h.lines {
            if l.ends_with('\r') {
                l.pop();
            }
        }
    }
    out
}

pub(crate) fn unix_to_win_internal(p: &Patch) -> Patch {
    let mut out = p.clone();
    for h in &mut out.hunks {
        let mut nl = Vec::with_capacity(h.lines.len());
        for (i, line) in h.lines.iter().enumerate() {
            if line.starts_with('\\')
                || line.ends_with('\r')
                || h.lines.get(i + 1).is_some_and(|n| n.starts_with('\\'))
            {
                nl.push(line.clone());
            } else {
                nl.push(format!("{line}\r"));
            }
        }
        h.lines = nl;
    }
    out
}

fn converted_value(value: JsValue, to_windows: bool) -> Result<JsValue, JsValue> {
    if to_windows {
        unix_to_win_boundary(&value)
    } else {
        win_to_unix_boundary(&value)
    }
}

#[wasm_bindgen(js_name = isUnix)]
pub fn is_unix(v: JsValue) -> Result<bool, JsValue> {
    is_unix_boundary(&v)
}

#[wasm_bindgen(js_name = isWin)]
pub fn is_win(v: JsValue) -> Result<bool, JsValue> {
    is_win_boundary(&v)
}

#[wasm_bindgen(js_name = winToUnix)]
pub fn win_to_unix(v: JsValue) -> Result<JsValue, JsValue> {
    converted_value(v, false)
}

#[wasm_bindgen(js_name = unixToWin)]
pub fn unix_to_win(v: JsValue) -> Result<JsValue, JsValue> {
    converted_value(v, true)
}
