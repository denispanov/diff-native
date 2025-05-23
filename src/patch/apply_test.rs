use crate::patch::apply::{apply_patch_internal, ApplyOptions};
use crate::patch::types::{Hunk, Patch};
use pretty_assertions::assert_eq;
fn create_patch(old_file_name: &str, new_file_name: &str, hunks: Vec<Hunk>) -> Patch {
    Patch {
        index: None,
        old_file_name: old_file_name.to_string(),
        new_file_name: new_file_name.to_string(),
        old_header: String::new(),
        new_header: String::new(),
        hunks,
    }
}

fn create_hunk(
    old_start: usize,
    old_lines: usize,
    new_start: usize,
    new_lines: usize,
    lines: Vec<&str>,
) -> Hunk {
    Hunk {
        old_start,
        old_lines,
        new_start,
        new_lines,
        lines: lines.iter().map(|s| s.to_string()).collect(),
    }
}

#[test]
fn test_basic_patch_application() {
    let source = "line1\nline2\nline3\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(2, 1, 2, 1, vec!["-line2", "+line2-modified"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2-modified\nline3\n");
}

#[test]
fn test_patch_with_context() {
    let source = "line1\nline2\nline3\nline4\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            2,
            2,
            2,
            vec![" line2", "-line3", "+line3-new"],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\nline3-new\nline4\n");
}

#[test]
fn test_empty_source() {
    let source = "";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(1, 0, 1, 2, vec!["+line1", "+line2"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\n");
}

#[test]
fn test_patch_with_fuzz_1() {
    let source = "line1\nline2\nline3\nline4\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            2,
            2,
            2,
            vec![" line2-different", "-line3", "+line3-new"],
        )],
    );
    let options = ApplyOptions {
        fuzz_factor: Some(1),
        ..Default::default()
    };
    let result = apply_patch_internal(source, &patch, &options);
    assert!(result.is_err());
}

#[test]
fn test_multiple_hunks() {
    let source = "line1\nline2\nline3\nline4\nline5\nline6\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![
            create_hunk(2, 1, 2, 1, vec!["-line2", "+line2-new"]),
            create_hunk(5, 1, 5, 1, vec!["-line5", "+line5-new"]),
        ],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2-new\nline3\nline4\nline5-new\nline6\n");
}

#[test]
fn test_eof_add_newline() {
    let source = "line1\nline2\nline3";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            1,
            3,
            1,
            3,
            vec![
                " line1",
                " line2",
                "-line3",
                "\\ No newline at end of file",
                "+line3",
            ],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\nline3\n");
}

#[test]
fn test_eof_remove_newline() {
    let source = "line1\nline2\nline3\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            1,
            3,
            1,
            3,
            vec![
                " line1",
                " line2",
                "-line3",
                "+line3",
                "\\ No newline at end of file",
            ],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\nline3");
}

#[test]
fn test_line_ending_unix_to_win() {
    let source = "line1\r\nline2\r\nline3\r\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            1,
            2,
            1,
            vec!["-line2\n", "+line2-modified\n"],
        )],
    );
    let options = ApplyOptions {
        auto_convert_line_endings: Some(true),
        ..Default::default()
    };
    let result = apply_patch_internal(source, &patch, &options);
    assert!(result.is_err());
}

#[test]
fn test_patch_failure() {
    let source = "line1\nline2\nline3\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            1,
            2,
            1,
            vec!["-completely-different", "+line2-modified"],
        )],
    );
    let options = ApplyOptions {
        fuzz_factor: Some(0),
        ..Default::default()
    };

    let result = apply_patch_internal(source, &patch, &options);
    assert!(result.is_err());
}

#[test]
fn test_apply_to_empty_file_adds_content() {
    let source = "";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(1, 0, 1, 3, vec!["+line1", "+line2", "+line3"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\nline3\n");
}

#[test]
fn test_apply_deletion_to_file() {
    let source = "line1\nline2\nline3\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(1, 3, 1, 0, vec!["-line1", "-line2", "-line3"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "");
}

#[test]
fn test_patch_with_trailing_context() {
    let source = "line1\nline2\nline3\nline4\nline5\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            3,
            2,
            3,
            vec![" line2", "-line3", "+line3-modified", " line4"],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\nline3-modified\nline4\nline5\n");
}

#[test]
fn test_patch_with_leading_context() {
    let source = "line1\nline2\nline3\nline4\nline5\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            3,
            2,
            3,
            vec![" line2", "-line3", "+line3-modified", " line4"],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\nline3-modified\nline4\nline5\n");
}

#[test]
fn test_fuzz_factor_allows_context_mismatch() {
    let source = "line1\nline2-changed\nline3\nline4\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            2,
            2,
            2,
            vec![" line2", "-line3", "+line3-new"],
        )],
    );
    let options = ApplyOptions {
        fuzz_factor: Some(1),
        ..Default::default()
    };
    let result = apply_patch_internal(source, &patch, &options);
    assert!(result.is_err());
}

#[test]
fn test_eof_newline_with_context() {
    let source = "line1\nline2";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            1,
            2,
            1,
            vec!["-line2", "\\ No newline at end of file", "+line2-modified"],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2-modified\n");
}

#[test]
fn test_patch_at_offset() {
    let source = "header\nline1\nline2\nline3\nfooter\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            1,
            2,
            1,
            2,
            vec![" line1", "-line2", "+line2-new"],
        )],
    );
    let options = ApplyOptions {
        fuzz_factor: Some(2),
        ..Default::default()
    };

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "header\nline1\nline2-new\nline3\nfooter\n");
}

#[test]
fn test_empty_patch() {
    let source = "line1\nline2\nline3\n";
    let patch = create_patch("test.txt", "test.txt", vec![]);
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\nline3\n");
}

#[test]
fn test_windows_line_endings_preserved() {
    let source = "line1\r\nline2\r\nline3\r\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            1,
            2,
            1,
            vec!["-line2\r", "+line2-modified\r"],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\r\nline2-modified\r\nline3\r\n");
}

#[test]
fn test_mixed_line_endings() {
    let source = "line1\nline2\r\nline3\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(2, 1, 2, 1, vec!["-line2\r", "+line2-modified"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2-modified\nline3\n");
}

#[test]
fn test_complex_multi_hunk_patch() {
    let source = "start\nline1\nline2\nline3\nmiddle\nline4\nline5\nline6\nend\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![
            create_hunk(
                2,
                2,
                2,
                3,
                vec![" line1", "-line2", "+line2-new", "+line2.5"],
            ),
            create_hunk(6, 2, 7, 1, vec!["-line4", "-line5", "+line4-and-5"]),
        ],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(
        result,
        "start\nline1\nline2-new\nline2.5\nline3\nmiddle\nline4-and-5\nline6\nend\n"
    );
}
#[test]
fn test_empty_hunk_lines() {
    let source = "line1\nline2\n";
    let patch = create_patch("test.txt", "test.txt", vec![]);
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, source);
}

#[test]
fn test_eofnl_marker_detection_edge_cases() {
    let source = "line1\nline2";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            1,
            2,
            1,
            2,
            vec![
                " line1",
                "-line2",
                "\\ No newline at end of file",
                "+line2-new",
                "\\ No newline at end of file",
            ],
        )],
    );
    let options = ApplyOptions::default();
    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2-new");
    let source2 = "line1\nline2\n";
    let patch2 = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            1,
            2,
            1,
            vec!["-line2", "+line2-new", "\\ No newline at end of file"],
        )],
    );
    let result2 = apply_patch_internal(source2, &patch2, &options).unwrap();
    assert_eq!(result2, "line1\nline2-new");
}

#[test]
fn test_context_line_processing_edge_cases() {
    let source = "line1\nline2\nline3\nline4\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            3,
            2,
            4,
            vec![" wrong_context", " line3", " line4", "+inserted"],
        )],
    );
    let options = ApplyOptions {
        fuzz_factor: Some(1),
        ..Default::default()
    };

    let result = apply_patch_internal(source, &patch, &options);
    assert!(result.is_ok());
}

#[test]
fn test_deletion_line_processing() {
    let source = "line1\ndelete_me\nline3\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(2, 1, 2, 0, vec!["-delete_me"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline3\n");
    let patch_wrong = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(2, 1, 2, 0, vec!["-wrong_line"])],
    );

    let result_wrong = apply_patch_internal(source, &patch_wrong, &options);
    assert!(result_wrong.is_err());
}

#[test]
fn test_insertion_context_requirements() {
    let source = "line1\nline2\nline3\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            2,
            2,
            3,
            vec![" line2", "+inserted", " line3"],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\ninserted\nline3\n");
    let patch_wrong = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            2,
            2,
            3,
            vec![" wrong_context", "+inserted", " line3"],
        )],
    );

    let result_wrong = apply_patch_internal(source, &patch_wrong, &options);
    assert!(result_wrong.is_err());
}

#[test]
fn test_distance_iterator_search() {
    let source = "extra_line\nline1\nline2\nline3\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(2, 1, 2, 1, vec!["-line2", "+line2-modified"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "extra_line\nline1\nline2-modified\nline3\n");
}

#[test]
fn test_multiple_hunks_with_offsets() {
    let source = "line1\nline2\nline3\nline4\nline5\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![
            create_hunk(1, 1, 1, 2, vec!["-line1", "+line1", "+inserted1"]),
            create_hunk(3, 1, 4, 1, vec!["-line3", "+line3-modified"]),
        ],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(
        result,
        "line1\ninserted1\nline2\nline3-modified\nline4\nline5\n"
    );
}

#[test]
fn test_fuzz_factor_strategies() {
    let source = "line1\nextra\nline2\nline3\nline4\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            2,
            2,
            3,
            vec![" line2", "+inserted", " line3"],
        )],
    );
    let options = ApplyOptions {
        fuzz_factor: Some(1),
        ..Default::default()
    };

    let result = apply_patch_internal(source, &patch, &options).unwrap();

    assert!(result.contains("inserted"));
}

#[test]
fn test_trailing_context_trimming() {
    let source = "line1\nline2\nline3\nline4\nline5\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            3,
            2,
            4,
            vec![" line2", "+inserted", " line3", " line4"],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\ninserted\nline3\nline4\nline5\n");
}

#[test]
fn test_consecutive_context_tracking() {
    let source = "line1\nline2\nline3\nline4\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            1,
            4,
            1,
            5,
            vec![" line1", " line2", "+inserted", " line3", " line4"],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\ninserted\nline3\nline4\n");
}

#[test]
fn test_max_errors_boundary() {
    let source = "line1\nextra\nline2\nline3\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            2,
            2,
            3,
            vec![" line2", "+inserted", " line3"],
        )],
    );
    let options1 = ApplyOptions {
        fuzz_factor: Some(1),
        ..Default::default()
    };
    let result1 = apply_patch_internal(source, &patch, &options1);
    assert!(result1.is_ok());
    let options0 = ApplyOptions {
        fuzz_factor: Some(0),
        ..Default::default()
    };
    let result0 = apply_patch_internal(source, &patch, &options0);
    assert!(result0.is_ok());
}

#[test]
fn test_empty_source_with_additions() {
    let source = "";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(0, 0, 1, 2, vec!["+line1", "+line2"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nline2\n");
}

#[test]
fn test_source_to_empty_with_deletions() {
    let source = "line1\nline2\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(1, 2, 1, 0, vec!["-line1", "-line2"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "");
}

#[test]
fn test_line_ending_preservation() {
    let source = "line1\nline2\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(2, 1, 2, 1, vec!["-line2", "+modified"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nmodified\n");
    assert!(result.ends_with('\n'));
}

#[test]
fn test_special_eofnl_combinations() {
    let source = "line1\nline2";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            2,
            1,
            2,
            1,
            vec![
                "-line2",
                "\\ No newline at end of file",
                "+changed",
                "\\ No newline at end of file",
            ],
        )],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options).unwrap();
    assert_eq!(result, "line1\nchanged");
}

#[test]
fn test_hunk_bounds_checking() {
    let source = "line1\nline2\n";
    let patch = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(3, 2, 3, 2, vec![" line3", " line4"])],
    );
    let options = ApplyOptions::default();

    let result = apply_patch_internal(source, &patch, &options);
    assert!(result.is_err());
}

#[test]
fn test_patch_preprocessing_logic() {
    let source = "line1\nline2\n";
    let patch_remove_only = create_patch(
        "test.txt",
        "test.txt",
        vec![create_hunk(
            1,
            2,
            1,
            2,
            vec![" line1", "-line2", "+line2", "\\ No newline at end of file"],
        )],
    );
    let options = ApplyOptions {
        fuzz_factor: Some(0),
        ..Default::default()
    };
    let result = apply_patch_internal(source, &patch_remove_only, &options);
    assert!(result.is_ok());
}
