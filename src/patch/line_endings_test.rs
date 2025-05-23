use super::line_endings::{
    is_unix_internal, is_win_internal, unix_to_win_internal, win_to_unix_internal,
};
use super::types::Patch;
use serde_json;
fn parse_patch_from_str(patch_str: &str) -> Patch {
    serde_json::from_str(patch_str).unwrap()
}

fn parse_patches_from_str(patches_str: &str) -> Vec<Patch> {
    serde_json::from_str(patches_str).unwrap()
}

#[test]
fn test_unix_only_patch() {
    let patch_str = r#"{
  "oldFileName": "file.txt",
  "newFileName": "file.txt",
  "oldHeader": "old",
  "newHeader": "new",
  "hunks": [
    {
      "old_start": 1,
      "old_lines": 3,
      "new_start": 1,
      "new_lines": 3,
      "lines": [
        "-line1\n",
        "+line1-modified\n",
        " common\n",
        " trailing"
      ]
    }
  ]
}"#;

    let patch = parse_patch_from_str(patch_str);
    assert_eq!(is_unix_internal(&patch), true);
    assert_eq!(is_win_internal(&patch), false);
    let win_patch = unix_to_win_internal(&patch);
    assert_eq!(
        win_patch.hunks[0].lines,
        vec![
            "-line1\n\r",
            "+line1-modified\n\r",
            " common\n\r",
            " trailing\r"
        ]
    );
    let unix_patch = win_to_unix_internal(&patch);
    assert_eq!(
        unix_patch.hunks[0].lines,
        vec!["-line1\n", "+line1-modified\n", " common\n", " trailing"]
    );
}

#[test]
fn test_windows_only_patch() {
    let patch_str = r#"{
  "oldFileName": "file.txt",
  "newFileName": "file.txt",
  "oldHeader": "old",
  "newHeader": "new",
  "hunks": [
    {
      "old_start": 1,
      "old_lines": 3,
      "new_start": 1,
      "new_lines": 3,
      "lines": [
        "-line1\r",
        "+line1-modified\r",
        " common\r",
        " trailing\r"
      ]
    }
  ]
}"#;

    let patch = parse_patch_from_str(patch_str);
    assert_eq!(is_unix_internal(&patch), false);
    assert_eq!(is_win_internal(&patch), true);
    let win_patch = unix_to_win_internal(&patch);
    assert_eq!(
        win_patch.hunks[0].lines,
        vec!["-line1\r", "+line1-modified\r", " common\r", " trailing\r"]
    );
    let unix_patch = win_to_unix_internal(&patch);
    assert_eq!(
        unix_patch.hunks[0].lines,
        vec!["-line1", "+line1-modified", " common", " trailing"]
    );
}

#[test]
fn test_mixed_line_endings_patch() {
    let patch_str = r#"{
  "oldFileName": "file.txt",
  "newFileName": "file.txt",
  "oldHeader": "old",
  "newHeader": "new",
  "hunks": [
    {
      "old_start": 1,
      "old_lines": 4,
      "new_start": 1,
      "new_lines": 4,
      "lines": [
        "-line1\n",
        "+line1-modified\r",
        " common\n",
        " trailing\r"
      ]
    }
  ]
}"#;

    let patch = parse_patch_from_str(patch_str);
    assert_eq!(is_unix_internal(&patch), false);
    assert_eq!(is_win_internal(&patch), false);
    let win_patch = unix_to_win_internal(&patch);
    assert_eq!(
        win_patch.hunks[0].lines,
        vec![
            "-line1\n\r",
            "+line1-modified\r",
            " common\n\r",
            " trailing\r"
        ]
    );
    let unix_patch = win_to_unix_internal(&patch);
    assert_eq!(
        unix_patch.hunks[0].lines,
        vec!["-line1\n", "+line1-modified", " common\n", " trailing"]
    );
}

#[test]
fn test_patch_with_no_newline_markers() {
    let patch_str = r#"{
  "oldFileName": "file.txt",
  "newFileName": "file.txt",
  "oldHeader": "old",
  "newHeader": "new",
  "hunks": [
    {
      "old_start": 1,
      "old_lines": 3,
      "new_start": 1,
      "new_lines": 3,
      "lines": [
        "-line1",
        "+line1-modified",
        " common",
        "\\ No newline at end of file"
      ]
    }
  ]
}"#;

    let patch = parse_patch_from_str(patch_str);
    assert_eq!(is_unix_internal(&patch), true);
    assert_eq!(is_win_internal(&patch), false);
    let win_patch = unix_to_win_internal(&patch);
    assert_eq!(
        win_patch.hunks[0].lines,
        vec![
            "-line1\r",
            "+line1-modified\r",
            " common",
            "\\ No newline at end of file"
        ]
    );
    let unix_patch = win_to_unix_internal(&patch);
    assert_eq!(
        unix_patch.hunks[0].lines,
        vec![
            "-line1",
            "+line1-modified",
            " common",
            "\\ No newline at end of file"
        ]
    );
}

#[test]
fn test_empty_patch() {
    let patch_str = r#"{
  "oldFileName": "file.txt",
  "newFileName": "file.txt",
  "oldHeader": "old",
  "newHeader": "new",
  "hunks": []
}"#;

    let patch = parse_patch_from_str(patch_str);
    assert_eq!(is_unix_internal(&patch), true);
    assert_eq!(is_win_internal(&patch), false);
    let win_patch = unix_to_win_internal(&patch);
    let unix_patch = win_to_unix_internal(&patch);

    assert_eq!(win_patch.hunks.len(), 0);
    assert_eq!(unix_patch.hunks.len(), 0);
}

#[test]
fn test_multiple_hunks_patch() {
    let patch_str = r#"{
  "oldFileName": "file.txt",
  "newFileName": "file.txt",
  "oldHeader": "old",
  "newHeader": "new",
  "hunks": [
    {
      "old_start": 1,
      "old_lines": 2,
      "new_start": 1,
      "new_lines": 2,
      "lines": [
        "-line1\n",
        "+line1-modified\n"
      ]
    },
    {
      "old_start": 10,
      "old_lines": 2,
      "new_start": 10,
      "new_lines": 2,
      "lines": [
        "-line10\r",
        "+line10-modified\r"
      ]
    }
  ]
}"#;

    let patch = parse_patch_from_str(patch_str);
    assert_eq!(is_unix_internal(&patch), false);
    assert_eq!(is_win_internal(&patch), false);
    let win_patch = unix_to_win_internal(&patch);
    assert_eq!(
        win_patch.hunks[0].lines,
        vec!["-line1\n\r", "+line1-modified\n\r"]
    );
    assert_eq!(
        win_patch.hunks[1].lines,
        vec!["-line10\r", "+line10-modified\r"]
    );
    let unix_patch = win_to_unix_internal(&patch);
    assert_eq!(
        unix_patch.hunks[0].lines,
        vec!["-line1\n", "+line1-modified\n"]
    );
    assert_eq!(
        unix_patch.hunks[1].lines,
        vec!["-line10", "+line10-modified"]
    );
}

#[test]
fn test_array_of_patches() {
    let unix_patches_str = r#"[
  {
    "oldFileName": "file.txt",
    "newFileName": "file.txt",
    "oldHeader": "old",
    "newHeader": "new",
    "hunks": [
      {
        "old_start": 1,
        "old_lines": 3,
        "new_start": 1,
        "new_lines": 3,
        "lines": [
          "-line1\n",
          "+line1-modified\n",
          " common\n",
          " trailing"
        ]
      }
    ]
  },
  {
    "oldFileName": "file.txt",
    "newFileName": "file.txt",
    "oldHeader": "old",
    "newHeader": "new",
    "hunks": [
      {
        "old_start": 1,
        "old_lines": 3,
        "new_start": 1,
        "new_lines": 3,
        "lines": [
          "-line1\n",
          "+line1-modified\n",
          " common\n",
          " trailing"
        ]
      }
    ]
  }
]"#;

    let unix_patches = parse_patches_from_str(unix_patches_str);
    assert!(unix_patches.iter().all(is_unix_internal));
    assert!(!unix_patches.iter().any(is_win_internal));
    let win_patches_str = r#"[
  {
    "oldFileName": "file.txt",
    "newFileName": "file.txt",
    "oldHeader": "old",
    "newHeader": "new",
    "hunks": [
      {
        "old_start": 1,
        "old_lines": 3,
        "new_start": 1,
        "new_lines": 3,
        "lines": [
          "-line1\r",
          "+line1-modified\r",
          " common\r",
          " trailing\r"
        ]
      }
    ]
  },
  {
    "oldFileName": "file.txt",
    "newFileName": "file.txt",
    "oldHeader": "old",
    "newHeader": "new",
    "hunks": [
      {
        "old_start": 1,
        "old_lines": 3,
        "new_start": 1,
        "new_lines": 3,
        "lines": [
          "-line1\r",
          "+line1-modified\r",
          " common\r",
          " trailing\r"
        ]
      }
    ]
  }
]"#;

    let win_patches = parse_patches_from_str(win_patches_str);
    assert!(!win_patches.iter().all(is_unix_internal));
    assert!(win_patches.iter().all(is_win_internal));
    assert!(win_patches.iter().any(|p| p
        .hunks
        .iter()
        .any(|h| h.lines.iter().any(|l| l.ends_with('\r')))));
    let mixed_patches_str = r#"[
  {
    "oldFileName": "file.txt",
    "newFileName": "file.txt",
    "oldHeader": "old",
    "newHeader": "new",
    "hunks": [
      {
        "old_start": 1,
        "old_lines": 3,
        "new_start": 1,
        "new_lines": 3,
        "lines": [
          "-line1\n",
          "+line1-modified\n",
          " common\n",
          " trailing"
        ]
      }
    ]
  },
  {
    "oldFileName": "file.txt",
    "newFileName": "file.txt",
    "oldHeader": "old",
    "newHeader": "new",
    "hunks": [
      {
        "old_start": 1,
        "old_lines": 3,
        "new_start": 1,
        "new_lines": 3,
        "lines": [
          "-line1\r",
          "+line1-modified\r",
          " common\r",
          " trailing\r"
        ]
      }
    ]
  }
]"#;

    let mixed_patches = parse_patches_from_str(mixed_patches_str);
    assert!(!mixed_patches.iter().all(is_unix_internal));
    assert!(!mixed_patches.iter().all(is_win_internal));
    let converted_to_win: Vec<Patch> = mixed_patches.iter().map(unix_to_win_internal).collect();
    let converted_to_unix: Vec<Patch> = mixed_patches.iter().map(win_to_unix_internal).collect();
    assert_eq!(
        converted_to_win[0].hunks[0].lines,
        vec![
            "-line1\n\r",
            "+line1-modified\n\r",
            " common\n\r",
            " trailing\r"
        ]
    );
    assert_eq!(
        converted_to_win[1].hunks[0].lines,
        vec!["-line1\r", "+line1-modified\r", " common\r", " trailing\r"]
    );
    assert_eq!(
        converted_to_unix[0].hunks[0].lines,
        vec!["-line1\n", "+line1-modified\n", " common\n", " trailing"]
    );
    assert_eq!(
        converted_to_unix[1].hunks[0].lines,
        vec!["-line1", "+line1-modified", " common", " trailing"]
    );
}
