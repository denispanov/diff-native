use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;

use super::{
    base::{Options, Tokeniser},
    token::Token,
};
use crate::options::DiffOptions;

#[derive(Default)]
pub struct CssTokenizer;

impl<'a> Tokeniser<'a> for CssTokenizer {
    fn tokenize<'b>(&self, input: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>] {
        arena.clear();
        let start_idx = arena.len();

        if input.is_empty() {
            return &arena[start_idx..];
        }

        let bytes = input.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            let ch = input[i..].chars().next().unwrap();
            let len = ch.len_utf8();

            if ch.is_whitespace() {
                let run_start = i;
                i += len;
                while i < bytes.len() && input[i..].chars().next().unwrap().is_whitespace() {
                    i += input[i..].chars().next().unwrap().len_utf8();
                }
                arena.push(Token {
                    text: &input[run_start..i],
                });
                continue;
            }

            if matches!(ch, '{' | '}' | ':' | ';' | ',') {
                arena.push(Token {
                    text: &input[i..i + len],
                });
                i += len;
                continue;
            }

            let run_start = i;
            i += len;
            while i < bytes.len() {
                let c2 = input[i..].chars().next().unwrap();
                if c2.is_whitespace() || matches!(c2, '{' | '}' | ':' | ';' | ',') {
                    break;
                }
                i += c2.len_utf8();
            }
            arena.push(Token {
                text: &input[run_start..i],
            });
        }

        &arena[start_idx..]
    }

    fn join(&self, toks: &[Token<'a>]) -> String {
        toks.iter().map(|t| t.text).collect()
    }
}

#[wasm_bindgen(js_name = diffCss)]
pub fn diff_css(old_str: &str, new_str: &str, opts: JsValue) -> Result<JsValue, JsValue> {
    let o: DiffOptions = swb::from_value(opts).unwrap_or_default();
    let base_opts = Options {
        ignore_case: o.ignore_case.unwrap_or(false),
        one_change_per_token: o.one_change_per_token.unwrap_or(false),
        max_edit_length: o.max_edit_length,
    };

    if !base_opts.ignore_case && !base_opts.one_change_per_token && old_str == new_str {
        let empty: Vec<super::base::Change> = Vec::new();
        return swb::to_value(&empty).map_err(Into::into);
    }

    use super::memory_pool::PooledDiff;
    let mut diff = PooledDiff::new(CssTokenizer, base_opts);
    let changes = diff.diff(old_str, new_str);
    swb::to_value(&changes).map_err(Into::into)
}
