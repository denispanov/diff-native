use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Hunk {
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub lines: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    pub index: Option<String>,
    #[serde(rename = "oldFileName")]
    pub old_file_name: String,
    #[serde(rename = "newFileName")]
    pub new_file_name: String,
    #[serde(rename = "oldHeader")]
    pub old_header: String,
    #[serde(rename = "newHeader")]
    pub new_header: String,
    pub hunks: Vec<Hunk>,
}
