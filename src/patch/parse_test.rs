use crate::patch::parse::parse_patch_internal;
use crate::patch::types::{Hunk, Patch};
use pretty_assertions::assert_eq;
fn create_patch(hunks: Vec<Hunk>) -> Patch {
    Patch {
        index: None,
        old_file_name: String::new(),
        new_file_name: String::new(),
        old_header: String::new(),
        new_header: String::new(),
        hunks,
    }
}

fn create_full_patch(
    index: Option<String>,
    old_file_name: &str,
    new_file_name: &str,
    old_header: &str,
    new_header: &str,
    hunks: Vec<Hunk>,
) -> Patch {
    Patch {
        index,
        old_file_name: old_file_name.to_string(),
        new_file_name: new_file_name.to_string(),
        old_header: old_header.to_string(),
        new_header: new_header.to_string(),
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
fn test_basic_patch() {
    let input = "@@ -1,3 +1,4 @@
 line2
 line3
+line4
 line5";

    let expected = vec![create_patch(vec![create_hunk(
        1,
        3,
        1,
        4,
        vec![" line2", " line3", "+line4", " line5"],
    )])];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_single_line_hunks() {
    let input = "@@ -1 +1 @@
-line3
+line4";

    let expected = vec![create_patch(vec![create_hunk(
        1,
        1,
        1,
        1,
        vec!["-line3", "+line4"],
    )])];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_multiple_hunks() {
    let input = "@@ -1,3 +1,4 @@
 line2
 line3
+line4
 line5
@@ -4,4 +1,3 @@
 line2
 line3
-line4
 line5";

    let expected = vec![create_patch(vec![
        create_hunk(1, 3, 1, 4, vec![" line2", " line3", "+line4", " line5"]),
        create_hunk(4, 4, 1, 3, vec![" line2", " line3", "-line4", " line5"]),
    ])];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_single_index() {
    let input = "Index: test
===================================================================
--- from\theader1
+++ to\theader2
@@ -1,3 +1,4 @@
 line2
 line3
+line4
 line5";

    let expected = vec![create_full_patch(
        Some("test".to_string()),
        "from",
        "to",
        "header1",
        "header2",
        vec![create_hunk(
            1,
            3,
            1,
            4,
            vec![" line2", " line3", "+line4", " line5"],
        )],
    )];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_multiple_index() {
    let input = "Index: test
===================================================================
--- from\theader1
+++ to\theader2
@@ -1,3 +1,4 @@
 line2
 line3
+line4
 line5
Index: test2
===================================================================
--- from\theader1
+++ to\theader2
@@ -1,3 +1,4 @@
 line2
 line3
+line4
 line5";

    let expected = vec![
        create_full_patch(
            Some("test".to_string()),
            "from",
            "to",
            "header1",
            "header2",
            vec![create_hunk(
                1,
                3,
                1,
                4,
                vec![" line2", " line3", "+line4", " line5"],
            )],
        ),
        create_full_patch(
            Some("test2".to_string()),
            "from",
            "to",
            "header1",
            "header2",
            vec![create_hunk(
                1,
                3,
                1,
                4,
                vec![" line2", " line3", "+line4", " line5"],
            )],
        ),
    ];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_multiple_files_no_index() {
    let input = "--- from\theader1
+++ to\theader2
@@ -1,3 +1,4 @@
 line2
 line3
+line4
 line5
--- from\theader1
+++ to\theader2
@@ -1,3 +1,4 @@
 line2
 line3
+line4
 line5";

    let expected = vec![
        create_full_patch(
            None,
            "from",
            "to",
            "header1",
            "header2",
            vec![create_hunk(
                1,
                3,
                1,
                4,
                vec![" line2", " line3", "+line4", " line5"],
            )],
        ),
        create_full_patch(
            None,
            "from",
            "to",
            "header1",
            "header2",
            vec![create_hunk(
                1,
                3,
                1,
                4,
                vec![" line2", " line3", "+line4", " line5"],
            )],
        ),
    ];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_filenames_with_quotes() {
    let input = "Index: test
===================================================================
--- \"from\\a\\file\\with\\quotes\\and\\backslash\"\theader1
+++ \"to\\a\\file\\with\\quotes\\and\\backslash\"\theader2
@@ -1,3 +1,4 @@
 line2
 line3
+line4
 line5";

    let expected = vec![create_full_patch(
        Some("test".to_string()),
        "from\\a\\file\\with\\quotes\\and\\backslash",
        "to\\a\\file\\with\\quotes\\and\\backslash",
        "header1",
        "header2",
        vec![create_hunk(
            1,
            3,
            1,
            4,
            vec![" line2", " line3", "+line4", " line5"],
        )],
    )];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_added_eofnl() {
    let input = "@@ -1,1 +0,0 @@
-line5
\\ No newline at end of file";

    let expected = vec![create_patch(vec![create_hunk(
        1,
        1,
        1,
        0,
        vec!["-line5", "\\ No newline at end of file"],
    )])];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_removed_eofnl() {
    let input = "@@ -0,0 +1 @@
+line5
\\ No newline at end of file";

    let expected = vec![create_patch(vec![create_hunk(
        1,
        0,
        1,
        1,
        vec!["+line5", "\\ No newline at end of file"],
    )])];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_context_no_eofnl() {
    let input = "@@ -1 +1,2 @@
+line4
 line5
\\ No newline at end of file";

    let expected = vec![create_patch(vec![create_hunk(
        1,
        1,
        1,
        2,
        vec!["+line4", " line5", "\\ No newline at end of file"],
    )])];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_empty_patch() {
    let input = "@@ -1 +1 @@";

    let expected = vec![create_patch(vec![create_hunk(1, 0, 1, 0, vec![])])];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_vertical_tabs() {
    let input = "--- foo\t2023-12-20 16:11:20.908225554 +0000
+++ bar\t2023-12-20 16:11:34.391473579 +0000
@@ -1,4 +1,4 @@
 foo
-bar\u{000B}bar
+barry\u{000B}barry
 baz
 qux
\\ No newline at end of file";

    let expected = vec![create_full_patch(
        None,
        "foo",
        "bar",
        "2023-12-20 16:11:20.908225554 +0000",
        "2023-12-20 16:11:34.391473579 +0000",
        vec![create_hunk(
            1,
            4,
            1,
            4,
            vec![
                " foo",
                "-bar\u{000B}bar",
                "+barry\u{000B}barry",
                " baz",
                " qux",
                "\\ No newline at end of file",
            ],
        )],
    )];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_trailing_newlines() {
    let input = "--- foo\t2024-06-14 22:16:31.444276792 +0100
+++ bar\t2024-06-14 22:17:14.910611219 +0100
@@ -1,7 +1,7 @@
 first
 second
 third
-fourth
-fifth
+vierte
+fünfte
 sixth
 seventh

";

    let expected = vec![create_full_patch(
        None,
        "foo",
        "bar",
        "2024-06-14 22:16:31.444276792 +0100",
        "2024-06-14 22:17:14.910611219 +0100",
        vec![create_hunk(
            1,
            7,
            1,
            7,
            vec![
                " first", " second", " third", "-fourth", "-fifth", "+vierte", "+fünfte", " sixth",
                " seventh",
            ],
        )],
    )];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_add_remove_prefixed_lines() {
    let input = "--- foo\t2024-06-14 21:57:04.341065736 +0100
+++ bar\t2024-06-14 22:00:57.988080321 +0100
@@ -4 +4 @@
--- bla
+++ bla
@@ -6,0 +7 @@
+seventh";

    let expected = vec![create_full_patch(
        None,
        "foo",
        "bar",
        "2024-06-14 21:57:04.341065736 +0100",
        "2024-06-14 22:00:57.988080321 +0100",
        vec![
            create_hunk(4, 1, 4, 1, vec!["--- bla", "+++ bla"]),
            create_hunk(7, 0, 7, 1, vec!["+seventh"]),
        ],
    )];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_invalid_line_in_hunk() {
    let input = "Index: test
===================================================================
--- from\theader1
+++ to\theader2
@@ -1,3 +1,4 @@
 line2
line3
+line4
 line5";

    let result = parse_patch_internal(input);
    assert!(result.is_err());
    assert_eq!(
        result.err().unwrap(),
        "Hunk at line 5 contained invalid line line3"
    );
}

#[test]
fn test_oom_case() {
    let input = "Index:
===================================================================
---
+++
@@ -1,1 +1,2 @@
-1
\\ No newline at end of file
+1
+2";

    let expected = vec![create_full_patch(
        None,
        "",
        "",
        "",
        "",
        vec![create_hunk(
            1,
            1,
            1,
            2,
            vec!["-1", "\\ No newline at end of file", "+1", "+2"],
        )],
    )];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_sanity_check_line_count() {
    let input = "@@ -1 +1,4 @@
 line2
+line3";
    let result = parse_patch_internal(input);
    assert!(result.is_err());
}

#[test]
fn test_invalid_input() {
    let input = "blit\nblat\nIndex: foo\nfoo";

    let expected = vec![create_full_patch(
        Some("foo".to_string()),
        "",
        "",
        "",
        "",
        vec![],
    )];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_empty_input() {
    let input = "";
    let expected: Vec<Patch> = vec![];

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result, expected);
}

#[test]
fn test_parse_header_edge_cases() {
    let input1 = "Index: simple_file.txt
===================================================================
--- old_file.txt\theader
+++ new_file.txt\theader
@@ -1 +1 @@
 unchanged";

    let result1 = parse_patch_internal(input1).unwrap();
    assert_eq!(result1[0].index, Some("simple_file.txt".to_string()));
    let input2 = "diff -r abc123 file.txt
--- old_file.txt\theader
+++ new_file.txt\theader
@@ -1 +1 @@
 unchanged";

    let result2 = parse_patch_internal(input2).unwrap();
    assert_eq!(result2[0].index, Some("file.txt".to_string()));
    let input3 = "@@ -1 +1 @@
 unchanged";

    let result3 = parse_patch_internal(input3).unwrap();
    assert_eq!(result3[0].index, None);
    assert_eq!(result3[0].old_file_name, "");
    assert_eq!(result3[0].new_file_name, "");
}

#[test]
fn test_file_header_parsing_edge_cases() {
    let input1 = "--- /path/to/file.txt\t2023-01-01 12:00:00.000000000 +0000
+++ /path/to/new_file.txt\t2023-01-01 12:00:01.000000000 +0000
@@ -1 +1 @@
 unchanged";

    let result1 = parse_patch_internal(input1).unwrap();
    assert_eq!(result1[0].old_file_name, "/path/to/file.txt");
    assert_eq!(result1[0].new_file_name, "/path/to/new_file.txt");
    assert_eq!(result1[0].old_header, "2023-01-01 12:00:00.000000000 +0000");
    assert_eq!(result1[0].new_header, "2023-01-01 12:00:01.000000000 +0000");
    let input2 = "--- file_a
+++ file_b
@@ -1 +1 @@
 unchanged";

    let result2 = parse_patch_internal(input2).unwrap();
    assert_eq!(result2[0].old_file_name, "file_a");
    assert_eq!(result2[0].new_file_name, "file_b");
    assert_eq!(result2[0].old_header, "");
    assert_eq!(result2[0].new_header, "");
    let input3 = "--- file\\with\\backslashes.txt
+++ file\\with\\backslashes.txt
@@ -1 +1 @@
 unchanged";

    let result3 = parse_patch_internal(input3).unwrap();
    assert_eq!(result3[0].old_file_name, "file\\with\\backslashes.txt");
    assert_eq!(result3[0].new_file_name, "file\\with\\backslashes.txt");
}

#[test]
fn test_hunk_header_variations() {
    let input1 = "@@ -5 +7,2 @@
-removed
+added1
+added2";

    let result1 = parse_patch_internal(input1).unwrap();
    let hunk1 = &result1[0].hunks[0];
    assert_eq!(hunk1.old_start, 5);
    assert_eq!(hunk1.old_lines, 1);
    assert_eq!(hunk1.new_start, 7);
    assert_eq!(hunk1.new_lines, 2);
    let input2 = "@@ -3 +3 @@
-old
+new";

    let result2 = parse_patch_internal(input2).unwrap();
    let hunk2 = &result2[0].hunks[0];
    assert_eq!(hunk2.old_start, 3);
    assert_eq!(hunk2.old_lines, 1);
    assert_eq!(hunk2.new_start, 3);
    assert_eq!(hunk2.new_lines, 1);
    let input3 = "@@ -0,0 +1,2 @@
+line1
+line2";

    let result3 = parse_patch_internal(input3).unwrap();
    let hunk3 = &result3[0].hunks[0];
    assert_eq!(hunk3.old_start, 1);
    assert_eq!(hunk3.old_lines, 0);
    assert_eq!(hunk3.new_start, 1);
    assert_eq!(hunk3.new_lines, 2);
}

#[test]
fn test_quoted_filename_edge_cases() {
    let input = "--- \"file with spaces and \"quotes\".txt\"\theader
+++ \"another file with spaces.txt\"\theader
@@ -1 +1 @@
 unchanged";

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(
        result[0].old_file_name,
        "file with spaces and \"quotes\".txt"
    );
    assert_eq!(result[0].new_file_name, "another file with spaces.txt");
    let input2 = "--- \"unbalanced_quote.txt\theader
+++ normal_file.txt\theader
@@ -1 +1 @@
 unchanged";

    let result2 = parse_patch_internal(input2).unwrap();
    assert_eq!(result2[0].old_file_name, "\"unbalanced_quote.txt");
    assert_eq!(result2[0].new_file_name, "normal_file.txt");
}

#[test]
fn test_hunk_line_counting_edge_cases() {
    let input1 = "@@ -1,1 +1,0 @@
-removed_line";

    let result1 = parse_patch_internal(input1).unwrap();
    let hunk1 = &result1[0].hunks[0];
    assert_eq!(hunk1.old_lines, 1);
    assert_eq!(hunk1.new_lines, 0);
    let input2 = "@@ -1,0 +1,1 @@
+added_line";

    let result2 = parse_patch_internal(input2).unwrap();
    let hunk2 = &result2[0].hunks[0];
    assert_eq!(hunk2.old_lines, 0);
    assert_eq!(hunk2.new_lines, 1);
}

#[test]
fn test_line_operation_detection() {
    let input = "@@ -2,2 +2,2 @@
 context_line
-removed_line
+added_line";

    let result = parse_patch_internal(input).unwrap();
    let lines = &result[0].hunks[0].lines;

    assert_eq!(lines[0], " context_line");
    assert_eq!(lines[1], "-removed_line");
    assert_eq!(lines[2], "+added_line");
}

#[test]
fn test_line_count_mismatch_errors() {
    let input1 = "@@ -1,2 +1,1 @@
-line1
+new_line";

    let result1 = parse_patch_internal(input1);
    assert!(result1.is_err());
    assert!(result1
        .unwrap_err()
        .contains("Removed line count did not match"));
    let input2 = "@@ -1,1 +1,2 @@
-old_line
+new_line";

    let result2 = parse_patch_internal(input2);
    assert!(result2.is_err());
    assert!(result2
        .unwrap_err()
        .contains("Added line count did not match"));
}

#[test]
fn test_empty_line_handling() {
    let input =
        "Index: test\n\n--- old\theader\n+++ new\theader\n\n@@ -1,3 +1,3 @@\n line1\n \n line2";

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result[0].index, Some("test".to_string()));
    assert_eq!(result[0].hunks[0].lines.len(), 3);
    assert_eq!(result[0].hunks[0].lines[1], " ");
}

#[test]
fn test_backslash_continuation_lines() {
    let input = "@@ -1,1 +1,1 @@
 line1
\\ No newline at end of file";

    let result = parse_patch_internal(input).unwrap();
    let lines = &result[0].hunks[0].lines;

    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0], " line1");
    assert_eq!(lines[1], "\\ No newline at end of file");
}

#[test]
fn test_multiple_patches_boundary_detection() {
    let input = "--- file1\theader1
+++ file1\theader1
@@ -1 +1 @@
 line1
Index: file2
===================================================================
--- file2\theader2
+++ file2\theader2
@@ -1 +1 @@
 line2";

    let result = parse_patch_internal(input).unwrap();
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].old_file_name, "file1");
    assert_eq!(result[1].index, Some("file2".to_string()));
    assert_eq!(result[1].old_file_name, "file2");
}

#[test]
fn test_regex_patterns() {
    use regex::Regex;
    let header_re = Regex::new(r"^(?:Index:|diff(?: -r [a-fA-F0-9]+)+)\s+(.+?)\s*$").unwrap();

    assert!(header_re.is_match("Index: simple_file.txt"));
    assert!(header_re.is_match("diff -r abc123 file.txt"));
    assert!(header_re.is_match("diff -r abc123 -r def456 file.txt"));
    assert!(!header_re.is_match("not a header"));
    let file_hdr_re = Regex::new(r"^(---|\+\+\+)\s+(.*)\r?$").unwrap();

    assert!(file_hdr_re.is_match("--- file.txt\theader"));
    assert!(file_hdr_re.is_match("+++ file.txt\theader"));
    assert!(file_hdr_re.is_match("--- file.txt"));
    assert!(!file_hdr_re.is_match("not a file header"));
    let chunk_hdr_re = Regex::new(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@").unwrap();

    assert!(chunk_hdr_re.is_match("@@ -1,3 +1,4 @@"));
    assert!(chunk_hdr_re.is_match("@@ -1 +1 @@"));
    assert!(chunk_hdr_re.is_match("@@ -0,0 +1,2 @@"));
    assert!(!chunk_hdr_re.is_match("not a chunk header"));
}

#[test]
fn test_error_recovery_behavior() {
    let input1 = "@@ -1,1 +1,1 @@
invalid_line_without_prefix";
    let result1 = parse_patch_internal(input1);
    assert!(result1.is_err());
    let input2 =
        "random text\nmore random text\nIndex: test\n--- old\n+++ new\n@@ -1 +1 @@\n line1";
    let result2 = parse_patch_internal(input2);

    assert!(result2.is_ok());
}
