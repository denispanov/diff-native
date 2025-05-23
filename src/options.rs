use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Default, Debug)]
pub struct DiffOptions {
    #[serde(alias = "ignoreCase")]
    pub ignore_case: Option<bool>,
    #[serde(alias = "oneChangePerToken")]
    pub one_change_per_token: Option<bool>,
    #[serde(alias = "maxEditLength")]
    pub max_edit_length: Option<usize>,
}

#[derive(Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffLinesOptions {
    #[serde(default)]
    pub ignore_whitespace: bool,
    #[serde(default)]
    pub newline_is_token: bool,
    #[serde(default)]
    pub strip_trailing_cr: bool,
    #[serde(default)]
    pub one_change_per_token: bool,
    #[serde(default)]
    pub ignore_case: bool,
}

#[derive(Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffWordsOptions {
    #[serde(default)]
    pub ignore_case: bool,
    #[serde(default)]
    pub one_change_per_token: bool,
}

#[derive(Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffSentencesOptions {
    #[serde(default)]
    pub one_change_per_token: bool,
}
