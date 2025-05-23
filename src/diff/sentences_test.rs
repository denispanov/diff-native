#![cfg(test)]

use crate::diff::base::{Options, Tokeniser};
use crate::diff::sentences::SentenceTokenizer;
use crate::diff::token::Token;

struct TestCase<'a> {
    name: &'a str,
    input: &'a str,
    expected_tokens: Vec<&'a str>,
}

#[test]
fn test_sentence_tokenizer_matches_expected() {
    let test_cases = vec![
        TestCase {
            name: "Empty string",
            input: "",
            expected_tokens: vec![],
        },
        TestCase {
            name: "Empty string with trailing space",
            input: " ",
            expected_tokens: vec![" "],
        },
        TestCase {
            name: "Single sentence with period",
            input: "This is a sentence.",
            expected_tokens: vec!["This is a sentence."],
        },
        TestCase {
            name: "Single sentence without ending punctuation",
            input: "This is a sentence without a period",
            expected_tokens: vec!["This is a sentence without a period"],
        },
        TestCase {
            name: "Two sentences with periods",
            input: "First sentence. Second sentence.",
            expected_tokens: vec!["First sentence.", " ", "Second sentence."],
        },
        TestCase {
            name: "Sentences with different terminal punctuation",
            input: "Hello! How are you?",
            expected_tokens: vec!["Hello!", " ", "How are you?"],
        },
        TestCase {
            name: "Multiple sentences with mixed terminal punctuation",
            input: "First sentence. Second sentence! Third sentence?",
            expected_tokens: vec![
                "First sentence.",
                " ",
                "Second sentence!",
                " ",
                "Third sentence?",
            ],
        },
        TestCase {
            name: "Sentences with newline separator",
            input: "First sentence.\nSecond sentence.",
            expected_tokens: vec!["First sentence.", "\n", "Second sentence."],
        },
        TestCase {
            name: "Sentences with carriage return + newline",
            input: "First sentence.\r\nSecond sentence.",
            expected_tokens: vec!["First sentence.", "\r\n", "Second sentence."],
        },
        TestCase {
            name: "Sentences with multiple newlines",
            input: "First sentence.\n\nSecond sentence.",
            expected_tokens: vec!["First sentence.", "\n\n", "Second sentence."],
        },
        TestCase {
            name: "Sentences with double space",
            input: "First sentence.  Second sentence.",
            expected_tokens: vec!["First sentence.", "  ", "Second sentence."],
        },
        TestCase {
            name: "Sentences with multiple spaces",
            input: "First sentence.    Second sentence.",
            expected_tokens: vec!["First sentence.", "    ", "Second sentence."],
        },
        TestCase {
            name: "Text with abbreviations",
            input: "Mr. Smith went to Washington, D.C. He had a meeting.",
            expected_tokens: vec![
                "Mr.",
                " ",
                "Smith went to Washington, D.C.",
                " ",
                "He had a meeting.",
            ],
        },
        TestCase {
            name: "Period in decimal number",
            input: "The price is 9.99. That's a good deal.",
            expected_tokens: vec!["The price is 9.99.", " ", "That's a good deal."],
        },
        TestCase {
            name: "Period in domain name",
            input: "Visit our website at example.com. Thanks!",
            expected_tokens: vec!["Visit our website at example.com.", " ", "Thanks!"],
        },
        TestCase {
            name: "Quote with period inside",
            input: "He said \"This is great.\" Then he left.",
            expected_tokens: vec!["He said \"This is great.\" Then he left."],
        },
        TestCase {
            name: "Quote with question mark inside",
            input: "She asked, \"What time is it?\" He didn't know.",
            expected_tokens: vec!["She asked, \"What time is it?\" He didn't know."],
        },
        TestCase {
            name: "Multiple exclamation marks",
            input: "Wow!!! That's amazing. Don't you think??",
            expected_tokens: vec!["Wow!!!", " ", "That's amazing.", " ", "Don't you think??"],
        },
        TestCase {
            name: "Mixed exclamation and question marks",
            input: "Really?! I didn't know that.",
            expected_tokens: vec!["Really?!", " ", "I didn't know that."],
        },
        TestCase {
            name: "Sentence with space at the end",
            input: "Sentence with space at the end. ",
            expected_tokens: vec!["Sentence with space at the end.", " ", ""],
        },
        TestCase {
            name: "Sentence with space at the beginning",
            input: " Sentence with space at the beginning.",
            expected_tokens: vec![" Sentence with space at the beginning."],
        },
        TestCase {
            name: "Just punctuation",
            input: ".!?",
            expected_tokens: vec![".!?"],
        },
        TestCase {
            name: "Ellipsis at the beginning",
            input: "...and then what happened?",
            expected_tokens: vec!["...and then what happened?"],
        },
        TestCase {
            name: "Ellipsis at the end",
            input: "Ends with an ellipsis...",
            expected_tokens: vec!["Ends with an ellipsis..."],
        },
        TestCase {
            name: "Periods without spaces",
            input: "First.Second.Third.",
            expected_tokens: vec!["First.Second.Third."],
        },
        TestCase {
            name: "Complex parentheses and punctuation",
            input: "This (has parentheses). And this (is complex)!",
            expected_tokens: vec!["This (has parentheses).", " ", "And this (is complex)!"],
        },
        TestCase {
            name: "Period followed by quote mark",
            input: "He said, \"The end.\" Then he left.",
            expected_tokens: vec!["He said, \"The end.\" Then he left."],
        },
        TestCase {
            name: "Question mark followed by quote mark",
            input: "He asked, \"Ready?\" Then he left.",
            expected_tokens: vec!["He asked, \"Ready?\" Then he left."],
        },
    ];

    for test_case in test_cases {
        let tokenizer = SentenceTokenizer::default();
        let mut arena = Vec::new();

        let tokens = tokenizer.tokenize(test_case.input, &mut arena);

        assert_eq!(
            tokens.len(),
            test_case.expected_tokens.len(),
            "Test case '{}': Tokenization of '{}' produced wrong number of tokens. Expected {}, got {}",
            test_case.name,
            test_case.input,
            test_case.expected_tokens.len(),
            tokens.len()
        );

        for (i, expected) in test_case.expected_tokens.iter().enumerate() {
            assert_eq!(
                tokens[i].text, *expected,
                "Test case '{}': Token {} for '{}' was wrong. Expected '{:?}', got '{:?}'",
                test_case.name, i, test_case.input, expected, tokens[i].text
            );
        }
        let joined = tokenizer.join(tokens);
        assert_eq!(
            joined, test_case.input,
            "Test case '{}': Join failed for '{}'. Got '{}' instead",
            test_case.name, test_case.input, joined
        );
    }
}
#[test]
fn test_sentence_tokenizer_equals_with_options() {
    struct EqualsTestCase<'a> {
        name: &'a str,
        left: &'a str,
        right: &'a str,
        diff_options: Options,
        expected_result: bool,
    }

    let test_cases = vec![
        EqualsTestCase {
            name: "Case sensitive - matching",
            left: "This is a test.",
            right: "This is a test.",
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: true,
        },
        EqualsTestCase {
            name: "Case sensitive - non-matching",
            left: "This is a test.",
            right: "THIS IS A TEST.",
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: false,
        },
        EqualsTestCase {
            name: "Case insensitive - matching",
            left: "This is a test.",
            right: "THIS IS A TEST.",
            diff_options: Options {
                ignore_case: true,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: true,
        },
        EqualsTestCase {
            name: "Different terminal punctuation",
            left: "This is a test.",
            right: "This is a test!",
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: false,
        },
        EqualsTestCase {
            name: "Different whitespace",
            left: "This is a test. ",
            right: "This is a test.",
            diff_options: Options {
                ignore_case: false,
                one_change_per_token: false,
                max_edit_length: None,
            },
            expected_result: false,
        },
    ];

    for test_case in test_cases {
        let tokenizer = SentenceTokenizer::default();

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
fn test_sentence_tokenizer_join_edge_cases() {
    let tokenizer = SentenceTokenizer::default();
    let empty_tokens: Vec<Token> = vec![];
    assert_eq!(tokenizer.join(&empty_tokens), "");
    let single_token = vec![Token {
        text: "This is a test.",
    }];
    assert_eq!(tokenizer.join(&single_token), "This is a test.");
    let mixed_tokens = vec![
        Token {
            text: "First sentence.",
        },
        Token { text: "  " },
        Token {
            text: "Second sentence!",
        },
        Token { text: "\n\n" },
        Token {
            text: "Third sentence?",
        },
    ];
    assert_eq!(
        tokenizer.join(&mixed_tokens),
        "First sentence.  Second sentence!\n\nThird sentence?"
    );
    let tokens_with_empty = vec![
        Token {
            text: "First sentence.",
        },
        Token { text: "" },
        Token {
            text: "Second sentence.",
        },
    ];
    assert_eq!(
        tokenizer.join(&tokens_with_empty),
        "First sentence.Second sentence."
    );
}
