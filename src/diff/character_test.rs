use super::base::{Options, Tokeniser};
use super::character::CharTokenizer;
use super::token::Token;

#[test]
fn test_empty_string() {
    let tokenizer = CharTokenizer;
    let mut arena = Vec::new();

    let tokens = tokenizer.tokenize("", &mut arena);
    assert_eq!(tokens.len(), 0);
}

#[test]
fn test_ascii_characters() {
    let tokenizer = CharTokenizer;
    let mut arena = Vec::new();

    let input = "abc";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 3);
    assert_eq!(tokens[0].text, "a");
    assert_eq!(tokens[1].text, "b");
    assert_eq!(tokens[2].text, "c");

    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_whitespace_characters() {
    let tokenizer = CharTokenizer;
    let mut arena = Vec::new();

    let inputs = [" ", "  ", "\n", "\t", "\r"];

    for input in inputs {
        arena.clear();
        let tokens = tokenizer.tokenize(input, &mut arena);

        assert_eq!(tokens.len(), input.chars().count());
        for (i, ch) in input.chars().enumerate() {
            assert_eq!(tokens[i].text, ch.to_string());
        }

        assert_eq!(tokenizer.join(tokens), input);
    }
}

#[test]
fn test_mixed_whitespace_and_text() {
    let tokenizer = CharTokenizer;
    let mut arena = Vec::new();

    let input = "a b c";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 5);
    assert_eq!(tokens[0].text, "a");
    assert_eq!(tokens[1].text, " ");
    assert_eq!(tokens[2].text, "b");
    assert_eq!(tokens[3].text, " ");
    assert_eq!(tokens[4].text, "c");

    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_unicode_characters() {
    let tokenizer = CharTokenizer;
    let mut arena = Vec::new();

    let input = "你好世界";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 4);
    assert_eq!(tokens[0].text, "你");
    assert_eq!(tokens[1].text, "好");
    assert_eq!(tokens[2].text, "世");
    assert_eq!(tokens[3].text, "界");

    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_emoji_characters() {
    let tokenizer = CharTokenizer;
    let mut arena = Vec::new();

    let input = "😀😁😂";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 3);
    assert_eq!(tokens[0].text, "😀");
    assert_eq!(tokens[1].text, "😁");
    assert_eq!(tokens[2].text, "😂");

    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_surrogate_pairs() {
    let tokenizer = CharTokenizer;
    let mut arena = Vec::new();

    let input = "𝟘𝟙𝟚𝟛";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 4);
    assert_eq!(tokens[0].text, "𝟘");
    assert_eq!(tokens[1].text, "𝟙");
    assert_eq!(tokens[2].text, "𝟚");
    assert_eq!(tokens[3].text, "𝟛");

    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_complex_emoji_sequences() {
    let tokenizer = CharTokenizer;
    let mut arena = Vec::new();

    let input = "👨‍👩‍👧‍👦";
    let expected_tokens = ["👨", "‍", "👩", "‍", "👧", "‍", "👦"];

    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), expected_tokens.len());
    for (i, &expected) in expected_tokens.iter().enumerate() {
        assert_eq!(tokens[i].text, expected);
    }

    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_combining_characters() {
    let tokenizer = CharTokenizer;

    let input1 = "é";
    let tokens1;
    {
        let mut arena1 = Vec::new();
        tokens1 = tokenizer.tokenize(input1, &mut arena1).to_vec();
        assert_eq!(tokens1.len(), 1);
        assert_eq!(tokens1[0].text, "é");
    }

    let input2 = "e\u{0301}"; // "é" decomposed
    let tokens2;
    {
        let mut arena2 = Vec::new();
        tokens2 = tokenizer.tokenize(input2, &mut arena2).to_vec();
        assert_eq!(tokens2.len(), 2);
        assert_eq!(tokens2[0].text, "e");
        assert_eq!(tokens2[1].text, "\u{0301}");
    }

    assert_eq!(tokenizer.join(&tokens1), input1);
    assert_eq!(tokenizer.join(&tokens2), input2);
}

#[test]
fn test_special_characters() {
    let tokenizer = CharTokenizer;
    let mut arena = Vec::new();

    let input = "abc123!@#$";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 10);
    assert_eq!(tokens[0].text, "a");
    assert_eq!(tokens[1].text, "b");
    assert_eq!(tokens[2].text, "c");
    assert_eq!(tokens[3].text, "1");
    assert_eq!(tokens[4].text, "2");
    assert_eq!(tokens[5].text, "3");
    assert_eq!(tokens[6].text, "!");
    assert_eq!(tokens[7].text, "@");
    assert_eq!(tokens[8].text, "#");
    assert_eq!(tokens[9].text, "$");

    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_mixed_characters() {
    let tokenizer = CharTokenizer;
    let mut arena = Vec::new();

    let input = "a你b😀c";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 5);
    assert_eq!(tokens[0].text, "a");
    assert_eq!(tokens[1].text, "你");
    assert_eq!(tokens[2].text, "b");
    assert_eq!(tokens[3].text, "😀");
    assert_eq!(tokens[4].text, "c");

    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_case_sensitive_equals() {
    let tokenizer = CharTokenizer;
    let options = Options {
        ignore_case: false,
        one_change_per_token: false,
        max_edit_length: None,
    };

    let a1 = Token { text: "a" };
    let a2 = Token { text: "a" };
    assert!(tokenizer.equals(&a1, &a2, &options));

    let a_lower = Token { text: "a" };
    let a_upper = Token { text: "A" };
    assert!(!tokenizer.equals(&a_lower, &a_upper, &options));

    let a = Token { text: "a" };
    let b = Token { text: "b" };
    assert!(!tokenizer.equals(&a, &b, &options));
}

#[test]
fn test_case_insensitive_equals() {
    let tokenizer = CharTokenizer;
    let options = Options {
        ignore_case: true,
        one_change_per_token: false,
        max_edit_length: None,
    };

    let a1 = Token { text: "a" };
    let a2 = Token { text: "a" };
    assert!(tokenizer.equals(&a1, &a2, &options));

    let a_lower = Token { text: "a" };
    let a_upper = Token { text: "A" };
    assert!(tokenizer.equals(&a_lower, &a_upper, &options));

    let a = Token { text: "a" };
    let b = Token { text: "b" };
    assert!(!tokenizer.equals(&a, &b, &options));

    let unicode1 = Token { text: "你" };
    let unicode2 = Token { text: "你" };
    assert!(tokenizer.equals(&unicode1, &unicode2, &options));

    let unicode_diff = Token { text: "好" };
    assert!(!tokenizer.equals(&unicode1, &unicode_diff, &options));
}

#[test]
fn test_character_diff_cases() {
    let tokenizer = CharTokenizer;

    let input1 = "Old Value.";
    {
        let mut arena1 = Vec::new();
        let tokens1 = tokenizer.tokenize(input1, &mut arena1);
        assert_eq!(tokens1.len(), input1.chars().count());
    }

    let input2 = "New ValueMoreData.";
    {
        let mut arena2 = Vec::new();
        let tokens2 = tokenizer.tokenize(input2, &mut arena2);
        assert_eq!(tokens2.len(), input2.chars().count());
    }

    let input3 = "𝟘𝟙𝟚𝟛";
    {
        let mut arena3 = Vec::new();
        let tokens3 = tokenizer.tokenize(input3, &mut arena3);
        assert_eq!(tokens3.len(), 4);
    }
}
