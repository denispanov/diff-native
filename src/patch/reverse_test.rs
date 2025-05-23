use crate::patch::reverse::reverse_single;
use crate::patch::types::{Hunk, Patch};
use pretty_assertions::assert_eq;
fn create_patch(
    old_file_name: &str,
    new_file_name: &str,
    old_header: &str,
    new_header: &str,
    hunks: Vec<Hunk>,
) -> Patch {
    Patch {
        index: None,
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
        lines: lines.into_iter().map(|s| s.to_string()).collect(),
    }
}

#[test]
fn test_reverse_single_patch_basic() {
    let original_patch = create_patch(
        "file1",
        "file2",
        "",
        "",
        vec![create_hunk(
            1,
            4,
            1,
            4,
            vec![" line1", " line2", "-line3", "+line5", " line4"],
        )],
    );

    let reversed = reverse_single(&original_patch);
    assert_eq!(reversed.old_file_name, "file2");
    assert_eq!(reversed.new_file_name, "file1");
    assert_eq!(reversed.old_header, "");
    assert_eq!(reversed.new_header, "");
    assert_eq!(reversed.hunks.len(), 1);
    let hunk = &reversed.hunks[0];
    assert_eq!(hunk.old_start, 1);
    assert_eq!(hunk.old_lines, 4);
    assert_eq!(hunk.new_start, 1);
    assert_eq!(hunk.new_lines, 4);
    let expected_lines = vec![" line1", " line2", "+line3", "-line5", " line4"];
    assert_eq!(hunk.lines, expected_lines);
}

#[test]
fn test_reverse_single_patch_with_headers() {
    let original_patch = Patch {
        index: Some("index 20b807a..4a96aff 100644".to_string()),
        old_file_name: "a/CONTRIBUTING.md".to_string(),
        new_file_name: "b/CONTRIBUTING.md".to_string(),
        old_header: "old header".to_string(),
        new_header: "new header".to_string(),
        hunks: vec![create_hunk(
            2,
            6,
            2,
            8,
            vec![
                " ",
                " ## Pull Requests",
                " ",
                "+bla bla bla",
                "+",
                " We also accept [pull requests][pull-request]!",
            ],
        )],
    };

    let reversed = reverse_single(&original_patch);

    assert_eq!(reversed.old_file_name, "b/CONTRIBUTING.md");
    assert_eq!(reversed.new_file_name, "a/CONTRIBUTING.md");
    assert_eq!(reversed.old_header, "new header");
    assert_eq!(reversed.new_header, "old header");
    assert_eq!(
        reversed.index,
        Some("index 20b807a..4a96aff 100644".to_string())
    );

    let hunk = &reversed.hunks[0];
    assert_eq!(hunk.old_start, 2);
    assert_eq!(hunk.old_lines, 8);
    assert_eq!(hunk.new_start, 2);
    assert_eq!(hunk.new_lines, 6);

    let expected_lines = vec![
        " ",
        " ## Pull Requests",
        " ",
        "-bla bla bla",
        "-",
        " We also accept [pull requests][pull-request]!",
    ];
    assert_eq!(hunk.lines, expected_lines);
}

#[test]
fn test_reverse_single_patch_complex_changes() {
    let original_patch = create_patch(
        "old.txt",
        "new.txt",
        "",
        "",
        vec![create_hunk(
            1,
            5,
            1,
            7,
            vec![
                " context1",
                "-deleted line 1",
                "-deleted line 2",
                "+added line 1",
                "+added line 2",
                "+added line 3",
                " context2",
            ],
        )],
    );

    let reversed = reverse_single(&original_patch);

    assert_eq!(reversed.old_file_name, "new.txt");
    assert_eq!(reversed.new_file_name, "old.txt");

    let hunk = &reversed.hunks[0];
    assert_eq!(hunk.old_start, 1);
    assert_eq!(hunk.old_lines, 7);
    assert_eq!(hunk.new_start, 1);
    assert_eq!(hunk.new_lines, 5);

    let expected_lines = vec![
        " context1",
        "+deleted line 1",
        "+deleted line 2",
        "-added line 1",
        "-added line 2",
        "-added line 3",
        " context2",
    ];
    assert_eq!(hunk.lines, expected_lines);
}

#[test]
fn test_reverse_single_patch_empty_lines() {
    let original_patch = create_patch(
        "file1",
        "file2",
        "",
        "",
        vec![create_hunk(1, 3, 1, 3, vec!["+", " normal line", "-"])],
    );

    let reversed = reverse_single(&original_patch);

    let expected_lines = vec!["-", " normal line", "+"];
    assert_eq!(reversed.hunks[0].lines, expected_lines);
}

#[test]
fn test_reverse_patch_array_behavior() {
    let patch1 = create_patch(
        "a/CONTRIBUTING.md",
        "b/CONTRIBUTING.md",
        "",
        "",
        vec![create_hunk(
            2,
            6,
            2,
            8,
            vec![
                " ",
                " ## Pull Requests",
                " ",
                "+bla bla bla",
                "+",
                " We also accept [pull requests][pull-request]!",
            ],
        )],
    );

    let patch2 = create_patch(
        "a/README.md",
        "b/README.md",
        "",
        "",
        vec![
            create_hunk(
                1,
                5,
                1,
                7,
                vec![" # jsdiff", " ", "+foo", "+", " [![Build Status](https://secure.travis-ci.org/kpdecker/jsdiff.svg)](http://travis-ci.org/kpdecker/jsdiff)"],
            ),
            create_hunk(
                225,
                3,
                227,
                5,
                vec![" ", " * jsdiff keeps track of the diff for each diagonal using a linked list of change objects for each diagonal, rather than the historical array of furthest-reaching D-paths on each diagonal contemplated on page 8 of Myers's paper.", " * jsdiff skips considering diagonals where the furthest-reaching D-path would go off the edge of the edit graph. This dramatically reduces the time cost (from quadratic to linear) in cases where the new text just appends or truncates content at the end of the old text.", "+", "+bar"],
            ),
        ],
    );

    let original_patches = vec![patch1.clone(), patch2.clone()];
    let mut reversed: Vec<Patch> = original_patches.iter().map(reverse_single).collect();
    reversed.reverse();
    assert_eq!(reversed.len(), 2);
    assert_eq!(reversed[0].old_file_name, "b/README.md");
    assert_eq!(reversed[0].new_file_name, "a/README.md");
    assert_eq!(reversed[0].hunks.len(), 2);
    let hunk1 = &reversed[0].hunks[0];
    assert_eq!(hunk1.old_start, 1);
    assert_eq!(hunk1.old_lines, 7);
    assert_eq!(hunk1.new_start, 1);
    assert_eq!(hunk1.new_lines, 5);
    let expected_lines1 = vec![" # jsdiff", " ", "-foo", "-", " [![Build Status](https://secure.travis-ci.org/kpdecker/jsdiff.svg)](http://travis-ci.org/kpdecker/jsdiff)"];
    assert_eq!(hunk1.lines, expected_lines1);
    assert_eq!(reversed[1].old_file_name, "b/CONTRIBUTING.md");
    assert_eq!(reversed[1].new_file_name, "a/CONTRIBUTING.md");
    assert_eq!(reversed[1].hunks.len(), 1);
}

#[test]
fn test_reverse_patch_multiple_hunks() {
    let original_patch = create_patch(
        "multi.txt",
        "multi_new.txt",
        "",
        "",
        vec![
            create_hunk(1, 2, 1, 3, vec![" start", "+added at beginning", " line1"]),
            create_hunk(10, 2, 11, 1, vec!["-removed line", " end"]),
        ],
    );

    let reversed = reverse_single(&original_patch);

    assert_eq!(reversed.hunks.len(), 2);
    let hunk1 = &reversed.hunks[0];
    assert_eq!(hunk1.old_start, 1);
    assert_eq!(hunk1.old_lines, 3);
    assert_eq!(hunk1.new_start, 1);
    assert_eq!(hunk1.new_lines, 2);
    let expected_lines1 = vec![" start", "-added at beginning", " line1"];
    assert_eq!(hunk1.lines, expected_lines1);
    let hunk2 = &reversed.hunks[1];
    assert_eq!(hunk2.old_start, 11);
    assert_eq!(hunk2.old_lines, 1);
    assert_eq!(hunk2.new_start, 10);
    assert_eq!(hunk2.new_lines, 2);
    let expected_lines2 = vec!["+removed line", " end"];
    assert_eq!(hunk2.lines, expected_lines2);
}

#[test]
fn test_reverse_patch_context_only() {
    let original_patch = create_patch(
        "same.txt",
        "same.txt",
        "",
        "",
        vec![create_hunk(1, 3, 1, 3, vec![" line1", " line2", " line3"])],
    );

    let reversed = reverse_single(&original_patch);

    assert_eq!(reversed.old_file_name, "same.txt");
    assert_eq!(reversed.new_file_name, "same.txt");

    let hunk = &reversed.hunks[0];
    assert_eq!(hunk.old_start, 1);
    assert_eq!(hunk.old_lines, 3);
    assert_eq!(hunk.new_start, 1);
    assert_eq!(hunk.new_lines, 3);
    let expected_lines = vec![" line1", " line2", " line3"];
    assert_eq!(hunk.lines, expected_lines);
}

#[test]
fn test_reverse_patch_edge_case_empty_patch() {
    let original_patch = create_patch("empty1", "empty2", "", "", vec![]);

    let reversed = reverse_single(&original_patch);

    assert_eq!(reversed.old_file_name, "empty2");
    assert_eq!(reversed.new_file_name, "empty1");
    assert_eq!(reversed.hunks.len(), 0);
}

#[test]
fn test_reverse_patch_only_additions() {
    let original_patch = create_patch(
        "base.txt",
        "added.txt",
        "",
        "",
        vec![create_hunk(
            1,
            0,
            1,
            3,
            vec!["+new line 1", "+new line 2", "+new line 3"],
        )],
    );

    let reversed = reverse_single(&original_patch);

    let hunk = &reversed.hunks[0];
    assert_eq!(hunk.old_start, 1);
    assert_eq!(hunk.old_lines, 3);
    assert_eq!(hunk.new_start, 1);
    assert_eq!(hunk.new_lines, 0);

    let expected_lines = vec!["-new line 1", "-new line 2", "-new line 3"];
    assert_eq!(hunk.lines, expected_lines);
}

#[test]
fn test_reverse_patch_only_deletions() {
    let original_patch = create_patch(
        "full.txt",
        "empty.txt",
        "",
        "",
        vec![create_hunk(
            1,
            3,
            1,
            0,
            vec!["-old line 1", "-old line 2", "-old line 3"],
        )],
    );

    let reversed = reverse_single(&original_patch);

    let hunk = &reversed.hunks[0];
    assert_eq!(hunk.old_start, 1);
    assert_eq!(hunk.old_lines, 0);
    assert_eq!(hunk.new_start, 1);
    assert_eq!(hunk.new_lines, 3);

    let expected_lines = vec!["+old line 1", "+old line 2", "+old line 3"];
    assert_eq!(hunk.lines, expected_lines);
}

#[test]
fn test_reverse_patch_compatibility() {
    let original_patch = create_patch(
        "file1",
        "file2",
        "",
        "",
        vec![create_hunk(
            1,
            4,
            1,
            4,
            vec![" line1", " line2", "-line3", "+line5", " line4"],
        )],
    );

    let reversed = reverse_single(&original_patch);
    assert_eq!(reversed.old_file_name, "file2");
    assert_eq!(reversed.new_file_name, "file1");
    assert_eq!(reversed.old_header, "");
    assert_eq!(reversed.new_header, "");

    let hunk = &reversed.hunks[0];
    assert_eq!(hunk.old_start, 1);
    assert_eq!(hunk.old_lines, 4);
    assert_eq!(hunk.new_start, 1);
    assert_eq!(hunk.new_lines, 4);
    let expected_lines = vec![" line1", " line2", "+line3", "-line5", " line4"];
    assert_eq!(hunk.lines, expected_lines);
}
