use serde::Deserialize;
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;

use super::{
    base::{Options, Tokeniser},
    token::Token,
};

#[derive(Default, Clone)]
pub struct JsonTokenizer<const ENCODED_UTF16: bool = false>;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsonOptions {
    #[serde(default)]
    ignore_case: bool,
    #[serde(default)]
    one_change_per_token: bool,
    #[serde(default)]
    encoded_utf16: bool,
}

impl<'a, const ENCODED_UTF16: bool> Tokeniser<'a> for JsonTokenizer<ENCODED_UTF16> {
    fn tokenize<'b>(&self, input: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>] {
        arena.clear();

        if input.is_empty() {
            return &arena[..];
        }

        let mut start = 0usize;
        for (idx, byte) in input.bytes().enumerate() {
            if byte == b'\n' {
                arena.push(Token {
                    text: &input[start..=idx],
                });
                start = idx + 1;
            }
        }
        if start < input.len() {
            arena.push(Token {
                text: &input[start..],
            });
        }
        &arena[..]
    }

    fn join(&self, toks: &[Token<'a>]) -> String {
        toks.iter().map(|t| t.text).collect()
    }

    fn token_len(&self, tok: &Token<'a>, _options: &Options) -> usize {
        if ENCODED_UTF16 {
            tok.text.chars().count()
        } else {
            tok.text.encode_utf16().count()
        }
    }

    fn equals(&self, l: &Token<'a>, r: &Token<'a>, options: &Options) -> bool {
        fn strip(line: &str) -> std::borrow::Cow<'_, str> {
            if !line
                .as_bytes()
                .windows(2)
                .any(|pair| pair[0] == b',' && matches!(pair[1], b'\r' | b'\n'))
            {
                return line.into();
            }

            let mut stripped = String::with_capacity(line.len());
            let mut chars = line.chars().peekable();
            while let Some(ch) = chars.next() {
                if ch == ',' && matches!(chars.peek(), Some('\r' | '\n')) {
                    continue;
                }
                stripped.push(ch);
            }
            stripped.into()
        }
        let left = strip(l.text);
        let right = strip(r.text);
        if left == right {
            return true;
        }
        if !options.ignore_case {
            return false;
        }

        let lower = |value: &str| {
            if ENCODED_UTF16 {
                let units: Vec<u16> = value
                    .chars()
                    .map(|ch| {
                        let point = ch as u32;
                        (if point < 0xe000 { point } else { point - 0x800 }) as u16
                    })
                    .collect();
                let mut decoded = js_sys::JsString::from("");
                for chunk in units.chunks(8192) {
                    decoded = decoded.concat(&js_sys::JsString::from_char_code(chunk));
                }
                decoded.to_lower_case()
            } else {
                js_sys::JsString::from(value).to_lower_case()
            }
        };
        lower(left.as_ref()) == lower(right.as_ref())
    }
}

fn run_diff<const ENCODED_UTF16: bool>(
    old_val: &str,
    new_val: &str,
    options: Options,
) -> Result<JsValue, JsValue> {
    use super::memory_pool::PooledDiff;
    let mut diff = PooledDiff::new(JsonTokenizer::<ENCODED_UTF16>, options).with_longest_token();
    let changes = diff.diff(old_val, new_val);
    swb::to_value(&changes).map_err(Into::into)
}

#[wasm_bindgen(js_name = diffJson)]
pub fn diff_json(old_val: String, new_val: String, opts: JsValue) -> Result<JsValue, JsValue> {
    let json_opts: JsonOptions = swb::from_value(opts).unwrap_or_default();
    let rust_opts = Options {
        ignore_case: json_opts.ignore_case,
        one_change_per_token: json_opts.one_change_per_token,
        max_edit_length: None,
    };

    if json_opts.encoded_utf16 {
        run_diff::<true>(&old_val, &new_val, rust_opts)
    } else {
        run_diff::<false>(&old_val, &new_val, rust_opts)
    }
}
