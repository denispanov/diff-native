use super::base::{Options, Tokeniser};
use super::json::{canonicalize_value, JsonTokenizer};
use super::token::Token;

#[test]
fn test_empty_string() {
    let tokenizer = JsonTokenizer::default();
    let mut arena = Vec::new();
    let tokens = tokenizer.tokenize("", &mut arena);
    assert_eq!(tokens.len(), 0);
}

#[test]
fn test_single_line_json() {
    let tokenizer = JsonTokenizer::default();
    let mut arena = Vec::new();
    let input = r#"{"key":"value"}"#;
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 1);
    assert_eq!(tokens[0].text, r#"{"key":"value"}"#);
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_multiline_json() {
    let tokenizer = JsonTokenizer::default();
    let mut arena = Vec::new();
    let input = "{\n  \"key\": \"value\"\n}";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 3);
    assert_eq!(tokens[0].text, "{\n");
    assert_eq!(tokens[1].text, "  \"key\": \"value\"\n");
    assert_eq!(tokens[2].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_complex_json() {
    let tokenizer = JsonTokenizer::default();
    let mut arena = Vec::new();
    let input = "{\n  \"name\": \"John\",\n  \"age\": 30,\n  \"address\": {\n    \"street\": \"123 Main St\",\n    \"city\": \"Anytown\"\n  },\n  \"phones\": [\n    \"123-456-7890\",\n    \"098-765-4321\"\n  ]\n}";

    let tokens = tokenizer.tokenize(input, &mut arena);
    assert_eq!(tokens.len(), 12);
    assert_eq!(tokens[0].text, "{\n");
    assert_eq!(tokens[1].text, "  \"name\": \"John\",\n");
    assert_eq!(tokens[2].text, "  \"age\": 30,\n");
    assert_eq!(tokens[3].text, "  \"address\": {\n");
    assert_eq!(tokens[4].text, "    \"street\": \"123 Main St\",\n");
    assert_eq!(tokens[5].text, "    \"city\": \"Anytown\"\n");
    assert_eq!(tokens[6].text, "  },\n");
    assert_eq!(tokens[7].text, "  \"phones\": [\n");
    assert_eq!(tokens[8].text, "    \"123-456-7890\",\n");
    assert_eq!(tokens[9].text, "    \"098-765-4321\"\n");
    assert_eq!(tokens[10].text, "  ]\n");
    assert_eq!(tokens[11].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_trailing_comma_tolerance() {
    let tokenizer = JsonTokenizer::default();
    let options = Options::default();
    let a = Token {
        text: "  \"key\": \"value\"\n",
    };
    let b = Token {
        text: "  \"key\": \"value\",\n",
    };
    assert!(tokenizer.equals(&a, &b, &options));
    assert!(tokenizer.equals(&b, &a, &options));
    let c = Token {
        text: "  \"key\": \"value\"\r",
    };
    let d = Token {
        text: "  \"key\": \"value\",\r",
    };
    assert!(tokenizer.equals(&c, &d, &options));
}

#[test]
fn test_differing_content_not_equal() {
    let tokenizer = JsonTokenizer::default();
    let options = Options::default();
    let a = Token {
        text: "  \"key\": \"value1\"\n",
    };
    let b = Token {
        text: "  \"key\": \"value2\",\n",
    };
    assert!(!tokenizer.equals(&a, &b, &options));
}

#[test]
fn test_comma_in_middle_not_ignored() {
    let tokenizer = JsonTokenizer::default();
    let options = Options::default();
    let a = Token {
        text: "  \"key1\": \"value1\"\n",
    };
    let b = Token {
        text: "  \"key1\": \"value1\", \"key2\": \"value2\"\n",
    };
    assert!(!tokenizer.equals(&a, &b, &options));
}

#[test]
fn test_canonicalize_order() {
    let input = serde_json::json!({
        "c": 3,
        "a": 1,
        "b": 2
    });

    let expected = serde_json::json!({
        "a": 1,
        "b": 2,
        "c": 3
    });

    let canonical = canonicalize_value(&input);
    assert_eq!(canonical, expected);
    let serialized = serde_json::to_string(&canonical).unwrap();
    assert!(serialized.contains("\"a\":1"));
}

#[test]
fn test_canonicalize_nested() {
    let input = serde_json::json!({
        "outer": {
            "z": 3,
            "y": 2,
            "x": 1
        }
    });

    let expected = serde_json::json!({
        "outer": {
            "x": 1,
            "y": 2,
            "z": 3
        }
    });

    let canonical = canonicalize_value(&input);
    assert_eq!(canonical, expected);
}

#[test]
fn test_canonicalize_arrays() {
    let input = serde_json::json!([
        {"z": 1, "a": 2},
        {"b": 3, "c": 4}
    ]);

    let expected = serde_json::json!([
        {"a": 2, "z": 1},
        {"b": 3, "c": 4}
    ]);

    let canonical = canonicalize_value(&input);
    assert_eq!(canonical, expected);
}

#[test]
fn test_join_function() {
    let tokenizer = JsonTokenizer::default();
    let tokens = vec![
        Token { text: "{\n" },
        Token {
            text: "  \"key\": \"value\"\n",
        },
        Token { text: "}" },
    ];

    let expected = "{\n  \"key\": \"value\"\n}";
    let joined = tokenizer.join(&tokens);
    assert_eq!(joined, expected);
}

#[test]
fn test_real_world_example() {
    let tokenizer = JsonTokenizer::default();
    let mut arena = Vec::new();

    let input = "{\n  \"a\": 123,\n  \"b\": 456,\n  \"c\": 789\n}";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 5);
    assert_eq!(tokens[0].text, "{\n");
    assert_eq!(tokens[1].text, "  \"a\": 123,\n");
    assert_eq!(tokens[2].text, "  \"b\": 456,\n");
    assert_eq!(tokens[3].text, "  \"c\": 789\n");
    assert_eq!(tokens[4].text, "}");
    let options = Options::default();
    let a = Token {
        text: "  \"a\": 123\n",
    };
    let b = Token {
        text: "  \"a\": 123,\n",
    };
    assert!(tokenizer.equals(&a, &b, &options));
}
