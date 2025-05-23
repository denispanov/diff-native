use js_sys::JSON;
use serde::Deserialize;
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;

use super::{
    base::{Options, Tokeniser},
    token::Token,
};

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct JsonOptions {
    undefined_replacement: Option<serde_json::Value>,
}

#[derive(Default, Clone)]
pub struct JsonTokenizer;

impl<'a> Tokeniser<'a> for JsonTokenizer {
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

    fn equals(&self, l: &Token<'a>, r: &Token<'a>, _o: &Options) -> bool {
        fn strip(line: &str) -> std::borrow::Cow<'_, str> {
            if let Some(rest) = line.strip_suffix(",\n") {
                let mut s = rest.to_owned();
                s.push('\n');
                s.into()
            } else if let Some(rest) = line.strip_suffix(",\r") {
                let mut s = rest.to_owned();
                s.push('\r');
                s.into()
            } else {
                line.into()
            }
        }
        strip(l.text) == strip(r.text)
    }
}

pub fn canonicalize_value(v: &serde_json::Value) -> serde_json::Value {
    match v {
        serde_json::Value::Object(map) => {
            let mut keys: Vec<_> = map.keys().collect();
            keys.sort();
            let mut out = serde_json::Map::new();
            for k in keys {
                out.insert(k.clone(), canonicalize_value(&map[k]));
            }
            serde_json::Value::Object(out)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(canonicalize_value).collect())
        }
        _ => v.clone(),
    }
}

#[wasm_bindgen(js_name = canonicalize)]
pub fn canonicalize(js_val: JsValue) -> Result<JsValue, JsValue> {
    let val: serde_json::Value = swb::from_value(js_val)?;
    let canon = canonicalize_value(&val);
    let as_string = serde_json::to_string(&canon).unwrap();
    JSON::parse(&as_string).map_err(Into::into)
}

fn to_pretty_json(val: &JsValue, opts: &JsonOptions) -> Result<String, JsValue> {
    if val.is_string() {
        return Ok(val.as_string().unwrap());
    }

    let mut ser: serde_json::Value = swb::from_value(val.clone())?;
    if let Some(repl) = &opts.undefined_replacement {
        fn patch(v: &mut serde_json::Value, rep: &serde_json::Value) {
            match v {
                serde_json::Value::Null => *v = rep.clone(),
                serde_json::Value::Array(a) => a.iter_mut().for_each(|x| patch(x, rep)),
                serde_json::Value::Object(m) => m.values_mut().for_each(|x| patch(x, rep)),
                _ => {}
            }
        }
        patch(&mut ser, repl);
    }

    let canon = canonicalize_value(&ser);
    Ok(serde_json::to_string_pretty(&canon).unwrap())
}

#[wasm_bindgen(js_name = diffJson)]
pub fn diff_json(old_val: JsValue, new_val: JsValue, opts: JsValue) -> Result<JsValue, JsValue> {
    let jo: JsonOptions = swb::from_value(opts).unwrap_or_default();
    let rust_opts = Options::default();

    let old_s = to_pretty_json(&old_val, &jo)?;
    let new_s = to_pretty_json(&new_val, &jo)?;

    use super::memory_pool::PooledDiff;
    let mut diff = PooledDiff::new(JsonTokenizer, rust_opts).with_longest_token();
    let changes = diff.diff(&old_s, &new_s);

    swb::to_value(&changes).map_err(Into::into)
}
