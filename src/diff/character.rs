use wasm_bindgen::prelude::*;

use crate::diff::{
    base::{Options as BaseOptions, Tokeniser},
    memory_pool::PooledDiff,
    token::Token,
};
use crate::options::DiffOptions;

#[derive(Clone, Copy)]
pub struct CharTokenizer;

impl<'a> Tokeniser<'a> for CharTokenizer {
    fn tokenize<'b>(&self, input: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>] {
        arena.clear();
        let start = arena.len();

        if input.is_empty() {
            return &arena[start..];
        }

        let mut prev = 0;
        for (i, _) in input.char_indices().skip(1) {
            arena.push(Token {
                text: &input[prev..i],
            });
            prev = i;
        }
        arena.push(Token {
            text: &input[prev..],
        });

        &arena[start..]
    }

    fn join(&self, toks: &[Token<'a>]) -> String {
        let mut out = String::with_capacity(toks.iter().map(|t| t.text.len()).sum());
        for t in toks {
            out.push_str(t.text);
        }
        out
    }
}

#[wasm_bindgen(js_name = diffChars)]
pub fn diff_chars(old_str: &str, new_str: &str, options: JsValue) -> JsValue {
    let opts: DiffOptions = serde_wasm_bindgen::from_value(options).unwrap_or_default();
    let base_opts = BaseOptions {
        ignore_case: opts.ignore_case.unwrap_or(false),
        one_change_per_token: opts.one_change_per_token.unwrap_or(false),
        max_edit_length: None,
    };

    let mut diff = PooledDiff::new(CharTokenizer, base_opts);
    let result = diff.diff(old_str, new_str);
    serde_wasm_bindgen::to_value(&result).unwrap()
}
