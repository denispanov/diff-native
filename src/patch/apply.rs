use js_sys::{Array, Reflect};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

use crate::{
    patch::{
        line_endings::{
            is_unix_internal, is_win_internal, unix_to_win_internal, win_to_unix_internal,
        },
        parse::parse_patch_internal,
        types::{patch_from_value, Hunk, Patch},
    },
    util::{
        distance_iterator::DistanceIterator,
        string::{has_only_unix_line_endings, has_only_win_line_endings},
    },
};

#[wasm_bindgen(module = "/src/patch-boundary.js")]
extern "C" {
    #[wasm_bindgen(js_name = preparePatchBoundary, catch)]
    fn prepare_patch_boundary(
        source: &str,
        patch: &JsValue,
        options: &JsValue,
    ) -> Result<JsValue, JsValue>;
    #[wasm_bindgen(js_name = fuzzFactorBoundary, catch)]
    fn fuzz_factor_boundary(options: &JsValue) -> Result<JsValue, JsValue>;
}

#[derive(Default, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOptions {
    pub auto_convert_line_endings: Option<bool>,
    pub fuzz_factor: Option<usize>,
    #[serde(skip)]
    pub compare_line: Option<js_sys::Function>,
}

pub(crate) fn apply_patch_internal(
    source: &str,
    patch: &Patch,
    options: &ApplyOptions,
) -> Result<String, String> {
    let mut patch = patch.clone();
    let fuzz = options.fuzz_factor.unwrap_or(0);

    if options.auto_convert_line_endings.unwrap_or(true)
        && has_only_win_line_endings(source)
        && is_unix_internal(&patch)
    {
        patch = unix_to_win_internal(&patch);
    } else if options.auto_convert_line_endings.unwrap_or(true)
        && has_only_unix_line_endings(source)
        && is_win_internal(&patch)
    {
        patch = win_to_unix_internal(&patch);
    }

    let mut lines: Vec<String> = if source.is_empty() {
        Vec::new()
    } else {
        source.split('\n').map(|s| s.to_string()).collect()
    };

    if patch.hunks.is_empty() {
        return Ok(source.to_string());
    }

    let (mut remove_eofnl, mut add_eofnl) = (false, false);
    if let Some(last_hunk) = patch.hunks.last() {
        let mut prev_line = "";
        for line in &last_hunk.lines {
            if line.starts_with('\\') {
                if prev_line.starts_with('+') {
                    remove_eofnl = true;
                } else if prev_line.starts_with('-') {
                    add_eofnl = true;
                }
            }
            prev_line = line;
        }
    }

    if remove_eofnl {
        if add_eofnl {
            if fuzz == 0 && !lines.is_empty() && lines.last().unwrap().is_empty() {
                return Err("EOFNL mismatch".to_string());
            }
        } else if !lines.is_empty() && lines.last().unwrap().is_empty() {
            lines.pop();
        } else if fuzz == 0 {
            return Err("EOFNL mismatch".to_string());
        }
    } else if add_eofnl {
        if lines.is_empty() || !lines.last().unwrap().is_empty() {
            lines.push(String::new());
        } else if fuzz == 0 {
            return Err("EOFNL mismatch".to_string());
        }
    }

    let mut result: Vec<String> = Vec::new();
    let mut prev_hunk_offset: isize = 0;
    let mut min_line: isize = 0;

    for h in &patch.hunks {
        let old_start =
            patch_isize(h.old_start.0).ok_or_else(|| "invalid hunk range".to_string())?;
        let max_line_value = lines.len() as f64 - h.old_lines.0 + fuzz as f64;
        let max_line = if max_line_value.is_nan() || max_line_value <= isize::MIN as f64 {
            isize::MIN
        } else if max_line_value >= isize::MAX as f64 {
            isize::MAX
        } else {
            max_line_value.floor() as isize
        };
        let mut applied: Option<(isize, Vec<String>, isize)> = None;

        for max_err in 0..=fuzz {
            let start_pos = old_start
                .checked_add(prev_hunk_offset)
                .and_then(|value| value.checked_sub(1))
                .ok_or_else(|| "invalid hunk range".to_string())?;

            if let Some(r) = try_apply_hunk_with_options(h, &lines, start_pos, max_err, options) {
                applied = Some((start_pos, r.patched_lines, r.old_line_last_i));
                break;
            }

            let iter = DistanceIterator::new(start_pos, min_line, max_line);
            for pos in iter {
                if pos != start_pos {
                    if let Some(r) = try_apply_hunk_with_options(h, &lines, pos, max_err, options) {
                        applied = Some((pos, r.patched_lines, r.old_line_last_i));
                        break;
                    }
                }
            }
            if applied.is_some() {
                break;
            }
        }

        let (pos, patched, old_last) = applied.ok_or_else(|| "hunk apply failed".to_string())?;

        let copy_start = min_line.max(0);
        let copy_end = pos.max(0);
        let additional_lines = usize::try_from(copy_end.saturating_sub(copy_start))
            .ok()
            .and_then(|count| count.checked_add(patched.len()))
            .ok_or_else(|| "invalid hunk range".to_string())?;
        result
            .try_reserve_exact(additional_lines)
            .map_err(|_| "invalid hunk range".to_string())?;
        for l in min_line.max(0)..pos.max(0) {
            if (l as usize) < lines.len() {
                result.push(lines[l as usize].clone());
            } else {
                result.push(String::new());
            }
        }
        result.extend(patched);

        min_line = old_last
            .checked_add(1)
            .ok_or_else(|| "invalid hunk range".to_string())?;
        prev_hunk_offset = pos
            .checked_add(1)
            .and_then(|value| value.checked_sub(old_start))
            .ok_or_else(|| "invalid hunk range".to_string())?;
    }

    let tail_start = min_line.max(0).min(lines.len() as isize) as usize;
    let tail_lines = lines.len() - tail_start;
    result
        .try_reserve_exact(tail_lines)
        .map_err(|_| "invalid hunk range".to_string())?;
    result.extend_from_slice(&lines[tail_start..]);

    let output_bytes = result
        .iter()
        .try_fold(0usize, |total, line| total.checked_add(line.len()))
        .and_then(|total| total.checked_add(result.len().saturating_sub(1)))
        .ok_or_else(|| "invalid hunk range".to_string())?;
    let mut output = String::new();
    output
        .try_reserve_exact(output_bytes)
        .map_err(|_| "invalid hunk range".to_string())?;
    for (index, line) in result.iter().enumerate() {
        if index > 0 {
            output.push('\n');
        }
        output.push_str(line);
    }

    // Special case: when source was empty and we added content, ensure trailing newline
    if source.is_empty() && !output.is_empty() && !output.ends_with('\n') {
        // Check if patch explicitly specifies no newline at end
        let has_explicit_no_eofnl = patch.hunks.last().is_some_and(|h| {
            h.lines
                .windows(2)
                .any(|w| w[0].starts_with('+') && w[1] == "\\ No newline at end of file")
        });

        if !has_explicit_no_eofnl {
            output.push('\n');
        }
    }

    Ok(output)
}

fn patch_isize(value: f64) -> Option<isize> {
    if value.is_finite() && value >= 0.0 && value <= isize::MAX as f64 && value.fract() == 0.0 {
        Some(value as isize)
    } else {
        None
    }
}

#[wasm_bindgen(js_name = applyPatch)]
pub fn apply_patch(source: &str, uni_diff: JsValue, opts: JsValue) -> Result<JsValue, JsValue> {
    let mut patch_val = uni_diff.clone();

    if Array::is_array(&uni_diff) {
        let arr = Array::from(&uni_diff);
        if arr.length() > 1 {
            return Err(js_sys::Error::new("applyPatch only works with a single input.").into());
        }
        patch_val = arr.get(0);
    }

    let patch_val = if patch_val.is_string() {
        let s = patch_val.as_string().unwrap();
        let patch = parse_patch_internal(&s)
            .map_err(|error| js_sys::Error::new(&error))?
            .into_iter()
            .next()
            .ok_or_else(|| JsValue::from_str("empty patch"))?;
        serde_wasm_bindgen::to_value(&patch)
            .map_err(|error| js_sys::Error::new(&error.to_string()))?
    } else {
        patch_val
    };
    let patch_val = prepare_patch_boundary(source, &patch_val, &opts)?;
    let patch = patch_from_value(patch_val)?;

    let mut options = ApplyOptions {
        auto_convert_line_endings: Some(false),
        ..ApplyOptions::default()
    };
    if !opts.is_undefined() && !opts.is_null() {
        let ff = fuzz_factor_boundary(&opts)?;
        #[allow(deprecated)]
        let fuzz_is_truthy = js_sys::Boolean::new(&ff).value_of();
        if fuzz_is_truthy {
            if let Some(n) = ff.as_f64() {
                if !n.is_finite() || n < 0.0 || n.fract() != 0.0 {
                    return Err(
                        js_sys::Error::new("fuzzFactor must be a non-negative integer").into(),
                    );
                }
                options.fuzz_factor = Some(n as usize);
            } else {
                return Err(js_sys::Error::new("fuzzFactor must be a non-negative integer").into());
            }
        } else {
            options.fuzz_factor = Some(0);
        }
    }

    if opts.is_object() || opts.is_function() {
        let compare_line =
            Reflect::get(&opts, &JsValue::from_str("compareLine")).unwrap_or(JsValue::UNDEFINED);
        if !compare_line.is_undefined() && !compare_line.is_null() && compare_line.is_function() {
            options.compare_line = Some(js_sys::Function::from(compare_line));
        }
    }

    match apply_patch_internal(source, &patch, &options) {
        Ok(result) => Ok(JsValue::from_str(&result)),
        Err(_) => Ok(JsValue::from_bool(false)),
    }
}

#[derive(Clone, Debug)]
pub(crate) struct ApplyRes {
    pub(crate) patched_lines: Vec<String>,
    pub(crate) old_line_last_i: isize,
}

pub(crate) fn try_apply_hunk_with_options(
    h: &Hunk,
    lines: &[String],
    pos: isize,
    errs: usize,
    options: &ApplyOptions,
) -> Option<ApplyRes> {
    apply_hunk_rec(
        &h.lines,
        lines,
        pos,
        errs,
        0,
        true,
        Vec::new(),
        0,
        &options.compare_line,
    )
}

#[allow(clippy::too_many_arguments)]
fn apply_hunk_rec(
    hunk_lines: &[String],
    lines: &[String],
    mut to_pos: isize,
    max_errors: usize,
    mut hunk_i: usize,
    mut last_ctx_matched: bool,
    mut patched: Vec<String>,
    mut patched_len: usize,
    compare_line: &Option<js_sys::Function>,
) -> Option<ApplyRes> {
    let mut n_consecutive_ctx = 0;
    let mut next_ctx_must_match = false;

    while hunk_i < hunk_lines.len() {
        let hl = &hunk_lines[hunk_i];

        if hl.starts_with('\\') {
            hunk_i += 1;
            continue;
        }

        let (op, content) = if hl.is_empty() {
            (' ', "")
        } else {
            match hl.as_bytes()[0] {
                b'+' | b'-' | b' ' => (hl.as_bytes()[0] as char, &hl[1..]),
                _ => {
                    hunk_i += 1;
                    continue;
                }
            }
        };

        match op {
            '-' => {
                let matches = if let Some(compare_fn) = compare_line {
                    let this = JsValue::NULL;
                    let line_num = JsValue::from_f64((to_pos + 1) as f64);
                    let line_content =
                        JsValue::from_str(lines.get(to_pos as usize).unwrap_or(&String::new()));
                    let op = JsValue::from_str("-");
                    let patch_content = JsValue::from_str(content);

                    let args = js_sys::Array::new();
                    args.push(&line_num);
                    args.push(&line_content);
                    args.push(&op);
                    args.push(&patch_content);

                    compare_fn
                        .apply(&this, &args)
                        .map(|result| result.as_bool().unwrap_or(false))
                        .unwrap_or(false)
                } else {
                    lines
                        .get(to_pos as usize)
                        .map(|l| l == content)
                        .unwrap_or(false)
                };

                if matches {
                    to_pos += 1;
                    n_consecutive_ctx = 0;
                    /* Note: the JS original **does not** change lastContextLineMatched here */
                    next_ctx_must_match = false;
                } else {
                    if max_errors == 0 || lines.get(to_pos as usize).is_none() {
                        return None;
                    }

                    patched.push(lines[to_pos as usize].clone());
                    return apply_hunk_rec(
                        hunk_lines,
                        lines,
                        to_pos + 1,
                        max_errors - 1,
                        hunk_i,
                        false,
                        patched,
                        patched_len + 1,
                        compare_line,
                    );
                }
            }
            '+' => {
                // Context line immediately before insertion must match exactly
                if !last_ctx_matched {
                    return None;
                }
                patched.push(content.to_string());
                patched_len += 1;
                n_consecutive_ctx = 0;
                next_ctx_must_match = true;
            }
            _ => {
                n_consecutive_ctx += 1;
                let source_line = lines.get(to_pos as usize)?.clone();

                let matches = if let Some(compare_fn) = compare_line {
                    let this = JsValue::NULL;
                    let line_num = JsValue::from_f64((to_pos + 1) as f64);
                    let line_content = JsValue::from_str(&source_line);
                    let op = JsValue::from_str(" ");
                    let patch_content = JsValue::from_str(content);

                    let args = js_sys::Array::new();
                    args.push(&line_num);
                    args.push(&line_content);
                    args.push(&op);
                    args.push(&patch_content);

                    compare_fn
                        .apply(&this, &args)
                        .map(|result| result.as_bool().unwrap_or(false))
                        .unwrap_or(false)
                } else {
                    source_line == content
                };

                if matches {
                    patched.push(source_line);
                    patched_len += 1;
                    last_ctx_matched = true;
                    next_ctx_must_match = false;
                    to_pos += 1;
                } else {
                    // Context line immediately after insertion must match exactly
                    if next_ctx_must_match || max_errors == 0 {
                        return None;
                    }

                    let mut patched_with_line = patched.clone();
                    patched_with_line.push(source_line);

                    return if lines.get(to_pos as usize).is_some() {
                        apply_hunk_rec(
                            hunk_lines,
                            lines,
                            to_pos + 1,
                            max_errors - 1,
                            hunk_i + 1,
                            false,
                            patched_with_line.clone(),
                            patched_len + 1,
                            compare_line,
                        )
                        .or_else(|| {
                            apply_hunk_rec(
                                hunk_lines,
                                lines,
                                to_pos + 1,
                                max_errors - 1,
                                hunk_i,
                                false,
                                patched_with_line,
                                patched_len + 1,
                                compare_line,
                            )
                        })
                    } else {
                        None
                    }
                    .or_else(|| {
                        apply_hunk_rec(
                            hunk_lines,
                            lines,
                            to_pos,
                            max_errors - 1,
                            hunk_i + 1,
                            false,
                            patched,
                            patched_len,
                            compare_line,
                        )
                    });
                }
            }
        }
        hunk_i += 1;
    }

    patched_len -= n_consecutive_ctx;
    to_pos -= n_consecutive_ctx as isize;
    patched.truncate(patched_len);

    Some(ApplyRes {
        patched_lines: patched,
        old_line_last_i: to_pos - 1,
    })
}

#[wasm_bindgen(js_name = applyPatches)]
pub fn apply_patches(uni_diff: &str, cb: &js_sys::Function) {
    let list = match parse_patch_internal(uni_diff) {
        Ok(v) => v,
        Err(e) => {
            let _ = cb.call1(
                &JsValue::NULL,
                &JsValue::from_str(&format!("parse error: {e}")),
            );
            return;
        }
    };

    let this = JsValue::NULL;
    for (idx, p) in list.into_iter().enumerate() {
        let _ = cb.call2(
            &this,
            &JsValue::from_f64(idx as f64),
            &serde_wasm_bindgen::to_value(&p).unwrap(),
        );
    }
}

#[cfg(test)]
#[path = "apply_test.rs"]
mod tests;
