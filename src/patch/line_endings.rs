use wasm_bindgen::prelude::*;

use crate::patch::types::Patch;

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
                || h.lines.get(i + 1).map_or(false, |n| n.starts_with('\\'))
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

#[wasm_bindgen(js_name = isUnix)]
pub fn is_unix(v: JsValue) -> Result<bool, JsValue> {
    if let Ok(vec) = serde_wasm_bindgen::from_value::<Vec<Patch>>(v.clone()) {
        return Ok(vec.iter().all(is_unix_internal));
    }
    let p: Patch = serde_wasm_bindgen::from_value(v)?;
    Ok(is_unix_internal(&p))
}

#[wasm_bindgen(js_name = isWin)]
pub fn is_win(v: JsValue) -> Result<bool, JsValue> {
    if let Ok(vec) = serde_wasm_bindgen::from_value::<Vec<Patch>>(v.clone()) {
        let some = vec.iter().any(|p| {
            p.hunks
                .iter()
                .any(|h| h.lines.iter().any(|l| l.ends_with('\r')))
        });
        let all = vec.iter().all(is_win_internal);
        return Ok(some && all);
    }
    let p: Patch = serde_wasm_bindgen::from_value(v)?;
    Ok(is_win_internal(&p))
}

#[wasm_bindgen(js_name = winToUnix)]
pub fn win_to_unix(v: JsValue) -> Result<JsValue, JsValue> {
    if let Ok(vec) = serde_wasm_bindgen::from_value::<Vec<Patch>>(v.clone()) {
        let conv: Vec<Patch> = vec.iter().map(win_to_unix_internal).collect();
        return serde_wasm_bindgen::to_value(&conv).map_err(Into::into);
    }
    let p: Patch = serde_wasm_bindgen::from_value(v)?;
    serde_wasm_bindgen::to_value(&win_to_unix_internal(&p)).map_err(Into::into)
}

#[wasm_bindgen(js_name = unixToWin)]
pub fn unix_to_win(v: JsValue) -> Result<JsValue, JsValue> {
    if let Ok(vec) = serde_wasm_bindgen::from_value::<Vec<Patch>>(v.clone()) {
        let conv: Vec<Patch> = vec.iter().map(unix_to_win_internal).collect();
        return serde_wasm_bindgen::to_value(&conv).map_err(Into::into);
    }
    let p: Patch = serde_wasm_bindgen::from_value(v)?;
    serde_wasm_bindgen::to_value(&unix_to_win_internal(&p)).map_err(Into::into)
}
