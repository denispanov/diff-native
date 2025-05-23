use serde::Deserialize;
use wasm_bindgen::prelude::*;

use crate::{
    diff::line::diff_lines,
    patch::types::{Hunk, Patch},
};

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredOptions {
    pub context: Option<usize>,
    pub newline_is_token: Option<bool>,
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
    let opt_rs: StructuredOptions =
        serde_wasm_bindgen::from_value(opts.clone()).unwrap_or_default();
    if opt_rs.newline_is_token.unwrap_or(false) {
        return Err("newlineIsToken may not be used with patch-generation functions".into());
    }
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
        } else {
            if let Some(last) = result.last_mut() {
                *last = last[..last.len() - 1].to_string();
            }
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
                        old_start: old_range_start,
                        old_lines: old_line - old_range_start + context_size,
                        new_start: new_range_start,
                        new_lines: new_line - new_range_start + context_size,
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
            old_start: old_range_start,
            old_lines: old_line - old_range_start,
            new_start: new_range_start,
            new_lines: new_line - new_range_start,
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
        old_file_name: old_file_name.to_string(),
        new_file_name: new_file_name.to_string(),
        old_header: old_header.unwrap_or_default(),
        new_header: new_header.unwrap_or_default(),
        hunks,
        ..Default::default()
    };
    serde_wasm_bindgen::to_value(&patch).map_err(Into::into)
}

pub(crate) fn format_single(p: &Patch) -> String {
    let mut out = String::new();
    if p.old_file_name == p.new_file_name {
        out.push_str(&format!("Index: {}\n", p.old_file_name));
    }
    out.push_str("===================================================================\n");

    let hdr_line =
        |tag: &str, name: &str, hdr: &str| -> String { format!("{tag} {name}\t{hdr}\n") };
    out.push_str(&hdr_line("---", &p.old_file_name, &p.old_header));
    out.push_str(&hdr_line("+++", &p.new_file_name, &p.new_header));

    for h in &p.hunks {
        let od = if h.old_lines == 0 {
            h.old_start - 1
        } else {
            h.old_start
        };
        let nd = if h.new_lines == 0 {
            h.new_start - 1
        } else {
            h.new_start
        };
        out.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            od, h.old_lines, nd, h.new_lines
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
pub fn format_patch(val: JsValue) -> Result<String, JsValue> {
    if val.is_string() {
        return Ok(val.as_string().unwrap());
    }
    if let Ok(vec) = serde_wasm_bindgen::from_value::<Vec<Patch>>(val.clone()) {
        return Ok(vec.iter().map(format_single).collect::<Vec<_>>().join("\n"));
    }
    let p: Patch = serde_wasm_bindgen::from_value(val)?;
    Ok(format_single(&p))
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
    format_patch(patch_val)
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
