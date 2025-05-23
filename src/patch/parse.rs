use regex::Regex;
use wasm_bindgen::prelude::*;

use crate::patch::types::{Hunk, Patch};

pub fn parse_patch_internal(uni_diff: &str) -> Result<Vec<Patch>, String> {
    if uni_diff.is_empty() {
        return Ok(vec![]);
    }

    let lines: Vec<&str> = uni_diff.split('\n').collect();
    let mut idx = 0;
    let mut out = Vec::<Patch>::new();

    let header_re = Regex::new(r"^(?:Index:|diff(?: -r [a-fA-F0-9]+)+)\s+(.+?)\s*$").unwrap();
    let file_hdr_re = Regex::new(r"^(---|\+\+\+)\s+(.*)\r?$").unwrap();
    let chunk_hdr_re = Regex::new(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@").unwrap();

    fn parse_index(
        lines: &[&str],
        idx: &mut usize,
        header_re: &Regex,
        file_hdr_re: &Regex,
        chunk_hdr_re: &Regex,
    ) -> Result<Patch, String> {
        let mut p = Patch::default();

        while *idx < lines.len() {
            let l = lines[*idx];
            if l.starts_with("--- ") || l.starts_with("+++ ") || l.starts_with("@@") {
                break;
            }
            if let Some(c) = header_re.captures(l) {
                p.index = Some(c[1].to_owned());
            }
            *idx += 1;
        }

        parse_file_header(lines, idx, &mut p, file_hdr_re);
        parse_file_header(lines, idx, &mut p, file_hdr_re);

        p.hunks = Vec::new();
        while *idx < lines.len() {
            let l = lines[*idx];
            if l.starts_with("Index: ")
                || l.starts_with("diff ")
                || l.starts_with("--- ")
                || l.starts_with("+++ ")
                || l.starts_with(
                    "===================================================================",
                )
            {
                break;
            } else if l.starts_with("@@") {
                p.hunks.push(parse_hunk(lines, idx, chunk_hdr_re)?);
            } else if l.is_empty() {
                *idx += 1;
            } else {
                return Err(format!("Unknown line {} {}", *idx + 1, l));
            }
        }

        Ok(p)
    }

    fn parse_file_header(lines: &[&str], idx: &mut usize, patch: &mut Patch, file_hdr_re: &Regex) {
        if let Some(file_header) = file_hdr_re.captures(lines.get(*idx).unwrap_or(&"")) {
            let data: Vec<&str> = file_header[2].split('\t').collect();
            let header = if data.len() > 1 { data[1].trim() } else { "" };
            let mut file_name = data[0].replace("\\\\", "\\");

            if file_name.starts_with('"') && file_name.ends_with('"') {
                file_name = file_name[1..file_name.len() - 1].to_string();
            }

            if &file_header[1] == "---" {
                patch.old_file_name = file_name;
                patch.old_header = header.to_string();
            } else {
                patch.new_file_name = file_name;
                patch.new_header = header.to_string();
            }

            *idx += 1;
        }
    }

    fn parse_hunk(lines: &[&str], idx: &mut usize, chunk_hdr_re: &Regex) -> Result<Hunk, String> {
        let chunk_header_index = *idx;
        let chunk_header_line = lines[*idx];
        *idx += 1;

        let caps = chunk_hdr_re
            .captures(chunk_header_line)
            .ok_or_else(|| format!("invalid hunk header @ line {}", chunk_header_index + 1))?;

        let mut h = Hunk {
            old_start: caps[1].parse().unwrap(),
            old_lines: caps
                .get(2)
                .map(|m| m.as_str().parse().unwrap_or(1))
                .unwrap_or(1),
            new_start: caps[3].parse().unwrap(),
            new_lines: caps
                .get(4)
                .map(|m| m.as_str().parse().unwrap_or(1))
                .unwrap_or(1),
            lines: Vec::new(),
        };

        // Unified Diff Format quirk: If the chunk size is 0,
        // the first number is one lower than one would expect.
        if h.old_lines == 0 {
            h.old_start += 1;
        }
        if h.new_lines == 0 {
            h.new_start += 1;
        }

        let mut add_count = 0;
        let mut remove_count = 0;

        while *idx < lines.len()
            && (remove_count < h.old_lines
                || add_count < h.new_lines
                || lines[*idx].starts_with('\\'))
        {
            let line = lines[*idx];
            let operation = if line.is_empty() && *idx != lines.len() - 1 {
                ' '
            } else {
                line.chars().next().unwrap_or(' ')
            };

            if operation == '+' || operation == '-' || operation == ' ' || operation == '\\' {
                h.lines.push(line.to_string());

                if operation == '+' {
                    add_count += 1;
                } else if operation == '-' {
                    remove_count += 1;
                } else if operation == ' ' {
                    add_count += 1;
                    remove_count += 1;
                }
            } else if line.starts_with("@@") {
                break;
            } else {
                return Err(format!(
                    "Hunk at line {} contained invalid line {}",
                    chunk_header_index + 1,
                    line
                ));
            }

            *idx += 1;
        }

        if add_count == 0 && h.new_lines == 1 {
            h.new_lines = 0;
        }
        if remove_count == 0 && h.old_lines == 1 {
            h.old_lines = 0;
        }

        if add_count != h.new_lines {
            return Err(format!(
                "Added line count did not match for hunk at line {}",
                chunk_header_index + 1
            ));
        }
        if remove_count != h.old_lines {
            return Err(format!(
                "Removed line count did not match for hunk at line {}",
                chunk_header_index + 1
            ));
        }

        Ok(h)
    }

    while idx < lines.len() {
        match parse_index(&lines, &mut idx, &header_re, &file_hdr_re, &chunk_hdr_re) {
            Ok(patch) => out.push(patch),
            Err(e) => {
                // Only certain error patterns should cause a hard failure
                if e.contains("Unknown line") {
                    return Err(e);
                }
                if e.contains("Hunk at line") && e.contains("contained invalid line") {
                    return Err(e);
                }
                if e.contains("line count did not match") {
                    return Err(e);
                }
                // Other errors are ignored, and we just stop parsing here
                break;
            }
        }
    }

    Ok(out)
}

#[wasm_bindgen(js_name = parsePatch)]
pub fn parse_patch(uni_diff: &str) -> Result<JsValue, JsValue> {
    let parsed = parse_patch_internal(uni_diff).map_err(|e| JsValue::from_str(&e))?;
    serde_wasm_bindgen::to_value(&parsed).map_err(Into::into)
}
