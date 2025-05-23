pub mod apply;
pub mod create;
pub mod line_endings;
pub mod parse;
pub mod reverse;
pub mod types;

#[cfg(test)]
mod line_endings_test;
#[cfg(test)]
mod parse_test;
#[cfg(test)]
mod reverse_test;

pub use apply::{apply_patch, apply_patches, ApplyOptions};
pub use create::{
    create_patch, create_two_files_patch, format_patch, structured_patch, StructuredOptions,
};
pub use reverse::reverse_patch;
