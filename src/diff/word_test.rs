#![cfg(test)]

use crate::diff::base::{Options, Tokeniser};
use crate::diff::token::Token;
use crate::diff::word::WordTokenizer;

struct TestCase<'a> {
    #[allow(dead_code)]
    name: &'a str,
    input: &'a str,
    expected_tokens: Vec<&'a str>,
}

#[test]
fn test_word_tokenizer_standard_behavior() {
    let test_cases = vec![
        TestCase {
            name: "Empty string",
            input: "",
            expected_tokens: vec![],
        },
        TestCase {
            name: "Single word",
            input: "hello",
            expected_tokens: vec!["hello"],
        },
        TestCase {
            name: "Two words with space",
            input: "hello world",
            expected_tokens: vec!["hello ", " world"],
        },
        TestCase {
            name: "Words with punctuation",
            input: "hello, world!",
            expected_tokens: vec!["hello", ", ", " world", "!"],
        },
        TestCase {
            name: "Multiple spaces",
            input: "hello   world",
            expected_tokens: vec!["hello   ", "   world"],
        },
        TestCase {
            name: "Leading spaces",
            input: "   hello world",
            expected_tokens: vec!["   hello ", " world"],
        },
        TestCase {
            name: "Trailing spaces",
            input: "hello world   ",
            expected_tokens: vec!["hello ", " world   "],
        },
        TestCase {
            name: "With newline",
            input: "hello\nworld",
            expected_tokens: vec!["hello\n", "\nworld"],
        },
        TestCase {
            name: "Multiple newlines",
            input: "hello\n\nworld",
            expected_tokens: vec!["hello\n\n", "\n\nworld"],
        },
        TestCase {
            name: "Mixed newlines and spaces",
            input: "hello \n \n world",
            expected_tokens: vec!["hello \n \n ", " \n \n world"],
        },
        TestCase {
            name: "With tabs",
            input: "hello\tworld",
            expected_tokens: vec!["hello\t", "\tworld"],
        },
        TestCase {
            name: "Multiple punctuation",
            input: "hello...world!",
            expected_tokens: vec!["hello", ".", ".", ".", "world", "!"],
        },
        TestCase {
            name: "Punctuation with spaces",
            input: "hello . . . world!",
            expected_tokens: vec!["hello ", " . ", " . ", " . ", " world", "!"],
        },
        TestCase {
            name: "Complex example",
            input: "foo bar baz! Qux  wibbly",
            expected_tokens: vec!["foo ", " bar ", " baz", "! ", " Qux  ", "  wibbly"],
        },
        TestCase {
            name: "Parentheses",
            input: "hello (world)",
            expected_tokens: vec!["hello ", " (", "world", ")"],
        },
        TestCase {
            name: "Punctuation only",
            input: ".,;:!?",
            expected_tokens: vec![".", ",", ";", ":", "!", "?"],
        },
    ];

    for test_case in test_cases {
        let tokenizer = WordTokenizer::default();
        let mut arena = Vec::new();

        let tokens = tokenizer.tokenize(test_case.input, &mut arena);

        assert_eq!(
            tokens.len(),
            test_case.expected_tokens.len(),
            "Tokenization of '{}' produced wrong number of tokens. Expected {}, got {}",
            test_case.input,
            test_case.expected_tokens.len(),
            tokens.len()
        );

        for (i, expected) in test_case.expected_tokens.iter().enumerate() {
            assert_eq!(
                tokens[i].text, *expected,
                "Token {} for '{}' was wrong. Expected '{}', got '{}'",
                i, test_case.input, expected, tokens[i].text
            );
        }

        let joined = tokenizer.join(tokens);
        assert_eq!(
            joined, test_case.input,
            "Join failed for '{}'. Got '{}' instead",
            test_case.input, joined
        );
    }
}

#[test]
fn test_word_tokenizer_equals_behavior() {
    let tokenizer = WordTokenizer::default();
    let options = Options {
        ignore_case: false,
        one_change_per_token: false,
        max_edit_length: None,
    };

    assert!(tokenizer.equals(
        &Token { text: "hello " },
        &Token { text: "hello" },
        &options
    ));

    assert!(!tokenizer.equals(&Token { text: "hello" }, &Token { text: "world" }, &options));

    assert!(!tokenizer.equals(&Token { text: "Hello" }, &Token { text: "hello" }, &options));

    let case_insensitive = Options {
        ignore_case: true,
        one_change_per_token: false,
        max_edit_length: None,
    };

    assert!(tokenizer.equals(
        &Token { text: "Hello" },
        &Token { text: "hello" },
        &case_insensitive
    ));
}

#[test]
fn test_word_tokenizer_join_behavior() {
    let tokenizer = WordTokenizer::default();

    let tokens = vec![
        Token { text: "hello " },
        Token { text: " world " },
        Token { text: " goodbye" },
    ];

    assert_eq!(tokenizer.join(&tokens), "hello world goodbye");

    let tokens_with_spaces = vec![Token { text: "  hello  " }, Token { text: "  world  " }];

    assert_eq!(tokenizer.join(&tokens_with_spaces), "  hello  world  ");
}
