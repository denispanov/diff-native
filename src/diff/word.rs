use once_cell::sync::Lazy;
use regex::Regex;
use serde::Deserialize;
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

use super::{
    base::{Change, Options, Tokeniser},
    token::Token,
};
use crate::util::string::{
    leading_ws, longest_common_prefix, longest_common_suffix, maximum_overlap, remove_prefix,
    remove_suffix, replace_prefix, replace_suffix, trailing_ws,
};

#[inline]
fn is_word_char(c: char) -> bool {
    matches!(
        c,
        'a'..='z'
            | 'A'..='Z'
            | '0'..='9'
            | '_'
            | '\u{C0}'..='\u{FF}'
            | '\u{F8}'..='\u{2C6}'
            | '\u{2C8}'..='\u{2D7}'
            | '\u{2DE}'..='\u{2FF}'
            | '\u{1E00}'..='\u{1EFF}'
    )
}

#[inline(always)]
fn ascii_eq_ignore_case(a: &str, b: &str) -> bool {
    let (ab, bb) = (a.as_bytes(), b.as_bytes());
    ab.len() == bb.len()
        && ab
            .iter()
            .zip(bb)
            .all(|(x, y)| x.to_ascii_lowercase() == y.to_ascii_lowercase())
}

#[derive(Default)]
pub struct WordTokenizer;

impl<'a> Tokeniser<'a> for WordTokenizer {
    fn tokenize<'b>(&self, text: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>] {
        arena.clear();
        if text.is_empty() {
            return &arena[..];
        }

        #[derive(Copy, Clone)]
        struct Range {
            start: usize,
            end: usize, // exclusive
        }

        let mut ranges: Vec<Range> = Vec::new();

        let mut prev_is_ws: Option<bool> = None;
        let mut prev_start: usize = 0;
        let mut prev_end: usize = 0;

        let bytes = text.as_bytes();
        let len = bytes.len();
        let mut pos = 0usize;

        while pos < len {
            let ch = text[pos..].chars().next().unwrap();
            let ch_len = ch.len_utf8();
            let start = pos;
            let mut end = pos + ch_len;
            let is_ws_part = ch.is_whitespace();

            if is_ws_part {
                while end < len {
                    let c2 = text[end..].chars().next().unwrap();
                    if !c2.is_whitespace() {
                        break;
                    }
                    end += c2.len_utf8();
                }
            } else if is_word_char(ch) {
                while end < len {
                    let c2 = text[end..].chars().next().unwrap();
                    if !is_word_char(c2) {
                        break;
                    }
                    end += c2.len_utf8();
                }
            }

            match (is_ws_part, prev_is_ws) {
                (true, None) => {
                    ranges.push(Range { start, end });
                }
                (true, Some(_)) => {
                    if let Some(last) = ranges.last_mut() {
                        last.end = end;
                    }
                }
                (false, Some(true)) => {
                    let prev_ws_is_standalone = ranges
                        .last()
                        .map(|r| r.start == prev_start && r.end == prev_end)
                        .unwrap_or(false);

                    if prev_ws_is_standalone {
                        if let Some(last) = ranges.last_mut() {
                            last.end = end;
                        }
                    } else {
                        ranges.push(Range {
                            start: prev_start,
                            end,
                        });
                    }
                }
                _ => {
                    ranges.push(Range { start, end });
                }
            }

            prev_is_ws = Some(is_ws_part);
            prev_start = start;
            prev_end = end;
            pos = end;
        }

        arena.reserve(ranges.len());
        for r in ranges {
            arena.push(Token {
                text: &text[r.start..r.end],
            });
        }
        &arena[..]
    }

    #[inline]
    fn join(&self, toks: &[Token<'a>]) -> String {
        toks.iter()
            .enumerate()
            .map(|(i, t)| {
                if i == 0 {
                    t.text
                } else {
                    t.text.trim_start_matches(|c: char| c.is_whitespace())
                }
            })
            .collect()
    }

    #[inline]
    fn equals(&self, l: &Token<'a>, r: &Token<'a>, opts: &Options) -> bool {
        let (lt, rt) = (l.text.trim(), r.text.trim());
        if opts.ignore_case {
            ascii_eq_ignore_case(lt, rt)
        } else {
            lt == rt
        }
    }

    fn post_process(&self, changes: Vec<Change>, opts: &Options) -> Vec<Change> {
        post_process_whitespace(changes, opts)
    }
}

static WWS_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(concat!(
        r"(\r?\n)|[a-zA-Z0-9_\u{C0}-\u{FF}\u{F8}-\u{2C6}\u{2C8}-\u{2D7}\u{2DE}-\u{2FF}\u{1E00}-\u{1EFF}]+",
        r"|[^\S\n\r]+|[^a-zA-Z0-9_\u{C0}-\u{FF}\u{F8}-\u{2C6}\u{2C8}-\u{2D7}\u{2DE}-\u{2FF}\u{1E00}-\u{1EFF}]"
    ))
    .unwrap()
});

#[derive(Default)]
pub struct WordWithSpaceTokenizer;

impl<'a> Tokeniser<'a> for WordWithSpaceTokenizer {
    fn tokenize<'b>(&self, value: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>] {
        arena.clear();
        for m in WWS_RE.find_iter(value) {
            arena.push(Token { text: m.as_str() });
        }
        arena
    }
    #[inline]
    fn join(&self, toks: &[Token<'a>]) -> String {
        toks.iter().map(|t| t.text).collect()
    }
}

#[allow(clippy::too_many_arguments)]
fn dedupe_whitespace(
    start_keep: Option<&mut Change>,
    deletion: Option<&mut Change>,
    insertion: Option<&mut Change>,
    end_keep: Option<&mut Change>,
) {
    match (deletion, insertion) {
        (Some(del), Some(ins)) => {
            let del_value = del.value.clone();
            let ins_value = ins.value.clone();
            let (old_pre, _old_suf) = (leading_ws(&del_value), trailing_ws(&del_value));
            let (new_pre, _new_suf) = (leading_ws(&ins_value), trailing_ws(&ins_value));

            if let Some(sk) = start_keep {
                let sk_value = sk.value.clone();
                let common = longest_common_prefix(old_pre, new_pre);
                sk.value = replace_suffix(&sk_value, new_pre, common);
                del.value = remove_prefix(&del_value, common);
                ins.value = remove_prefix(&ins_value, common);
            }
            if let Some(ek) = end_keep {
                let ek_value = ek.value.clone();
                let del_value = del.value.clone();
                let ins_value = ins.value.clone();
                let old_suf = trailing_ws(&del_value);
                let new_suf = trailing_ws(&ins_value);

                let common = longest_common_suffix(old_suf, new_suf);
                ek.value = replace_prefix(&ek_value, new_suf, common);
                del.value = remove_suffix(&del_value, common);
                ins.value = remove_suffix(&ins_value, common);
            }
        }
        (None, Some(ins)) => {
            if let Some(_sk) = start_keep {
                let ins_value = ins.value.clone();
                let ws = leading_ws(&ins_value);
                ins.value = ins_value[ws.len()..].to_string();
            }
            if let Some(ek) = end_keep {
                let ek_value = ek.value.clone();
                let ws = leading_ws(&ek_value);
                ek.value = ek_value[ws.len()..].to_string();
            }
        }
        (Some(del), None) => match (start_keep, end_keep) {
            (Some(sk), Some(ek)) => {
                let sk_value = sk.value.clone();
                let ek_value = ek.value.clone();
                let del_value = del.value.clone();

                let new_full = leading_ws(&ek_value);
                let (del_start, del_end) = (leading_ws(&del_value), trailing_ws(&del_value));
                let new_start = longest_common_prefix(new_full, del_start);
                del.value = remove_prefix(&del_value, new_start);

                let del_value = del.value.clone();
                let new_end = longest_common_suffix(&new_full[new_start.len()..], del_end);
                del.value = remove_suffix(&del_value, new_end);
                ek.value = replace_prefix(&ek_value, new_full, new_end);
                sk.value = replace_suffix(
                    &sk_value,
                    new_full,
                    &new_full[..new_full.len() - new_end.len()],
                );
            }
            (None, Some(ek)) => {
                let ek_value = ek.value.clone();
                let del_value = del.value.clone();
                let overlap = maximum_overlap(trailing_ws(&del_value), leading_ws(&ek_value));
                del.value = remove_suffix(&del_value, overlap);
            }
            (Some(sk), None) => {
                let sk_value = sk.value.clone();
                let del_value = del.value.clone();
                let overlap = maximum_overlap(trailing_ws(&sk_value), leading_ws(&del_value));
                del.value = remove_prefix(&del_value, overlap);
            }
            _ => {}
        },
        _ => {}
    }
}

fn post_process_whitespace(mut changes: Vec<Change>, opts: &Options) -> Vec<Change> {
    if opts.one_change_per_token || changes.len() <= 1 {
        return changes;
    }

    let mut last_keep: Option<*mut Change> = None;
    let mut insertion: Option<*mut Change> = None;
    let mut deletion: Option<*mut Change> = None;

    for ch in changes.iter_mut() {
        let ptr = ch as *mut Change;
        if ch.added {
            insertion = Some(ptr);
        } else if ch.removed {
            deletion = Some(ptr);
        } else {
            if insertion.is_some() || deletion.is_some() {
                unsafe {
                    dedupe_whitespace(
                        last_keep.map(|p| &mut *p),
                        deletion.map(|p| &mut *p),
                        insertion.map(|p| &mut *p),
                        Some(&mut *ch),
                    );
                }
            }
            last_keep = Some(ptr);
            insertion = None;
            deletion = None;
        }
    }

    if insertion.is_some() || deletion.is_some() {
        unsafe {
            dedupe_whitespace(
                last_keep.map(|p| &mut *p),
                deletion.map(|p| &mut *p),
                insertion.map(|p| &mut *p),
                None,
            );
        }
    }

    changes.retain(|c| !c.value.is_empty());
    changes
}

#[derive(Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct WordOptions {
    #[serde(default)]
    ignore_case: bool,
    #[serde(default)]
    ignore_whitespace: Option<bool>,
    #[serde(default)]
    one_change_per_token: bool,
    #[serde(default)]
    max_edit_length: Option<usize>,
}

impl From<WordOptions> for Options {
    fn from(wo: WordOptions) -> Self {
        Options {
            ignore_case: wo.ignore_case,
            one_change_per_token: wo.one_change_per_token,
            max_edit_length: wo.max_edit_length,
        }
    }
}

fn count_tokens<'a, T: Tokeniser<'a>>(tok: &T, s: &'a str) -> u32 {
    let mut arena = Vec::new();
    tok.tokenize(s, &mut arena).len() as u32
}

#[wasm_bindgen(js_name = diffWords)]
pub fn diff_words(old: &str, new_: &str, opts: JsValue) -> Result<JsValue, JsValue> {
    let wo: WordOptions = swb::from_value(opts).unwrap_or_default();
    let base_opts: Options = wo.clone().into();
    let use_with_space = wo.ignore_whitespace == Some(false);

    let equal = if base_opts.ignore_case {
        old.eq_ignore_ascii_case(new_)
    } else {
        old == new_
    };
    if equal {
        if new_.is_empty() {
            let empty: Vec<Change> = Vec::new();
            return swb::to_value(&empty).map_err(Into::into);
        }
        let cnt = if use_with_space {
            count_tokens(&WordWithSpaceTokenizer::default(), new_)
        } else {
            count_tokens(&WordTokenizer::default(), new_)
        };
        let changes = vec![Change {
            value: new_.to_string(),
            count: cnt,
            added: false,
            removed: false,
        }];
        return swb::to_value(&changes).map_err(Into::into);
    }

    use super::memory_pool::PooledDiff;
    let changes = if use_with_space {
        let mut diff = PooledDiff::new(WordWithSpaceTokenizer::default(), base_opts);
        diff.diff(old, new_)
    } else {
        let mut diff = PooledDiff::new(WordTokenizer::default(), base_opts);
        diff.diff(old, new_)
    };
    swb::to_value(&changes).map_err(|e| JsValue::from(e.to_string()))
}

#[wasm_bindgen(js_name = diffWordsWithSpace)]
pub fn diff_words_with_space(old: &str, new_: &str, opts: JsValue) -> Result<JsValue, JsValue> {
    let wo: WordOptions = swb::from_value(opts).unwrap_or_default();
    let base_opts: Options = wo.into();

    let equal = if base_opts.ignore_case {
        old.eq_ignore_ascii_case(new_)
    } else {
        old == new_
    };
    if equal {
        if new_.is_empty() {
            let empty: Vec<Change> = Vec::new();
            return swb::to_value(&empty).map_err(Into::into);
        }
        let cnt = count_tokens(&WordWithSpaceTokenizer::default(), new_);
        let changes = vec![Change {
            value: new_.to_string(),
            count: cnt,
            added: false,
            removed: false,
        }];
        return swb::to_value(&changes).map_err(Into::into);
    }

    use super::memory_pool::PooledDiff;
    let mut diff = PooledDiff::new(WordWithSpaceTokenizer::default(), base_opts);
    let changes = diff.diff(old, new_);
    swb::to_value(&changes).map_err(|e| JsValue::from(e.to_string()))
}

#[wasm_bindgen(js_name = wordDiff)]
pub struct WordDiff;

#[wasm_bindgen(js_class = wordDiff)]
impl WordDiff {
    #[wasm_bindgen(js_name = tokenize)]
    pub fn tokenize_js(text: &str) -> Result<JsValue, JsValue> {
        let tok = WordTokenizer::default();
        let mut arena = Vec::new();
        let toks = tok.tokenize(text, &mut arena);
        let vec: Vec<&str> = toks.iter().map(|t| t.text).collect();
        swb::to_value(&vec).map_err(|e| JsValue::from(e.to_string()))
    }
}
