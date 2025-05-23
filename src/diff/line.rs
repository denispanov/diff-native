use serde::{Deserialize, Serialize};
use serde_wasm_bindgen as swb;
use wasm_bindgen::{prelude::*, JsValue};

use super::{
    base::{Options, Tokeniser},
    token::Token,
};

#[derive(Deserialize, Serialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LineOptions {
    #[serde(default)]
    strip_trailing_cr: bool,
    #[serde(default)]
    newline_is_token: bool,
    #[serde(default)]
    ignore_whitespace: bool,
    #[serde(default)]
    ignore_newline_at_eof: bool,

    #[serde(default)]
    ignore_case: bool,
    #[serde(default)]
    one_change_per_token: bool,
    #[serde(default)]
    max_edit_length: Option<usize>,
}

impl From<&LineOptions> for Options {
    fn from(lo: &LineOptions) -> Self {
        Options {
            ignore_case: lo.ignore_case,
            one_change_per_token: lo.one_change_per_token,
            max_edit_length: lo.max_edit_length,
        }
    }
}

#[derive(Clone)]
pub struct LineTokenizer {
    newline_is_token: bool,
    ignore_whitespace: bool,
    ignore_newline_at_eof: bool,
}

impl LineTokenizer {
    pub fn new(lo: &LineOptions) -> Self {
        Self {
            newline_is_token: lo.newline_is_token,
            ignore_whitespace: lo.ignore_whitespace,
            ignore_newline_at_eof: lo.ignore_newline_at_eof,
        }
    }

    pub fn with_options(
        newline_is_token: bool,
        ignore_whitespace: bool,
        ignore_newline_at_eof: bool,
    ) -> Self {
        Self {
            newline_is_token,
            ignore_newline_at_eof,
            ignore_whitespace,
        }
    }
}

impl<'a> Tokeniser<'a> for LineTokenizer {
    fn cast_input(&self, input: &'a str, _opts: &Options) -> &'a str {
        // strip_trailing_cr preprocessing is handled at the diff_lines level
        // to avoid lifetime issues with owned strings
        input
    }

    fn tokenize<'b>(&self, input: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>] {
        arena.clear();

        if input.is_empty() {
            return &arena[..];
        }

        let bytes = input.as_bytes();
        let len = bytes.len();
        let mut start = 0usize;
        let mut i = 0usize;

        while i < len {
            if bytes[i] == b'\n' {
                let had_cr = i > start && bytes[i - 1] == b'\r';

                if self.newline_is_token {
                    let content_end = if had_cr { i - 1 } else { i };
                    arena.push(Token {
                        text: &input[start..content_end],
                    });

                    let nl_start = if had_cr { i - 1 } else { i };
                    arena.push(Token {
                        text: &input[nl_start..=i],
                    });
                } else {
                    arena.push(Token {
                        text: &input[start..=i],
                    });
                }

                i += 1;
                start = i;
            } else {
                i += 1;
            }
        }
        if start < len {
            arena.push(Token {
                text: &input[start..],
            });
        }

        &arena[..]
    }

    #[inline]
    fn join(&self, toks: &[Token<'a>]) -> String {
        toks.iter().map(|t| t.text).collect()
    }

    #[inline]
    fn equals(&self, l: &Token<'a>, r: &Token<'a>, opts: &Options) -> bool {
        let mut left = l.text;
        let mut right = r.text;

        if self.ignore_whitespace {
            if !(self.newline_is_token && left.contains('\n')) {
                left = left.trim();
            }
            if !(self.newline_is_token && right.contains('\n')) {
                right = right.trim();
            }
        } else if self.ignore_newline_at_eof && !self.newline_is_token {
            if left.ends_with('\n') {
                left = &left[..left.len() - 1];
            }
            if right.ends_with('\n') {
                right = &right[..right.len() - 1];
            }
        }

        if opts.ignore_case {
            left.eq_ignore_ascii_case(right)
        } else {
            left == right
        }
    }
}

#[wasm_bindgen(js_name = diffLines)]
pub fn diff_lines(old_str: &str, new_str: &str, js_opts: JsValue) -> Result<JsValue, JsValue> {
    if js_opts.is_undefined() && old_str == new_str {
        let empty: Vec<super::base::Change> = Vec::new();
        return swb::to_value(&empty).map_err(Into::into);
    }

    let lo: LineOptions = swb::from_value(js_opts).unwrap_or_default();

    if lo.strip_trailing_cr {
        let old_processed = old_str.replace("\r\n", "\n");
        let new_processed = new_str.replace("\r\n", "\n");

        let tokenizer = LineTokenizer::new(&lo);
        let options: Options = (&lo).into();

        use super::memory_pool::PooledDiff;
        let mut diff = PooledDiff::new(tokenizer, options);
        let changes = diff.diff(&old_processed, &new_processed);
        return swb::to_value(&changes).map_err(|e| JsValue::from(e.to_string()));
    }

    let tokenizer = LineTokenizer::new(&lo);
    let options: Options = (&lo).into();

    use super::memory_pool::PooledDiff;
    let mut diff = PooledDiff::new(tokenizer, options);
    let changes = diff.diff(old_str, new_str);
    swb::to_value(&changes).map_err(|e| JsValue::from(e.to_string()))
}

#[wasm_bindgen(js_name = diffTrimmedLines)]
pub fn diff_trimmed_lines(
    old_str: &str,
    new_str: &str,
    callback_or_opts: JsValue,
) -> Result<JsValue, JsValue> {
    let mut lo: LineOptions = swb::from_value(callback_or_opts).unwrap_or_default();
    lo.ignore_whitespace = true;
    diff_lines(old_str, new_str, swb::to_value(&lo)?)
}

#[wasm_bindgen(js_name = lineDiff)]
pub struct LineDiff;

#[wasm_bindgen(js_class = lineDiff)]
impl LineDiff {
    #[wasm_bindgen(js_name = tokenize)]
    pub fn tokenize_js(value: &str, opts: JsValue) -> Result<JsValue, JsValue> {
        let lo: LineOptions = swb::from_value(opts).unwrap_or_default();

        let preprocessed;
        let input = if lo.strip_trailing_cr {
            preprocessed = value.replace("\r\n", "\n");
            &preprocessed
        } else {
            value
        };

        let tokenizer = LineTokenizer::new(&lo);

        let mut arena = Vec::new();
        let tokens = tokenizer.tokenize(input, &mut arena);

        // Convert tokens to Vec<String> to match expected behavior
        let result: Vec<String> = tokens.iter().map(|t| t.text.to_string()).collect();
        swb::to_value(&result).map_err(|e| JsValue::from(e.to_string()))
    }
}
