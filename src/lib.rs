use wasm_bindgen::prelude::*;

mod change;
pub mod diff;
mod options;
pub mod patch;
pub mod util;
pub mod convert {
    pub mod xml;
}

pub use change::Change;
pub use options::{DiffLinesOptions, DiffOptions, DiffSentencesOptions, DiffWordsOptions};
pub use patch::apply::ApplyOptions;
pub use patch::types::{Hunk, Patch};

pub use diff::character::diff_chars;
pub use diff::css::diff_css;
pub use diff::json::{canonicalize, diff_json};
pub use diff::line::{diff_lines, diff_trimmed_lines};
pub use diff::sentences::diff_sentences;
pub use diff::word::{diff_words, diff_words_with_space};

pub use diff::{clear_pools, get_pool_stats, CharTokenizer, Component, ComponentPool, PooledDiff};

pub use convert::xml::convert_changes_to_xml;

pub use patch::{
    apply_patch, apply_patches, create_patch, create_two_files_patch, format_patch,
    line_endings::{is_unix, is_win, unix_to_win, win_to_unix},
    parse::parse_patch,
    reverse_patch, structured_patch,
};

pub use patch::parse::parse_patch_internal;

#[wasm_bindgen]
pub fn set_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
