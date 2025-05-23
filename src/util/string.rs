use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref WS_RE: Regex = Regex::new(r"\s").unwrap();
}

pub fn longest_common_prefix<'a>(a: &'a str, b: &'a str) -> &'a str {
    let mut n = 0;
    for (ca, cb) in a.chars().zip(b.chars()) {
        if ca == cb {
            n += ca.len_utf8();
        } else {
            break;
        }
    }
    &a[..n]
}

pub fn longest_common_suffix<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.is_empty() || b.is_empty() || a.as_bytes().last() != b.as_bytes().last() {
        return "";
    }
    let mut n = 0;
    for (ca, cb) in a.chars().rev().zip(b.chars().rev()) {
        if ca == cb {
            n += ca.len_utf8();
        } else {
            break;
        }
    }
    &a[a.len() - n..]
}

pub fn replace_prefix(s: &str, old: &str, new_: &str) -> String {
    assert!(
        s.starts_with(old),
        "string {:?} doesn't start with prefix {:?}; bug",
        s,
        old
    );
    format!("{new_}{}", &s[old.len()..])
}

pub fn replace_suffix(s: &str, old: &str, new_: &str) -> String {
    if old.is_empty() {
        return format!("{s}{new_}");
    }
    assert!(
        s.ends_with(old),
        "string {:?} doesn't end with suffix {:?}; bug",
        s,
        old
    );
    format!("{}{new_}", &s[..s.len() - old.len()])
}

#[inline]
pub fn remove_prefix(s: &str, old: &str) -> String {
    replace_prefix(s, old, "")
}
#[inline]
pub fn remove_suffix(s: &str, old: &str) -> String {
    replace_suffix(s, old, "")
}

pub fn maximum_overlap<'a>(a: &'a str, b: &'a str) -> &'a str {
    let max = a.len().min(b.len());
    for i in (1..=max).rev() {
        if &a[a.len() - i..] == &b[..i] {
            return &b[..i];
        }
    }
    ""
}

pub fn trailing_ws(s: &str) -> &str {
    let mut idx = s.len();
    for (i, ch) in s.char_indices().rev() {
        if !WS_RE.is_match(ch.encode_utf8(&mut [0; 4])) {
            break;
        }
        idx = i;
    }
    &s[idx..]
}

pub fn leading_ws(s: &str) -> &str {
    let mut idx = 0;
    for (i, ch) in s.char_indices() {
        if !WS_RE.is_match(ch.encode_utf8(&mut [0; 4])) {
            break;
        }
        idx = i + ch.len_utf8();
    }
    &s[..idx]
}

pub fn has_only_win_line_endings(text: &str) -> bool {
    text.contains("\r\n")
        && !text.starts_with('\n')
        && !text
            .as_bytes()
            .windows(2)
            .any(|pair| pair[1] == b'\n' && pair[0] != b'\r')
}

pub fn has_only_unix_line_endings(text: &str) -> bool {
    !text.contains("\r\n") && text.contains('\n')
}
