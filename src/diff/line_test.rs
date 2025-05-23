#![cfg(test)]

use crate::diff::base::{Options, Tokeniser};
use crate::diff::line::LineTokenizer;
use crate::diff::token::Token;

struct TestCase<'a> {
    name: &'a str,
    input: &'a str,
    options: TokenizerOptions,
    expected_tokens: Vec<&'a str>,
}

struct TokenizerOptions {
    newline_is_token: bool,
    strip_trailing_cr: bool,
    ignore_whitespace: bool,
    ignore_newline_at_eof: bool,
}

impl Default for TokenizerOptions {
    fn default() -> Self {
        Self {
            newline_is_token: false,
            strip_trailing_cr: false,
            ignore_whitespace: false,
            ignore_newline_at_eof: false,
        }
    }
}

fn preprocess_input(input: &str, strip_trailing_cr: bool) -> String {
    if strip_trailing_cr {
        input.replace("\r\n", "\n")
    } else {
        input.to_string()
    }
}

#[test]
fn test_line_tokenizer_behavior() {
    let test_cases = vec![
        TestCase {
            name: "Empty string",
            input: "",
            options: TokenizerOptions::default(),
            expected_tokens: vec![],
        },
        TestCase {
            name: "Single line without newline",
            input: "hello",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["hello"],
        },
        TestCase {
            name: "Single line with newline",
            input: "hello\n",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["hello\n"],
        },
        TestCase {
            name: "Two lines",
            input: "hello\nworld",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["hello\n", "world"],
        },
        TestCase {
            name: "Two lines with trailing newline",
            input: "hello\nworld\n",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["hello\n", "world\n"],
        },
        TestCase {
            name: "Three lines with empty middle line",
            input: "hello\n\nworld",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["hello\n", "\n", "world"],
        },
        TestCase {
            name: "Leading empty line",
            input: "\nhello\nworld",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["\n", "hello\n", "world"],
        },
        TestCase {
            name: "Windows line endings",
            input: "hello\r\nworld",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["hello\r\n", "world"],
        },
        TestCase {
            name: "Windows line endings with trailing newline",
            input: "hello\r\nworld\r\n",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["hello\r\n", "world\r\n"],
        },
        TestCase {
            name: "Mixed content with whitespace",
            input: "  hello  \n  world  ",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["  hello  \n", "  world  "],
        },
        TestCase {
            name: "Multiple lines",
            input: "line 1\nline 2\nline 3\nline 4\n",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["line 1\n", "line 2\n", "line 3\n", "line 4\n"],
        },
        TestCase {
            name: "Empty string with newlineIsToken",
            input: "",
            options: TokenizerOptions {
                newline_is_token: true,
                ..Default::default()
            },
            expected_tokens: vec![],
        },
        TestCase {
            name: "Single line without newline with newlineIsToken",
            input: "hello",
            options: TokenizerOptions {
                newline_is_token: true,
                ..Default::default()
            },
            expected_tokens: vec!["hello"],
        },
        TestCase {
            name: "Single line with newline with newlineIsToken",
            input: "hello\n",
            options: TokenizerOptions {
                newline_is_token: true,
                ..Default::default()
            },
            expected_tokens: vec!["hello", "\n"],
        },
        TestCase {
            name: "Two lines with newlineIsToken",
            input: "hello\nworld",
            options: TokenizerOptions {
                newline_is_token: true,
                ..Default::default()
            },
            expected_tokens: vec!["hello", "\n", "world"],
        },
        TestCase {
            name: "Three lines with empty middle line with newlineIsToken",
            input: "hello\n\nworld",
            options: TokenizerOptions {
                newline_is_token: true,
                ..Default::default()
            },
            expected_tokens: vec!["hello", "\n", "", "\n", "world"],
        },
        TestCase {
            name: "Leading empty line with newlineIsToken",
            input: "\nhello\nworld",
            options: TokenizerOptions {
                newline_is_token: true,
                ..Default::default()
            },
            expected_tokens: vec!["", "\n", "hello", "\n", "world"],
        },
        TestCase {
            name: "Windows line endings with newlineIsToken",
            input: "hello\r\nworld",
            options: TokenizerOptions {
                newline_is_token: true,
                ..Default::default()
            },
            expected_tokens: vec!["hello", "\r\n", "world"],
        },
        TestCase {
            name: "Windows line endings with stripTrailingCr",
            input: "hello\r\nworld",
            options: TokenizerOptions {
                strip_trailing_cr: true,
                ..Default::default()
            },
            expected_tokens: vec!["hello\n", "world"],
        },
        TestCase {
            name: "Windows line endings with trailing newline with stripTrailingCr",
            input: "hello\r\nworld\r\n",
            options: TokenizerOptions {
                strip_trailing_cr: true,
                ..Default::default()
            },
            expected_tokens: vec!["hello\n", "world\n"],
        },
        TestCase {
            name: "Windows line endings with newlineIsToken and stripTrailingCr",
            input: "hello\r\nworld",
            options: TokenizerOptions {
                newline_is_token: true,
                strip_trailing_cr: true,
                ..Default::default()
            },
            expected_tokens: vec!["hello", "\n", "world"],
        },
    ];

    for test_case in test_cases {
        let preprocessed = preprocess_input(test_case.input, test_case.options.strip_trailing_cr);
        let input = preprocessed.as_str();

        let tokenizer = LineTokenizer::with_options(
            test_case.options.newline_is_token,
            test_case.options.ignore_whitespace,
            test_case.options.ignore_newline_at_eof,
        );

        let mut arena = Vec::new();
        let tokens = tokenizer.tokenize(input, &mut arena);

        assert_eq!(
            tokens.len(),
            test_case.expected_tokens.len(),
            "Test case '{}': Expected {} tokens, got {}",
            test_case.name,
            test_case.expected_tokens.len(),
            tokens.len()
        );

        for (i, expected) in test_case.expected_tokens.iter().enumerate() {
            assert_eq!(
                tokens[i].text, *expected,
                "Test case '{}': Token {} mismatch. Expected '{:?}', got '{:?}'",
                test_case.name, i, expected, tokens[i].text
            );
        }

        let joined = tokenizer.join(tokens);
        assert_eq!(
            joined, input,
            "Test case '{}': Join verification failed",
            test_case.name
        );
    }
}

#[test]
fn test_line_tokenizer_equals_with_options() {
    struct EqualsTestCase<'a> {
        name: &'a str,
        left: &'a str,
        right: &'a str,
        tokenizer_options: TokenizerOptions,
        diff_options: Options,
        expected_result: bool,
    }

    let test_cases = vec![
        EqualsTestCase {
            name: "Case sensitive - matching",
            left: "hello\n",
            right: "hello\n",
            tokenizer_options: TokenizerOptions::default(),
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: true,
        },
        EqualsTestCase {
            name: "Case sensitive - non-matching",
            left: "Hello\n",
            right: "hello\n",
            tokenizer_options: TokenizerOptions::default(),
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: false,
        },
        EqualsTestCase {
            name: "Case insensitive - matching",
            left: "Hello\n",
            right: "hello\n",
            tokenizer_options: TokenizerOptions::default(),
            diff_options: Options {
                ignore_case: true,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: true,
        },
        EqualsTestCase {
            name: "Ignore whitespace - matching with different whitespace",
            left: "  hello  \n",
            right: "hello\n",
            tokenizer_options: TokenizerOptions {
                ignore_whitespace: true,
                ..Default::default()
            },
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: true,
        },
        EqualsTestCase {
            name: "Respect whitespace - non-matching with different whitespace",
            left: "  hello  \n",
            right: "hello\n",
            tokenizer_options: TokenizerOptions::default(),
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: false,
        },
        EqualsTestCase {
            name: "Ignore newline at EOF - matching with/without trailing newline",
            left: "hello\n",
            right: "hello",
            tokenizer_options: TokenizerOptions {
                ignore_newline_at_eof: true,
                ..Default::default()
            },
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: true,
        },
        EqualsTestCase {
            name: "Respect newline at EOF - non-matching with/without trailing newline",
            left: "hello\n",
            right: "hello",
            tokenizer_options: TokenizerOptions::default(),
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: false,
        },
        EqualsTestCase {
            name: "newline_is_token with whitespace - compares correctly",
            left: "hello\n",
            right: "hello\n",
            tokenizer_options: TokenizerOptions {
                newline_is_token: true,
                ignore_whitespace: true,
                ..Default::default()
            },
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: true,
        },
    ];

    for test_case in test_cases {
        let tokenizer = LineTokenizer::with_options(
            test_case.tokenizer_options.newline_is_token,
            test_case.tokenizer_options.ignore_whitespace,
            test_case.tokenizer_options.ignore_newline_at_eof,
        );

        let tok_left = Token {
            text: test_case.left,
        };
        let tok_right = Token {
            text: test_case.right,
        };

        let result = tokenizer.equals(&tok_left, &tok_right, &test_case.diff_options);

        assert_eq!(
            result, test_case.expected_result,
            "Test case '{}': equals() returned {}, expected {}",
            test_case.name, result, test_case.expected_result
        );
    }
}

#[test]
fn test_line_tokenizer_edge_cases() {
    struct EdgeCase<'a> {
        name: &'a str,
        input: &'a str,
        options: TokenizerOptions,
        expected_tokens: Vec<&'a str>,
    }

    let test_cases = vec![
        EdgeCase {
            name: "Mixed line endings",
            input: "line1\nline2\r\nline3\n",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["line1\n", "line2\r\n", "line3\n"],
        },
        EdgeCase {
            name: "Mixed line endings with stripTrailingCr",
            input: "line1\nline2\r\nline3\n",
            options: TokenizerOptions {
                strip_trailing_cr: true,
                ..Default::default()
            },
            expected_tokens: vec!["line1\n", "line2\n", "line3\n"],
        },
        EdgeCase {
            name: "Multiple consecutive newlines",
            input: "line1\n\n\nline2",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["line1\n", "\n", "\n", "line2"],
        },
        EdgeCase {
            name: "Multiple consecutive newlines with newlineIsToken",
            input: "line1\n\n\nline2",
            options: TokenizerOptions {
                newline_is_token: true,
                ..Default::default()
            },
            expected_tokens: vec!["line1", "\n", "", "\n", "", "\n", "line2"],
        },
        EdgeCase {
            name: "Only whitespace content",
            input: "  \n  \n  ",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["  \n", "  \n", "  "],
        },
        EdgeCase {
            name: "Only whitespace content with ignoreWhitespace",
            input: "  \n  \n  ",
            options: TokenizerOptions {
                ignore_whitespace: true,
                ..Default::default()
            },
            expected_tokens: vec!["  \n", "  \n", "  "],
        },
        EdgeCase {
            name: "Only newlines",
            input: "\n\n\n",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["\n", "\n", "\n"],
        },
        EdgeCase {
            name: "Carriage return without newline",
            input: "line1\rline2",
            options: TokenizerOptions::default(),
            expected_tokens: vec!["line1\rline2"],
        },
    ];

    for test_case in test_cases {
        let preprocessed = preprocess_input(test_case.input, test_case.options.strip_trailing_cr);
        let input = preprocessed.as_str();

        let tokenizer = LineTokenizer::with_options(
            test_case.options.newline_is_token,
            test_case.options.ignore_whitespace,
            test_case.options.ignore_newline_at_eof,
        );

        let mut arena = Vec::new();
        let tokens = tokenizer.tokenize(input, &mut arena);

        assert_eq!(
            tokens.len(),
            test_case.expected_tokens.len(),
            "Test case '{}': Expected {} tokens, got {}",
            test_case.name,
            test_case.expected_tokens.len(),
            tokens.len()
        );

        for (i, expected) in test_case.expected_tokens.iter().enumerate() {
            assert_eq!(
                tokens[i].text, *expected,
                "Test case '{}': Token {} mismatch. Expected '{:?}', got '{:?}'",
                test_case.name, i, expected, tokens[i].text
            );
        }

        let joined = tokenizer.join(tokens);
        assert_eq!(
            joined, input,
            "Test case '{}': Join verification failed",
            test_case.name
        );
    }
}
