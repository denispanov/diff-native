use super::base::Tokeniser;
use super::css::CssTokenizer;

#[test]
fn test_empty_string() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();

    let tokens = tokenizer.tokenize("", &mut arena);
    assert_eq!(tokens.len(), 0);
}

#[test]
fn test_single_delimiters() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();
    let delimiters = vec!["{", "}", ":", ";", ","];

    for delimiter in delimiters {
        arena.clear();
        let tokens = tokenizer.tokenize(delimiter, &mut arena);
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].text, delimiter);
    }
}

#[test]
fn test_whitespace() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();
    let whitespace_cases = vec![" ", "  ", "\n", "\t", "\n\t "];

    for ws in whitespace_cases {
        arena.clear();
        let tokens = tokenizer.tokenize(ws, &mut arena);

        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].text, ws);
    }
}

#[test]
fn test_simple_css() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();
    let input = "div{color:red;}";
    let tokens = tokenizer.tokenize(input, &mut arena);
    assert_eq!(tokens.len(), 7);
    assert_eq!(tokens[0].text, "div");
    assert_eq!(tokens[1].text, "{");
    assert_eq!(tokens[2].text, "color");
    assert_eq!(tokens[3].text, ":");
    assert_eq!(tokens[4].text, "red");
    assert_eq!(tokens[5].text, ";");
    assert_eq!(tokens[6].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_css_with_whitespace() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();
    let input = "div {\n  color: red;\n}";
    let tokens = tokenizer.tokenize(input, &mut arena);
    assert_eq!(tokens.len(), 11);
    assert_eq!(tokens[0].text, "div");
    assert_eq!(tokens[1].text, " ");
    assert_eq!(tokens[2].text, "{");
    assert_eq!(tokens[3].text, "\n  ");
    assert_eq!(tokens[4].text, "color");
    assert_eq!(tokens[5].text, ":");
    assert_eq!(tokens[6].text, " ");
    assert_eq!(tokens[7].text, "red");
    assert_eq!(tokens[8].text, ";");
    assert_eq!(tokens[9].text, "\n");
    assert_eq!(tokens[10].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_multiple_selectors() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();
    let input = "div,span{color:red;}";
    let tokens = tokenizer.tokenize(input, &mut arena);
    assert_eq!(tokens.len(), 9);
    assert_eq!(tokens[0].text, "div");
    assert_eq!(tokens[1].text, ",");
    assert_eq!(tokens[2].text, "span");
    assert_eq!(tokens[3].text, "{");
    assert_eq!(tokens[4].text, "color");
    assert_eq!(tokens[5].text, ":");
    assert_eq!(tokens[6].text, "red");
    assert_eq!(tokens[7].text, ";");
    assert_eq!(tokens[8].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_multiple_properties() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();

    let input = "div{color:red;background:blue;}";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens.len(), 11);
    assert_eq!(tokens[0].text, "div");
    assert_eq!(tokens[1].text, "{");
    assert_eq!(tokens[2].text, "color");
    assert_eq!(tokens[3].text, ":");
    assert_eq!(tokens[4].text, "red");
    assert_eq!(tokens[5].text, ";");
    assert_eq!(tokens[6].text, "background");
    assert_eq!(tokens[7].text, ":");
    assert_eq!(tokens[8].text, "blue");
    assert_eq!(tokens[9].text, ";");
    assert_eq!(tokens[10].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_complex_css() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();
    let input = "@media screen { div { color: #ff0000; } }";
    let tokens = tokenizer.tokenize(input, &mut arena);
    assert_eq!(tokens[0].text, "@media");
    assert_eq!(tokens[1].text, " ");
    assert_eq!(tokens[2].text, "screen");
    assert_eq!(tokens[3].text, " ");
    assert_eq!(tokens[4].text, "{");
    assert_eq!(tokens[5].text, " ");
    assert_eq!(tokens[6].text, "div");
    assert_eq!(tokens[7].text, " ");
    assert_eq!(tokens[8].text, "{");
    assert_eq!(tokens[9].text, " ");
    assert_eq!(tokens[10].text, "color");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_pseudoclasses_and_elements() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();

    let input = "div::after{content:\"👍\";}";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens[0].text, "div");
    assert_eq!(tokens[1].text, ":");
    assert_eq!(tokens[2].text, ":");
    assert_eq!(tokens[3].text, "after");
    assert_eq!(tokens[4].text, "{");
    assert_eq!(tokens[5].text, "content");
    assert_eq!(tokens[6].text, ":");
    assert_eq!(tokens[7].text, "\"👍\"");
    assert_eq!(tokens[8].text, ";");
    assert_eq!(tokens[9].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_css_variables() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();

    let input = "div{color:var(--main-color);}";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens[0].text, "div");
    assert_eq!(tokens[1].text, "{");
    assert_eq!(tokens[2].text, "color");
    assert_eq!(tokens[3].text, ":");
    assert_eq!(tokens[4].text, "var(--main-color)");
    assert_eq!(tokens[5].text, ";");
    assert_eq!(tokens[6].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_css_comments() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();

    let input = "/* comment */ div{color:red;}";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens[0].text, "/*");
    assert_eq!(tokens[1].text, " ");
    assert_eq!(tokens[2].text, "comment");
    assert_eq!(tokens[3].text, " ");
    assert_eq!(tokens[4].text, "*/");
    assert_eq!(tokens[5].text, " ");
    assert_eq!(tokens[6].text, "div");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_mixed_whitespace() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();

    let input = "div  {\n\t  color :  red  ;  }";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens[0].text, "div");
    assert_eq!(tokens[1].text, "  ");
    assert_eq!(tokens[2].text, "{");
    assert_eq!(tokens[3].text, "\n\t  ");
    assert_eq!(tokens[4].text, "color");
    assert_eq!(tokens[5].text, " ");
    assert_eq!(tokens[6].text, ":");
    assert_eq!(tokens[7].text, "  ");
    assert_eq!(tokens[8].text, "red");
    assert_eq!(tokens[9].text, "  ");
    assert_eq!(tokens[10].text, ";");
    assert_eq!(tokens[11].text, "  ");
    assert_eq!(tokens[12].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_complex_selectors() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();
    let input = "div > p + ul, section article {display:flex}";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens[0].text, "div");
    assert_eq!(tokens[1].text, " ");
    assert_eq!(tokens[2].text, ">");
    assert_eq!(tokens[3].text, " ");
    assert_eq!(tokens[4].text, "p");
    assert_eq!(tokens[5].text, " ");
    assert_eq!(tokens[6].text, "+");
    assert_eq!(tokens[7].text, " ");
    assert_eq!(tokens[8].text, "ul");
    assert_eq!(tokens[9].text, ",");
    assert_eq!(tokens[10].text, " ");
    assert_eq!(tokens[11].text, "section");
    assert_eq!(tokens[12].text, " ");
    assert_eq!(tokens[13].text, "article");
    assert_eq!(tokens[14].text, " ");
    assert_eq!(tokens[15].text, "{");
    assert_eq!(tokens[16].text, "display");
    assert_eq!(tokens[17].text, ":");
    assert_eq!(tokens[18].text, "flex");
    assert_eq!(tokens[19].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}

#[test]
fn test_css_test_case() {
    let tokenizer = CssTokenizer::default();
    let mut arena = Vec::new();

    let input = ".test,#value .test{margin-left:50px;margin-right:-40px}";
    let tokens = tokenizer.tokenize(input, &mut arena);

    assert_eq!(tokens[0].text, ".test");
    assert_eq!(tokens[1].text, ",");
    assert_eq!(tokens[2].text, "#value");
    assert_eq!(tokens[3].text, " ");
    assert_eq!(tokens[4].text, ".test");
    assert_eq!(tokens[5].text, "{");
    assert_eq!(tokens[6].text, "margin-left");
    assert_eq!(tokens[7].text, ":");
    assert_eq!(tokens[8].text, "50px");
    assert_eq!(tokens[9].text, ";");
    assert_eq!(tokens[10].text, "margin-right");
    assert_eq!(tokens[11].text, ":");
    assert_eq!(tokens[12].text, "-40px");
    assert_eq!(tokens[13].text, "}");
    assert_eq!(tokenizer.join(tokens), input);
}
