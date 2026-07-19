use regex::Regex;
use wasm_bindgen::prelude::*;

use crate::patch::types::{Hunk, Patch, PatchNumber};

const ECMASCRIPT_WHITESPACE: &str = "\t\n\u{000B}\u{000C}\r \u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}";

fn is_ecmascript_whitespace(character: char) -> bool {
    ECMASCRIPT_WHITESPACE.contains(character)
}

fn trim_ecmascript(value: &str) -> &str {
    value.trim_matches(is_ecmascript_whitespace)
}

pub fn parse_patch_internal(uni_diff: &str) -> Result<Vec<Patch>, String> {
    let lines: Vec<&str> = uni_diff.split('\n').collect();
    let mut idx = 0;
    let mut out = Vec::<Patch>::new();

    let js_ws = r"[\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]";
    let diff_header_re = Regex::new(&format!(
        r"^(?:Index:{js_ws}|diff(?: -r [A-Za-z0-9_]+)+{js_ws})"
    ))
    .unwrap();
    let header_prefix_re =
        Regex::new(&format!(r"^(?:Index:|diff(?: -r [A-Za-z0-9_]+)+){js_ws}+")).unwrap();
    let file_hdr_re = Regex::new(&format!(r"^(---|\+\+\+){js_ws}+(.*)\r?$")).unwrap();
    let chunk_hdr_re =
        Regex::new(r"@@ -([0-9]+)(?:,([0-9]+))? \+([0-9]+)(?:,([0-9]+))? @@").unwrap();

    fn is_diff_header(line: &str, diff_header_re: &Regex) -> bool {
        diff_header_re.is_match(line)
    }

    fn is_file_header(line: &str) -> bool {
        line.strip_prefix("---")
            .or_else(|| line.strip_prefix("+++"))
            .is_some_and(|rest| rest.chars().next().is_some_and(is_ecmascript_whitespace))
    }

    fn is_hunk_header(line: &str) -> bool {
        line.strip_prefix("@@")
            .is_some_and(|rest| rest.chars().next().is_some_and(is_ecmascript_whitespace))
    }

    fn parse_file_header(lines: &[&str], idx: &mut usize, patch: &mut Patch, file_hdr_re: &Regex) {
        if let Some(file_header) = file_hdr_re.captures(lines.get(*idx).unwrap_or(&"")) {
            let mut data = trim_ecmascript(&file_header[2]).split('\t');
            let mut file_name = data.next().unwrap_or_default().replace("\\\\", "\\");
            let header = trim_ecmascript(data.next().unwrap_or_default());

            if file_name.len() >= 2 && file_name.starts_with('"') && file_name.ends_with('"') {
                file_name = file_name[1..file_name.len() - 1].to_string();
            }

            if &file_header[1] == "---" {
                patch.old_file_name = Some(file_name);
                patch.old_header = Some(header.to_string());
            } else {
                patch.new_file_name = Some(file_name);
                patch.new_header = Some(header.to_string());
            }

            *idx += 1;
        }
    }

    fn parse_number(value: Option<regex::Match<'_>>, default: f64) -> f64 {
        value
            .map(|matched| matched.as_str().parse::<f64>().unwrap_or(f64::NAN))
            .unwrap_or(default)
    }

    fn parse_hunk(lines: &[&str], idx: &mut usize, chunk_hdr_re: &Regex) -> Result<Hunk, String> {
        let chunk_header_index = *idx;
        let chunk_header_line = lines[*idx];
        *idx += 1;

        let captures = chunk_hdr_re.captures(chunk_header_line);
        let mut hunk = Hunk {
            old_start: PatchNumber(
                captures
                    .as_ref()
                    .map_or(f64::NAN, |caps| parse_number(caps.get(1), f64::NAN)),
            ),
            old_lines: PatchNumber(
                captures
                    .as_ref()
                    .map_or(1.0, |caps| parse_number(caps.get(2), 1.0)),
            ),
            new_start: PatchNumber(
                captures
                    .as_ref()
                    .map_or(f64::NAN, |caps| parse_number(caps.get(3), f64::NAN)),
            ),
            new_lines: PatchNumber(
                captures
                    .as_ref()
                    .map_or(1.0, |caps| parse_number(caps.get(4), 1.0)),
            ),
            lines: Vec::new(),
        };

        if hunk.old_lines == 0 {
            hunk.old_start.0 += 1.0;
        }
        if hunk.new_lines == 0 {
            hunk.new_start.0 += 1.0;
        }

        let mut add_count = 0.0;
        let mut remove_count = 0.0;
        while *idx < lines.len()
            && (remove_count < hunk.old_lines.0
                || add_count < hunk.new_lines.0
                || lines[*idx].starts_with('\\'))
        {
            let line = lines[*idx];
            let operation = if line.is_empty() {
                if *idx == lines.len() - 1 {
                    '\0'
                } else {
                    ' '
                }
            } else {
                line.chars().next().unwrap_or(' ')
            };

            if !matches!(operation, '+' | '-' | ' ' | '\\') {
                return Err(format!(
                    "Hunk at line {} contained invalid line {}",
                    chunk_header_index + 1,
                    line
                ));
            }

            hunk.lines.push(line.to_string());
            match operation {
                '+' => add_count += 1.0,
                '-' => remove_count += 1.0,
                ' ' => {
                    add_count += 1.0;
                    remove_count += 1.0;
                }
                _ => {}
            }
            *idx += 1;
        }

        if add_count == 0.0 && hunk.new_lines == 1 {
            hunk.new_lines = PatchNumber(0.0);
        }
        if remove_count == 0.0 && hunk.old_lines == 1 {
            hunk.old_lines = PatchNumber(0.0);
        }
        if add_count != hunk.new_lines.0 {
            return Err(format!(
                "Added line count did not match for hunk at line {}",
                chunk_header_index + 1
            ));
        }
        if remove_count != hunk.old_lines.0 {
            return Err(format!(
                "Removed line count did not match for hunk at line {}",
                chunk_header_index + 1
            ));
        }

        if let Some(line) = lines.get(*idx) {
            if !line.is_empty()
                && matches!(line.as_bytes().first(), Some(b'+' | b'-' | b' '))
                && !is_file_header(line)
            {
                return Err(format!(
                    "Hunk at line {} has more lines than expected (expected {} old lines and {} new lines)",
                    chunk_header_index + 1,
                    hunk.old_lines.0,
                    hunk.new_lines.0
                ));
            }
        }

        Ok(hunk)
    }

    while idx < lines.len() {
        let mut patch = Patch::default();
        let mut seen_diff_header = false;

        while idx < lines.len() {
            let line = lines[idx];
            if is_file_header(line) || is_hunk_header(line) {
                break;
            }
            if is_diff_header(line, &diff_header_re) {
                if seen_diff_header {
                    break;
                }
                seen_diff_header = true;
                if let Some(prefix) = header_prefix_re.find(line) {
                    patch.index = Some(trim_ecmascript(&line[prefix.end()..]).to_string());
                }
            }
            idx += 1;
        }

        parse_file_header(&lines, &mut idx, &mut patch, &file_hdr_re);
        parse_file_header(&lines, &mut idx, &mut patch, &file_hdr_re);

        if patch.old_file_name.is_some() != patch.new_file_name.is_some() {
            let (missing, file_name) = if patch.old_file_name.is_some() {
                ("+++", patch.old_file_name.as_deref().unwrap_or_default())
            } else {
                ("---", patch.new_file_name.as_deref().unwrap_or_default())
            };
            return Err(format!(
                "Missing \"{missing} ...\" file header for {file_name}"
            ));
        }

        while idx < lines.len() {
            let line = lines[idx];
            if is_diff_header(line, &diff_header_re)
                || is_file_header(line)
                || line.starts_with(
                    "===================================================================",
                )
            {
                break;
            }
            if is_hunk_header(line) {
                patch
                    .hunks
                    .push(parse_hunk(&lines, &mut idx, &chunk_hdr_re)?);
            } else {
                idx += 1;
            }
        }
        out.push(patch);
    }

    Ok(out)
}

#[wasm_bindgen(js_name = parsePatch)]
pub fn parse_patch(uni_diff: &str) -> Result<JsValue, JsValue> {
    let parsed = parse_patch_internal(uni_diff).map_err(|error| js_sys::Error::new(&error))?;
    serde_wasm_bindgen::to_value(&parsed)
        .map_err(|error| js_sys::Error::new(&error.to_string()).into())
}
