use wasm_bindgen::prelude::*;

use crate::patch::types::{Hunk, Patch};

pub fn reverse_single(p: &Patch) -> Patch {
    let mut out = p.clone();
    std::mem::swap(&mut out.old_file_name, &mut out.new_file_name);
    std::mem::swap(&mut out.old_header, &mut out.new_header);

    out.hunks = p
        .hunks
        .iter()
        .map(|h| {
            let mut nh = Hunk {
                old_start: h.new_start,
                old_lines: h.new_lines,
                new_start: h.old_start,
                new_lines: h.old_lines,
                lines: Vec::with_capacity(h.lines.len()),
            };
            for l in &h.lines {
                if let Some(rest) = l.strip_prefix('-') {
                    nh.lines.push(format!("+{rest}"));
                } else if let Some(rest) = l.strip_prefix('+') {
                    nh.lines.push(format!("-{rest}"));
                } else {
                    nh.lines.push(l.clone());
                }
            }
            nh
        })
        .collect();
    out
}

#[wasm_bindgen(js_name = reversePatch)]
pub fn reverse_patch(val: JsValue) -> Result<JsValue, JsValue> {
    if let Ok(vec) = serde_wasm_bindgen::from_value::<Vec<Patch>>(val.clone()) {
        let mut rev: Vec<Patch> = vec.iter().map(reverse_single).collect();
        rev.reverse();
        return serde_wasm_bindgen::to_value(&rev).map_err(Into::into);
    }
    let patch: Patch = serde_wasm_bindgen::from_value(val)?;
    serde_wasm_bindgen::to_value(&reverse_single(&patch)).map_err(Into::into)
}
