use js_sys::{Object, Reflect};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

use crate::{
    diff::line::diff_lines,
    patch::types::{Hunk, Patch},
};

#[wasm_bindgen(module = "/src/patch-boundary.js")]
extern "C" {
    #[wasm_bindgen(js_name = formatPatchBoundary, catch)]
    fn format_patch_boundary(patch: &JsValue, header_options: &JsValue)
        -> Result<JsValue, JsValue>;
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredOptions {
    pub context: Option<usize>,
}

#[derive(Deserialize)]
struct ChangeOwned {
    value: String,
    added: bool,
    removed: bool,
}

pub(crate) fn prefix_space(lines: &[String]) -> Vec<String> {
    lines.iter().map(|l| format!(" {}", l)).collect()
}

#[cfg(all(test, target_arch = "wasm32"))]
fn format_patch_number(value: f64) -> String {
    js_sys::Number::from(value)
        .to_string_with_radix(10)
        .ok()
        .and_then(|value| value.as_string())
        .unwrap_or_default()
}

#[cfg(all(test, not(target_arch = "wasm32")))]
fn format_patch_number(value: f64) -> String {
    value.to_string()
}

fn created_patch_to_value(patch: &Patch) -> Result<JsValue, JsValue> {
    let object = Object::new();
    let set = |key: &str, value: &JsValue| -> Result<(), JsValue> {
        Reflect::set(&object, &JsValue::from_str(key), value).map(|_| ())
    };
    set(
        "oldFileName",
        &JsValue::from_str(patch.old_file_name.as_deref().unwrap_or_default()),
    )?;
    set(
        "newFileName",
        &JsValue::from_str(patch.new_file_name.as_deref().unwrap_or_default()),
    )?;
    set(
        "oldHeader",
        &patch
            .old_header
            .as_deref()
            .map(JsValue::from_str)
            .unwrap_or(JsValue::UNDEFINED),
    )?;
    set(
        "newHeader",
        &patch
            .new_header
            .as_deref()
            .map(JsValue::from_str)
            .unwrap_or(JsValue::UNDEFINED),
    )?;
    set(
        "hunks",
        &serde_wasm_bindgen::to_value(&patch.hunks)
            .map_err(|error| js_sys::Error::new(&error.to_string()))?,
    )?;
    Ok(object.into())
}

#[wasm_bindgen(js_name = structuredPatch)]
pub fn structured_patch(
    old_file_name: &str,
    new_file_name: &str,
    old_str: &str,
    new_str: &str,
    old_header: Option<String>,
    new_header: Option<String>,
    opts: JsValue,
) -> Result<JsValue, JsValue> {
    if !opts.is_undefined() && !opts.is_null() {
        let newline_is_token = Reflect::get(&opts, &JsValue::from_str("newlineIsToken"))?;
        #[allow(deprecated)]
        if js_sys::Boolean::new(&newline_is_token).value_of() {
            return Err(js_sys::Error::new(
                "newlineIsToken may not be used with patch-generation functions, only with diffing functions",
            )
            .into());
        }
    }
    let opt_rs: StructuredOptions =
        serde_wasm_bindgen::from_value(opts.clone()).unwrap_or_default();
    let context = opt_rs.context.unwrap_or(4);

    let diff_val = diff_lines(old_str, new_str, opts)?;
    let mut changes: Vec<ChangeOwned> = serde_wasm_bindgen::from_value(diff_val)?;

    changes.push(ChangeOwned {
        value: String::new(),
        added: false,
        removed: false,
    });

    let mut hunks: Vec<Hunk> = Vec::new();
    let mut cur_range: Vec<String> = Vec::new();

    let mut old_line = 1usize;
    let mut new_line = 1usize;
    let mut old_range_start = 0usize;
    let mut new_range_start = 0usize;

    let mut prev_context_block: Vec<String> = Vec::new();

    let split_lines = |s: &str| -> Vec<String> {
        if s.is_empty() {
            return Vec::new();
        }
        let has_trailing_nl = s.ends_with('\n');
        let mut result: Vec<String> = s.split('\n').map(|line| format!("{}\n", line)).collect();
        if has_trailing_nl {
            result.pop();
        } else if let Some(last) = result.last_mut() {
            *last = last[..last.len() - 1].to_string();
        }
        result
    };

    for (i, ch) in changes.iter().enumerate() {
        let lines = split_lines(&ch.value);

        if ch.added || ch.removed {
            if old_range_start == 0 {
                old_range_start = old_line;
                new_range_start = new_line;

                if !prev_context_block.is_empty() && context > 0 {
                    let take = context.min(prev_context_block.len());
                    let slice = &prev_context_block[prev_context_block.len() - take..];
                    cur_range = prefix_space(slice);
                    old_range_start -= take;
                    new_range_start -= take;
                }
            }

            for l in &lines {
                cur_range.push(format!("{}{}", if ch.added { '+' } else { '-' }, l));
            }
            if ch.added {
                new_line += lines.len();
            } else {
                old_line += lines.len();
            }
        } else {
            if old_range_start != 0 {
                if lines.len() <= context * 2 && i < changes.len() - 2 {
                    cur_range.extend(prefix_space(&lines));
                } else {
                    let context_size = context.min(lines.len());
                    cur_range.extend(prefix_space(&lines[..context_size]));
                    hunks.push(Hunk {
                        old_start: old_range_start.into(),
                        old_lines: (old_line - old_range_start + context_size).into(),
                        new_start: new_range_start.into(),
                        new_lines: (new_line - new_range_start + context_size).into(),
                        lines: cur_range.clone(),
                    });
                    cur_range.clear();
                    old_range_start = 0;
                    new_range_start = 0;
                }
            }
            prev_context_block = lines.clone();

            old_line += lines.len();
            new_line += lines.len();
        }
    }

    if old_range_start != 0 {
        hunks.push(Hunk {
            old_start: old_range_start.into(),
            old_lines: (old_line - old_range_start).into(),
            new_start: new_range_start.into(),
            new_lines: (new_line - new_range_start).into(),
            lines: cur_range,
        });
    }

    for hunk in &mut hunks {
        let mut i = 0;
        while i < hunk.lines.len() {
            if hunk.lines[i].ends_with('\n') {
                hunk.lines[i] = hunk.lines[i][..hunk.lines[i].len() - 1].to_string();
            } else {
                hunk.lines
                    .insert(i + 1, "\\ No newline at end of file".to_string());
                i += 1;
            }
            i += 1;
        }
    }

    let patch = Patch {
        old_file_name: Some(old_file_name.to_string()),
        new_file_name: Some(new_file_name.to_string()),
        old_header,
        new_header,
        hunks,
        ..Default::default()
    };
    created_patch_to_value(&patch)
}

#[cfg(test)]
pub(crate) fn format_single(p: &Patch) -> String {
    let mut out = String::new();
    if p.old_file_name.is_some() && p.old_file_name == p.new_file_name {
        out.push_str(&format!(
            "Index: {}\n",
            p.old_file_name.as_deref().unwrap_or_default()
        ));
    }
    out.push_str("===================================================================\n");

    let hdr_line = |tag: &str, name: &str, hdr: Option<&str>| -> String {
        match hdr.filter(|value| !value.is_empty()) {
            Some(hdr) => format!("{tag} {name}\t{hdr}\n"),
            None => format!("{tag} {name}\n"),
        }
    };
    if let (Some(old_name), Some(new_name)) = (&p.old_file_name, &p.new_file_name) {
        out.push_str(&hdr_line("---", old_name, p.old_header.as_deref()));
        out.push_str(&hdr_line("+++", new_name, p.new_header.as_deref()));
    }

    for h in &p.hunks {
        let od = if h.old_lines == 0 {
            h.old_start.0 - 1.0
        } else {
            h.old_start.0
        };
        let nd = if h.new_lines == 0 {
            h.new_start.0 - 1.0
        } else {
            h.new_start.0
        };
        out.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            format_patch_number(od),
            format_patch_number(h.old_lines.0),
            format_patch_number(nd),
            format_patch_number(h.new_lines.0)
        ));
        for l in &h.lines {
            out.push_str(l);
            out.push('\n');
        }
    }
    out
}

#[cfg(test)]
#[path = "create_test.rs"]
mod tests;

#[wasm_bindgen(js_name = formatPatch)]
pub fn format_patch(val: JsValue, header_options: JsValue) -> Result<String, JsValue> {
    format_patch_boundary(&val, &header_options)?
        .as_string()
        .ok_or_else(|| js_sys::Error::new("formatPatch returned a non-string value").into())
}

#[wasm_bindgen(js_name = createTwoFilesPatch)]
pub fn create_two_files_patch(
    old_file: &str,
    new_file: &str,
    old_str: &str,
    new_str: &str,
    old_header: Option<String>,
    new_header: Option<String>,
    opts: JsValue,
) -> Result<String, JsValue> {
    let patch_val = structured_patch(
        old_file, new_file, old_str, new_str, old_header, new_header, opts,
    )?;
    format_patch(patch_val, JsValue::UNDEFINED)
}

#[wasm_bindgen(js_name = createPatch)]
pub fn create_patch(
    file_name: &str,
    old_str: &str,
    new_str: &str,
    old_header: Option<String>,
    new_header: Option<String>,
    opts: JsValue,
) -> Result<String, JsValue> {
    create_two_files_patch(
        file_name, file_name, old_str, new_str, old_header, new_header, opts,
    )
}
