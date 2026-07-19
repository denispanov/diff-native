use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "/src/patch-boundary.js")]
extern "C" {
    #[wasm_bindgen(js_name = hunksLengthBoundary, catch)]
    fn hunks_length_boundary(hunks: &JsValue) -> Result<JsValue, JsValue>;
    #[wasm_bindgen(js_name = patchHunksBoundary, catch)]
    fn patch_hunks_boundary(patch: &JsValue) -> Result<JsValue, JsValue>;
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialOrd)]
#[serde(transparent)]
pub struct PatchNumber(pub f64);

impl From<usize> for PatchNumber {
    fn from(value: usize) -> Self {
        Self(value as f64)
    }
}

impl From<f64> for PatchNumber {
    fn from(value: f64) -> Self {
        Self(value)
    }
}

impl PartialEq for PatchNumber {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl PartialEq<i32> for PatchNumber {
    fn eq(&self, other: &i32) -> bool {
        self.0 == *other as f64
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    #[cfg_attr(test, serde(alias = "old_start"))]
    pub old_start: PatchNumber,
    #[cfg_attr(test, serde(alias = "old_lines"))]
    pub old_lines: PatchNumber,
    #[cfg_attr(test, serde(alias = "new_start"))]
    pub new_start: PatchNumber,
    #[cfg_attr(test, serde(alias = "new_lines"))]
    pub new_lines: PatchNumber,
    pub lines: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    pub hunks: Vec<Hunk>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_file_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_header: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_file_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_header: Option<String>,
}

pub(crate) fn patch_from_value(value: JsValue) -> Result<Patch, JsValue> {
    let hunks = patch_hunks_boundary(&value)?;
    let length = hunks_length_boundary(&hunks)?;
    #[allow(deprecated)]
    if !js_sys::Boolean::new(&length).value_of() {
        return Ok(Patch::default());
    }
    let hunks = serde_wasm_bindgen::from_value(hunks)
        .map_err(|error| js_sys::Error::new(&error.to_string()))?;
    Ok(Patch {
        hunks,
        ..Patch::default()
    })
}
