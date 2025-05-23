use crate::change::Change;
use wasm_bindgen::prelude::*;

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[wasm_bindgen(js_name = convertChangesToXML)]
pub fn convert_changes_to_xml(changes_js: JsValue) -> Result<String, JsValue> {
    let changes: Vec<Change> = serde_wasm_bindgen::from_value(changes_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize changes: {}", e)))?;

    let mut ret = String::new();
    for change in changes {
        if change.added {
            ret.push_str("<ins>");
        } else if change.removed {
            ret.push_str("<del>");
        }

        ret.push_str(&escape_html(&change.value));

        if change.added {
            ret.push_str("</ins>");
        } else if change.removed {
            ret.push_str("</del>");
        }
    }
    Ok(ret)
}
