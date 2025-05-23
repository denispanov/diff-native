use serde::Deserialize;
use serde_wasm_bindgen as swb;
use wasm_bindgen::{prelude::*, JsValue};

use super::{
    base::{Change, Options, Tokeniser},
    token::Token,
};

#[derive(Default)]
pub struct SentenceTokenizer;

impl<'a> Tokeniser<'a> for SentenceTokenizer {
    fn tokenize<'b>(&self, text: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>] {
        arena.clear();
        let start_idx = arena.len();

        if text.is_empty() {
            return &arena[start_idx..];
        }

        let mut current_pos = 0;

        while current_pos < text.len() {
            let mut iter = text[current_pos..].char_indices().peekable();
            let mut found_boundary = false;

            while let Some((rel_idx, ch)) = iter.next() {
                let abs_idx = current_pos + rel_idx;

                if matches!(ch, '.' | '!' | '?') {
                    let is_boundary = match iter.peek() {
                        None => true,
                        Some(&(_, next_ch)) if next_ch.is_whitespace() => true,
                        _ => false,
                    };

                    if is_boundary {
                        found_boundary = true;
                        let boundary_end = abs_idx + ch.len_utf8();

                        arena.push(Token {
                            text: &text[current_pos..boundary_end],
                        });

                        let ws_start = boundary_end;
                        let mut ws_end = boundary_end;

                        while let Some(&(ws_rel_idx, ws_ch)) = iter.peek() {
                            if !ws_ch.is_whitespace() {
                                break;
                            }
                            iter.next();
                            ws_end = current_pos + ws_rel_idx + ws_ch.len_utf8();
                        }

                        if ws_start < ws_end {
                            arena.push(Token {
                                text: &text[ws_start..ws_end],
                            });

                            if ws_end == text.len() {
                                arena.push(Token { text: "" });
                            }
                        }

                        current_pos = ws_end;
                        break;
                    }
                }
            }

            if !found_boundary {
                arena.push(Token {
                    text: &text[current_pos..],
                });
                break;
            }
        }

        &arena[start_idx..]
    }

    fn join(&self, toks: &[Token<'a>]) -> String {
        toks.iter().map(|t| t.text).collect()
    }
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SentenceOptions {
    #[serde(default)]
    ignore_case: bool,
    #[serde(default)]
    one_change_per_token: bool,
    #[serde(default)]
    max_edit_length: Option<usize>,
}

impl From<SentenceOptions> for Options {
    fn from(o: SentenceOptions) -> Self {
        Options {
            ignore_case: o.ignore_case,
            one_change_per_token: o.one_change_per_token,
            max_edit_length: o.max_edit_length,
        }
    }
}

#[wasm_bindgen(js_name = diffSentences)]
pub fn diff_sentences(old_str: &str, new_str: &str, opts: JsValue) -> Result<JsValue, JsValue> {
    if opts.is_undefined() && old_str == new_str {
        let empty: Vec<Change> = Vec::new();
        return swb::to_value(&empty).map_err(Into::into);
    }

    let s_opts: SentenceOptions = swb::from_value(opts).unwrap_or_default();
    let options: Options = s_opts.into();

    use super::memory_pool::PooledDiff;
    let mut diff = PooledDiff::new(SentenceTokenizer::default(), options);
    let changes = diff.diff(old_str, new_str);

    swb::to_value(&changes).map_err(|e| JsValue::from(e.to_string()))
}

#[wasm_bindgen(js_name = sentenceDiff)]
pub struct SentenceDiff;

#[wasm_bindgen(js_class = sentenceDiff)]
impl SentenceDiff {
    #[wasm_bindgen(js_name = tokenize)]
    pub fn tokenize_js(text: &str) -> Result<JsValue, JsValue> {
        let tok = SentenceTokenizer::default();
        let mut arena = Vec::new();
        let toks = tok.tokenize(text, &mut arena);
        let vec: Vec<&str> = toks.iter().map(|t| t.text).collect();
        swb::to_value(&vec).map_err(|e| JsValue::from(e.to_string()))
    }
}
