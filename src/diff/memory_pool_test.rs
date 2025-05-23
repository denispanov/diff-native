use super::base::{Diff, Options};
use super::character::CharTokenizer;
use super::memory_pool::PooledDiff;
use std::thread;

#[test]
fn test_pooled_diff_basic() {
    let tokenizer = CharTokenizer;
    let opts = Options::default();

    let mut diff = PooledDiff::new(tokenizer, opts);
    let result = diff.diff("abc", "axc");

    let original_diff = Diff::new(CharTokenizer, Options::default());
    let original_result = original_diff.diff("abc", "axc");

    assert_eq!(result.len(), original_result.len());

    if result.len() >= 3 {
        assert_eq!(result[0].value, "a");
        assert!(!result[0].added && !result[0].removed);
        let has_removed_b = result.iter().any(|c| c.value == "b" && c.removed);
        let has_added_x = result.iter().any(|c| c.value == "x" && c.added);
        assert!(has_removed_b && has_added_x);
        assert_eq!(result.last().unwrap().value, "c");
        assert!(!result.last().unwrap().added && !result.last().unwrap().removed);
    }
}

#[test]
fn test_multiple_concurrent_diffs() {
    let test_data = vec![
        ("thread_0_text_1", "thread_0_text_2"),
        ("thread_1_text_1", "thread_1_text_2"),
        ("thread_2_text_1", "thread_2_text_2"),
        ("thread_3_text_1", "thread_3_text_2"),
    ];

    let handles: Vec<_> = test_data
        .into_iter()
        .map(|(text1, text2)| {
            thread::spawn(move || {
                let tokenizer = CharTokenizer;
                let opts = Options::default();

                let mut diff = PooledDiff::new(tokenizer, opts);
                diff.diff(text1, text2)
            })
        })
        .collect();

    for handle in handles {
        let result = handle.join().unwrap();
        assert!(!result.is_empty());
    }
}
