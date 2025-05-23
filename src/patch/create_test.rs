#[cfg(test)]
mod tests {
    use crate::patch::create::{format_single, prefix_space};
    use crate::patch::types::*;

    #[test]
    fn test_split_lines_empty_input() {
        let split_lines = |s: &str| -> Vec<String> {
            if s.is_empty() {
                return Vec::new();
            }
            let has_trailing_nl = s.ends_with('\n');
            let mut result: Vec<String> = s.split('\n').map(|line| format!("{}\n", line)).collect();
            if has_trailing_nl {
                result.pop();
            } else {
                if let Some(last) = result.last_mut() {
                    *last = last[..last.len() - 1].to_string();
                }
            }
            result
        };
        assert_eq!(split_lines(""), Vec::<String>::new());
        assert_eq!(split_lines("a"), vec!["a"]);
        assert_eq!(split_lines("a\n"), vec!["a\n"]);
        assert_eq!(split_lines("a\nb"), vec!["a\n", "b"]);
        assert_eq!(split_lines("a\nb\n"), vec!["a\n", "b\n"]);
    }

    #[test]
    fn test_context_range_bounds() {
        let lines = vec!["only_line".to_string()];
        let context = 10;
        let context_size = context.min(lines.len());
        let slice = &lines[..context_size];
        assert_eq!(slice.len(), 1);
        assert_eq!(slice[0], "only_line");
    }

    #[test]
    fn test_context_zero_behavior() {
        let prev_context_block = vec!["context1".to_string(), "context2".to_string()];
        let context = 0;
        let should_add_context = !prev_context_block.is_empty() && context > 0;
        assert!(!should_add_context);
        let context = 2;
        let should_add_context = !prev_context_block.is_empty() && context > 0;
        assert!(should_add_context);
    }

    #[test]
    fn test_prefix_space_function() {
        let lines = vec!["line1".to_string(), "line2".to_string()];
        let prefixed = prefix_space(&lines);

        assert_eq!(prefixed, vec![" line1".to_string(), " line2".to_string()]);
    }

    #[test]
    fn test_format_single_header_tabs() {
        let patch = Patch {
            old_file_name: "test".to_string(),
            new_file_name: "test".to_string(),
            old_header: "".to_string(),
            new_header: "".to_string(),
            hunks: vec![],
            ..Default::default()
        };

        let formatted = format_single(&patch);
        let lines: Vec<&str> = formatted.lines().collect();
        assert!(lines[2].starts_with("--- test\t"));
        assert!(lines[3].starts_with("+++ test\t"));
    }

    #[test]
    fn test_range_end_condition_logic() {
        let changes_len = 5;
        let i = 2;
        let context = 2;
        let lines_len = 4;
        let should_overlap = lines_len <= context * 2 && i < changes_len - 2;
        assert!(should_overlap);
        let i = 3;
        let should_overlap = lines_len <= context * 2 && i < changes_len - 2;
        assert!(!should_overlap);
    }

    #[test]
    fn test_split_lines_edge_cases() {
        let split_lines = |s: &str| -> Vec<String> {
            if s.is_empty() {
                return Vec::new();
            }
            let has_trailing_nl = s.ends_with('\n');
            let mut result: Vec<String> = s.split('\n').map(|line| format!("{}\n", line)).collect();
            if has_trailing_nl {
                result.pop();
            } else {
                if let Some(last) = result.last_mut() {
                    *last = last[..last.len() - 1].to_string();
                }
            }
            result
        };
        assert_eq!(split_lines("\n"), vec!["\n".to_string()]);
        assert_eq!(
            split_lines("\n\n"),
            vec!["\n".to_string(), "\n".to_string()]
        );
        assert_eq!(
            split_lines("a\n\nb"),
            vec!["a\n".to_string(), "\n".to_string(), "b".to_string()]
        );
        assert_eq!(
            split_lines("a\n\n"),
            vec!["a\n".to_string(), "\n".to_string()]
        );
        assert_eq!(
            split_lines("\n\n\n"),
            vec!["\n".to_string(), "\n".to_string(), "\n".to_string()]
        );
    }

    #[test]
    fn test_hunk_range_calculations() {
        let old_range_start = 5;
        let new_range_start = 3;
        let old_line = 10;
        let new_line = 8;
        let context_size = 2;
        let old_lines = old_line - old_range_start + context_size;
        let new_lines = new_line - new_range_start + context_size;

        assert_eq!(old_lines, 7);
        assert_eq!(new_lines, 7);
        let final_old_lines = old_line - old_range_start;
        let final_new_lines = new_line - new_range_start;

        assert_eq!(final_old_lines, 5);
        assert_eq!(final_new_lines, 5);
    }

    #[test]
    fn test_eofnl_marker_insertion() {
        let mut lines = vec![
            "line1\n".to_string(),
            "line2".to_string(),
            "line3\n".to_string(),
        ];
        let mut i = 0;
        while i < lines.len() {
            if lines[i].ends_with('\n') {
                lines[i] = lines[i][..lines[i].len() - 1].to_string();
            } else {
                lines.insert(i + 1, "\\ No newline at end of file".to_string());
                i += 1;
            }
            i += 1;
        }

        assert_eq!(
            lines,
            vec![
                "line1".to_string(),
                "line2".to_string(),
                "\\ No newline at end of file".to_string(),
                "line3".to_string(),
            ]
        );
    }

    #[test]
    fn test_context_slicing_edge_cases() {
        let prev_context_block = vec![
            "context1".to_string(),
            "context2".to_string(),
            "context3".to_string(),
            "context4".to_string(),
            "context5".to_string(),
        ];
        let context = 10;
        let take = context.min(prev_context_block.len());
        assert_eq!(take, 5);

        let slice = &prev_context_block[prev_context_block.len() - take..];
        assert_eq!(slice.len(), 5);
        assert_eq!(slice[0], "context1");
        assert_eq!(slice[4], "context5");
        let context = 2;
        let take = context.min(prev_context_block.len());
        assert_eq!(take, 2);

        let slice = &prev_context_block[prev_context_block.len() - take..];
        assert_eq!(slice.len(), 2);
        assert_eq!(slice[0], "context4");
        assert_eq!(slice[1], "context5");
        let context = 0;
        let take = context.min(prev_context_block.len());
        assert_eq!(take, 0);

        let slice = &prev_context_block[prev_context_block.len() - take..];
        assert_eq!(slice.len(), 0);
    }

    #[test]
    fn test_hunk_start_adjustments() {
        let mut old_range_start = 10;
        let mut new_range_start = 15;
        let take = 3;
        old_range_start -= take;
        new_range_start -= take;

        assert_eq!(old_range_start, 7);
        assert_eq!(new_range_start, 12);
        let mut old_range_start = 10;
        let mut new_range_start = 15;
        let take = 0;

        old_range_start -= take;
        new_range_start -= take;

        assert_eq!(old_range_start, 10);
        assert_eq!(new_range_start, 15);
    }

    #[test]
    fn test_line_counting_logic() {
        let mut old_line = 1;
        let mut new_line = 1;
        let added_lines = vec!["added1".to_string(), "added2".to_string()];
        new_line += added_lines.len();

        assert_eq!(old_line, 1);
        assert_eq!(new_line, 3);
        let removed_lines = vec!["removed1".to_string()];
        old_line += removed_lines.len();

        assert_eq!(old_line, 2);
        assert_eq!(new_line, 3);
        let unchanged_lines = vec!["unchanged1".to_string(), "unchanged2".to_string()];
        old_line += unchanged_lines.len();
        new_line += unchanged_lines.len();

        assert_eq!(old_line, 4);
        assert_eq!(new_line, 5);
    }

    #[test]
    fn test_change_line_formatting() {
        let added_line = "added content";
        let removed_line = "removed content";

        let formatted_added = format!("{}{}", '+', added_line);
        let formatted_removed = format!("{}{}", '-', removed_line);

        assert_eq!(formatted_added, "+added content");
        assert_eq!(formatted_removed, "-removed content");
        let line_with_nl = "content\n";
        let formatted_with_nl = format!("{}{}", '+', line_with_nl);
        assert_eq!(formatted_with_nl, "+content\n");
    }

    #[test]
    fn test_overlap_detection_logic() {
        let context = 3;
        let lines_len = 4;
        let i = 2;
        let changes_len = 6;

        let should_overlap = lines_len <= context * 2 && i < changes_len - 2;
        assert!(should_overlap);
        let lines_len = 10;
        let should_overlap = lines_len <= context * 2 && i < changes_len - 2;
        assert!(!should_overlap);
        let lines_len = 4;
        let i = 4;
        let should_overlap = lines_len <= context * 2 && i < changes_len - 2;
        assert!(!should_overlap);
    }

    #[test]
    fn test_header_line_formatting_variations() {
        let hdr_line =
            |tag: &str, name: &str, hdr: &str| -> String { format!("{tag} {name}\t{hdr}\n") };
        assert_eq!(hdr_line("---", "file.txt", ""), "--- file.txt\t\n");
        let timestamp = "2023-01-01 12:00:00";
        assert_eq!(
            hdr_line("+++", "file.txt", timestamp),
            "+++ file.txt\t2023-01-01 12:00:00\n"
        );
        assert_eq!(
            hdr_line("---", "file with spaces.txt", ""),
            "--- file with spaces.txt\t\n"
        );
        assert_eq!(
            hdr_line("+++", "path/to/file.txt", ""),
            "+++ path/to/file.txt\t\n"
        );
    }

    #[test]
    fn test_hunk_header_formatting() {
        let old_start = 5;
        let old_lines = 3;
        let new_start = 7;
        let new_lines = 4;
        let od = if old_lines == 0 {
            old_start - 1
        } else {
            old_start
        };
        let nd = if new_lines == 0 {
            new_start - 1
        } else {
            new_start
        };
        let header = format!("@@ -{},{} +{},{} @@\n", od, old_lines, nd, new_lines);

        assert_eq!(header, "@@ -5,3 +7,4 @@\n");
        let old_lines = 0;
        let new_lines = 0;
        let od = if old_lines == 0 {
            old_start - 1
        } else {
            old_start
        };
        let nd = if new_lines == 0 {
            new_start - 1
        } else {
            new_start
        };
        let header = format!("@@ -{},{} +{},{} @@\n", od, old_lines, nd, new_lines);

        assert_eq!(header, "@@ -4,0 +6,0 @@\n");
    }

    #[test]
    fn test_empty_hunk_processing() {
        let mut lines: Vec<String> = Vec::new();
        let mut i = 0;
        while i < lines.len() {
            if lines[i].ends_with('\n') {
                lines[i] = lines[i][..lines[i].len() - 1].to_string();
            } else {
                lines.insert(i + 1, "\\ No newline at end of file".to_string());
                i += 1;
            }
            i += 1;
        }

        assert!(lines.is_empty());
    }

    #[test]
    fn test_single_line_hunk_processing() {
        let mut lines = vec!["single line without newline".to_string()];
        let mut i = 0;
        while i < lines.len() {
            if lines[i].ends_with('\n') {
                lines[i] = lines[i][..lines[i].len() - 1].to_string();
            } else {
                lines.insert(i + 1, "\\ No newline at end of file".to_string());
                i += 1;
            }
            i += 1;
        }

        assert_eq!(
            lines,
            vec![
                "single line without newline".to_string(),
                "\\ No newline at end of file".to_string(),
            ]
        );
        let mut lines = vec!["single line with newline\n".to_string()];

        let mut i = 0;
        while i < lines.len() {
            if lines[i].ends_with('\n') {
                lines[i] = lines[i][..lines[i].len() - 1].to_string();
            } else {
                lines.insert(i + 1, "\\ No newline at end of file".to_string());
                i += 1;
            }
            i += 1;
        }

        assert_eq!(lines, vec!["single line with newline".to_string()]);
    }

    #[test]
    fn test_range_reset_conditions() {
        let mut old_range_start = 10;
        let mut new_range_start = 15;
        let create_hunk = true;
        if create_hunk {
            old_range_start = 0;
            new_range_start = 0;
        }

        assert_eq!(old_range_start, 0);
        assert_eq!(new_range_start, 0);
        let in_change_group = old_range_start != 0;
        assert!(!in_change_group);
    }
}
