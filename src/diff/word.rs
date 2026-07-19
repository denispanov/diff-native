use serde::Deserialize;
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;
use wasm_bindgen::{JsCast, JsValue};

use super::{
    base::{Change, Options, Path, Tokeniser},
    token::Token,
};
use crate::util::string::{
    is_ecmascript_whitespace, leading_ws, longest_common_prefix, longest_common_suffix,
    maximum_overlap, remove_prefix, remove_suffix, replace_prefix, replace_suffix, trailing_ws,
};

#[wasm_bindgen(module = "/src/word-helpers.js")]
extern "C" {
    #[wasm_bindgen(catch, js_name = tokenizeWithSegmenter)]
    fn tokenize_with_segmenter(value: &str, options: &JsValue) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(catch, js_name = tokenizePairWithSegmenter)]
    fn tokenize_pair_with_segmenter(
        old_value: &str,
        new_value: &str,
        options: &JsValue,
    ) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(catch, js_name = wordEquals)]
    fn dynamic_word_equals(
        left: &JsValue,
        right: &JsValue,
        ignore_case: bool,
    ) -> Result<bool, JsValue>;

    #[wasm_bindgen(catch, js_name = wordJoin)]
    fn dynamic_word_join(tokens: &js_sys::Array) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(catch, js_name = dedupeWordWhitespace)]
    fn dedupe_dynamic_word_whitespace(
        values: &js_sys::Array,
        segmenter: &JsValue,
    ) -> Result<js_sys::Array, JsValue>;
}

#[inline]
fn is_word_char(c: char) -> bool {
    matches!(
        c,
        'a'..='z'
            | 'A'..='Z'
            | '0'..='9'
            | '_'
            | '\u{AD}'
            | '\u{C0}'..='\u{D6}'
            | '\u{D8}'..='\u{F6}'
            | '\u{F8}'..='\u{2C6}'
            | '\u{2C8}'..='\u{2D7}'
            | '\u{2DE}'..='\u{2FF}'
            | '\u{1E00}'..='\u{1EFF}'
    )
}

#[inline(always)]
fn is_ascii_word(b: u8) -> bool {
    matches!(b, b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_')
}

#[inline(always)]
fn is_ascii_whitespace(b: u8) -> bool {
    matches!(b, b' ' | b'\t' | b'\n' | b'\r' | 0x0B | 0x0C)
}

#[inline(always)]
fn is_ascii_whitespace_no_nl(b: u8) -> bool {
    matches!(b, b' ' | b'\t' | 0x0B | 0x0C)
}

#[inline(always)]
fn scan_whitespace(text: &str, bytes: &[u8], mut pos: usize) -> usize {
    let len = bytes.len();
    while pos < len {
        let b = bytes[pos];
        if b < 0x80 {
            if is_ascii_whitespace(b) {
                pos += 1;
                continue;
            }
            break;
        }
        let ch = text[pos..].chars().next().unwrap();
        if is_ecmascript_whitespace(ch) {
            pos += ch.len_utf8();
        } else {
            break;
        }
    }
    pos
}

#[inline(always)]
fn scan_whitespace_no_nl(text: &str, bytes: &[u8], mut pos: usize) -> usize {
    let len = bytes.len();
    while pos < len {
        let b = bytes[pos];
        if b < 0x80 {
            if is_ascii_whitespace_no_nl(b) {
                pos += 1;
                continue;
            }
            break;
        }
        let ch = text[pos..].chars().next().unwrap();
        if is_ecmascript_whitespace(ch) && ch != '\n' && ch != '\r' {
            pos += ch.len_utf8();
        } else {
            break;
        }
    }
    pos
}

#[inline(always)]
fn scan_word_run(text: &str, bytes: &[u8], mut pos: usize) -> usize {
    let len = bytes.len();
    while pos < len {
        let b = bytes[pos];
        if b < 0x80 {
            if is_ascii_word(b) {
                pos += 1;
                continue;
            }
            break;
        }
        let ch = text[pos..].chars().next().unwrap();
        if is_word_char(ch) {
            pos += ch.len_utf8();
        } else {
            break;
        }
    }
    pos
}

#[inline(always)]
fn scan_word_token(text: &str, bytes: &[u8], pos: usize) -> (usize, bool) {
    // Keep jsdiff-compatible token boundaries while fast-pathing ASCII.
    let b = bytes[pos];
    if b < 0x80 {
        if is_ascii_whitespace(b) {
            return (scan_whitespace(text, bytes, pos), true);
        }
        if is_ascii_word(b) {
            return (scan_word_run(text, bytes, pos), false);
        }
        return (pos + 1, false);
    }

    let ch = text[pos..].chars().next().unwrap();
    if is_ecmascript_whitespace(ch) {
        return (scan_whitespace(text, bytes, pos), true);
    }
    if is_word_char(ch) {
        return (scan_word_run(text, bytes, pos), false);
    }
    (pos + ch.len_utf8(), false)
}

#[inline(always)]
fn scan_word_with_space_token(text: &str, bytes: &[u8], pos: usize) -> usize {
    // Match jsdiff wordWithSpace rules: preserve CRLF and treat newlines as standalone tokens.
    let b = bytes[pos];
    if b < 0x80 {
        if b == b'\r' {
            if pos + 1 < bytes.len() && bytes[pos + 1] == b'\n' {
                return pos + 2;
            }
            return pos + 1;
        }
        if b == b'\n' {
            return pos + 1;
        }
        if is_ascii_word(b) {
            return scan_word_run(text, bytes, pos);
        }
        if is_ascii_whitespace_no_nl(b) {
            return scan_whitespace_no_nl(text, bytes, pos);
        }
        return pos + 1;
    }

    let ch = text[pos..].chars().next().unwrap();
    if is_ecmascript_whitespace(ch) {
        if ch == '\n' || ch == '\r' {
            return pos + ch.len_utf8();
        }
        return scan_whitespace_no_nl(text, bytes, pos);
    }
    if is_word_char(ch) {
        return scan_word_run(text, bytes, pos);
    }
    pos + ch.len_utf8()
}

#[derive(Copy, Clone)]
struct Range {
    start: usize,
    end: usize,
    is_whitespace: bool,
}

fn attach_part(ranges: &mut Vec<Range>, previous: &mut Option<Range>, part: Range) {
    match (part.is_whitespace, *previous) {
        (true, None) => ranges.push(part),
        (true, Some(_)) => {
            if let Some(last) = ranges.last_mut() {
                last.end = part.end;
            }
        }
        (false, Some(previous_part)) if previous_part.is_whitespace => {
            let whitespace_is_standalone = ranges.last().is_some_and(|range| {
                range.start == previous_part.start && range.end == previous_part.end
            });

            if whitespace_is_standalone {
                if let Some(last) = ranges.last_mut() {
                    last.end = part.end;
                    last.is_whitespace = false;
                }
            } else {
                ranges.push(Range {
                    start: previous_part.start,
                    end: part.end,
                    is_whitespace: false,
                });
            }
        }
        _ => ranges.push(part),
    }

    *previous = Some(part);
}

#[derive(Default)]
pub struct WordTokenizer;

impl<'a> Tokeniser<'a> for WordTokenizer {
    fn tokenize<'b>(&self, text: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>] {
        arena.clear();
        if text.is_empty() {
            return &arena[..];
        }

        let bytes = text.as_bytes();
        let len = bytes.len();
        let mut pos = 0usize;
        let mut ranges = Vec::new();
        let mut previous = None;

        while pos < len {
            let start = pos;
            let (end, is_whitespace) = scan_word_token(text, bytes, pos);
            pos = end;
            attach_part(
                &mut ranges,
                &mut previous,
                Range {
                    start,
                    end,
                    is_whitespace,
                },
            );
        }

        arena.reserve(ranges.len());
        for r in ranges {
            arena.push(Token {
                text: &text[r.start..r.end],
            });
        }
        &arena[..]
    }

    #[inline]
    fn join(&self, toks: &[Token<'a>]) -> String {
        toks.iter()
            .enumerate()
            .map(|(i, t)| {
                if i == 0 {
                    t.text
                } else {
                    t.text.trim_start_matches(is_ecmascript_whitespace)
                }
            })
            .collect()
    }

    #[inline]
    fn equals(&self, l: &Token<'a>, r: &Token<'a>, opts: &Options) -> bool {
        let (lt, rt) = (
            l.text.trim_matches(is_ecmascript_whitespace),
            r.text.trim_matches(is_ecmascript_whitespace),
        );
        if opts.ignore_case {
            super::base::js_eq_ignore_case(lt, rt)
        } else {
            lt == rt
        }
    }

    fn post_process(&self, changes: Vec<Change>, opts: &Options) -> Vec<Change> {
        post_process_whitespace(changes, opts)
    }
}

struct WordTokenizerNoPost;

impl<'a> Tokeniser<'a> for WordTokenizerNoPost {
    fn tokenize<'b>(&self, text: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>] {
        WordTokenizer.tokenize(text, arena)
    }

    fn join(&self, tokens: &[Token<'a>]) -> String {
        WordTokenizer.join(tokens)
    }

    fn equals(&self, left: &Token<'a>, right: &Token<'a>, options: &Options) -> bool {
        WordTokenizer.equals(left, right, options)
    }
}

#[derive(Clone)]
enum WordToken<'a> {
    Borrowed(&'a str),
    Dynamic(JsValue),
}

impl WordToken<'_> {
    fn as_js_value(&self) -> JsValue {
        match self {
            Self::Borrowed(value) => JsValue::from_str(value),
            Self::Dynamic(value) => value.clone(),
        }
    }

    fn is_truthy(&self) -> bool {
        match self {
            Self::Borrowed(value) => !value.is_empty(),
            Self::Dynamic(value) => value.is_truthy(),
        }
    }
}

#[derive(Clone, Copy)]
struct WordComponent {
    count: u32,
    added: bool,
    removed: bool,
    previous: Option<u32>,
}

struct DynamicWordDiff {
    options: Options,
    components: Vec<WordComponent>,
    paths: Vec<Option<Path>>,
}

impl DynamicWordDiff {
    fn new(options: Options) -> Self {
        Self {
            options,
            components: Vec::new(),
            paths: Vec::new(),
        }
    }

    fn push_component(
        &mut self,
        count: u32,
        added: bool,
        removed: bool,
        previous: Option<u32>,
    ) -> u32 {
        let index = self.components.len() as u32;
        self.components.push(WordComponent {
            count,
            added,
            removed,
            previous,
        });
        index
    }

    fn equals(&self, left: &WordToken<'_>, right: &WordToken<'_>) -> Result<bool, JsValue> {
        match (left, right) {
            (WordToken::Borrowed(left), WordToken::Borrowed(right)) => {
                let left = left.trim_matches(is_ecmascript_whitespace);
                let right = right.trim_matches(is_ecmascript_whitespace);
                Ok(if self.options.ignore_case {
                    super::base::js_eq_ignore_case(left, right)
                } else {
                    left == right
                })
            }
            _ => dynamic_word_equals(
                &left.as_js_value(),
                &right.as_js_value(),
                self.options.ignore_case,
            ),
        }
    }

    fn join(&self, tokens: &[WordToken<'_>]) -> Result<String, JsValue> {
        if tokens
            .iter()
            .all(|token| matches!(token, WordToken::Borrowed(_)))
        {
            return Ok(tokens
                .iter()
                .enumerate()
                .map(|(index, token)| match token {
                    WordToken::Borrowed(value) if index == 0 => *value,
                    WordToken::Borrowed(value) => {
                        value.trim_start_matches(is_ecmascript_whitespace)
                    }
                    WordToken::Dynamic(_) => unreachable!(),
                })
                .collect());
        }

        let values = js_sys::Array::new();
        for token in tokens {
            values.push(&token.as_js_value());
        }
        let value = dynamic_word_join(&values)?;
        Ok(value.as_string().unwrap())
    }

    fn extract_common(
        &mut self,
        path: &mut Path,
        new_tokens: &[WordToken<'_>],
        old_tokens: &[WordToken<'_>],
        diagonal: isize,
    ) -> Result<isize, JsValue> {
        let mut old_pos = path.old_pos;
        let mut new_pos = old_pos - diagonal;
        let mut common = 0;

        while new_pos + 1 < new_tokens.len() as isize
            && old_pos + 1 < old_tokens.len() as isize
            && self.equals(
                &old_tokens[(old_pos + 1) as usize],
                &new_tokens[(new_pos + 1) as usize],
            )?
        {
            old_pos += 1;
            new_pos += 1;
            common += 1;
            if self.options.one_change_per_token {
                path.last = Some(self.push_component(1, false, false, path.last));
            }
        }

        if common > 0 && !self.options.one_change_per_token {
            path.last = Some(self.push_component(common, false, false, path.last));
        }
        path.old_pos = old_pos;
        Ok(new_pos)
    }

    fn extend_path(&mut self, path: Path, added: bool, removed: bool, old_inc: isize) -> Path {
        let merged = if !self.options.one_change_per_token {
            path.last.and_then(|previous_index| {
                let previous = self.components[previous_index as usize];
                (previous.added == added && previous.removed == removed).then(|| {
                    self.push_component(previous.count + 1, added, removed, previous.previous)
                })
            })
        } else {
            None
        };
        let last = merged.unwrap_or_else(|| self.push_component(1, added, removed, path.last));
        Path {
            old_pos: path.old_pos + old_inc,
            last: Some(last),
        }
    }

    fn build_values(
        &self,
        tail: Option<u32>,
        new_tokens: &[WordToken<'_>],
        old_tokens: &[WordToken<'_>],
    ) -> Result<Vec<Change>, JsValue> {
        let mut chain = Vec::new();
        let mut current = tail;
        while let Some(index) = current {
            chain.push(index);
            current = self.components[index as usize].previous;
        }
        chain.reverse();

        let (mut new_pos, mut old_pos) = (0, 0);
        let mut changes = Vec::with_capacity(chain.len());
        for index in chain {
            let component = self.components[index as usize];
            let value = if component.removed {
                let tokens = &old_tokens[old_pos..old_pos + component.count as usize];
                old_pos += component.count as usize;
                self.join(tokens)?
            } else {
                let tokens = &new_tokens[new_pos..new_pos + component.count as usize];
                let value = self.join(tokens)?;
                new_pos += component.count as usize;
                if !component.added {
                    old_pos += component.count as usize;
                }
                value
            };
            changes.push(Change {
                value,
                count: component.count,
                added: component.added,
                removed: component.removed,
            });
        }
        Ok(changes)
    }

    fn diff(
        &mut self,
        old_tokens: &[WordToken<'_>],
        new_tokens: &[WordToken<'_>],
    ) -> Result<Vec<Change>, JsValue> {
        let old_len = old_tokens.len() as isize;
        let new_len = new_tokens.len() as isize;
        let max_d = self
            .options
            .max_edit_length
            .map_or((old_len + new_len) as usize, |limit| {
                limit.min((old_len + new_len) as usize)
            });
        let offset = max_d as isize;
        let size = 2 * max_d + 1;
        self.paths.clear();
        self.paths.resize(size, None);

        let mut initial = Path::default();
        let new_pos = self.extract_common(&mut initial, new_tokens, old_tokens, 0)?;
        if initial.old_pos + 1 >= old_len && new_pos + 1 >= new_len {
            return self.build_values(initial.last, new_tokens, old_tokens);
        }
        self.paths[offset as usize] = Some(initial);

        let (mut min_diagonal, mut max_diagonal) = (isize::MIN, isize::MAX);
        for edit_length in 1..=max_d {
            let first = min_diagonal.max(-(edit_length as isize));
            let last = max_diagonal.min(edit_length as isize);
            for diagonal in (first..=last).step_by(2) {
                let index = (diagonal + offset) as usize;
                let remove_path = if index > 0 {
                    self.paths[index - 1].take()
                } else {
                    None
                };
                let add_path = if index + 1 < size {
                    self.paths[index + 1]
                } else {
                    None
                };
                let can_add =
                    add_path.is_some_and(|path| (0..new_len).contains(&(path.old_pos - diagonal)));
                let can_remove = remove_path.is_some_and(|path| path.old_pos + 1 < old_len);
                if !can_add && !can_remove {
                    self.paths[index] = None;
                    continue;
                }

                let base = if !can_remove
                    || (can_add && remove_path.unwrap().old_pos < add_path.unwrap().old_pos)
                {
                    self.extend_path(add_path.unwrap(), true, false, 0)
                } else {
                    self.extend_path(remove_path.unwrap(), false, true, 1)
                };
                let mut path = base;
                let new_pos = self.extract_common(&mut path, new_tokens, old_tokens, diagonal)?;
                self.paths[index] = Some(path);
                if path.old_pos + 1 >= old_len && new_pos + 1 >= new_len {
                    return self.build_values(path.last, new_tokens, old_tokens);
                }
                if path.old_pos + 1 >= old_len {
                    max_diagonal = max_diagonal.min(diagonal - 1);
                }
                if new_pos + 1 >= new_len {
                    min_diagonal = min_diagonal.max(diagonal + 1);
                }
            }
        }
        Ok(Vec::new())
    }
}

#[derive(Default)]
pub struct WordWithSpaceTokenizer;

impl<'a> Tokeniser<'a> for WordWithSpaceTokenizer {
    fn tokenize<'b>(&self, value: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>] {
        arena.clear();
        if value.is_empty() {
            return &arena[..];
        }

        let bytes = value.as_bytes();
        let len = bytes.len();
        let mut i = 0usize;

        while i < len {
            let end = scan_word_with_space_token(value, bytes, i);
            arena.push(Token {
                text: &value[i..end],
            });
            i = end;
        }

        arena
    }

    #[inline]
    fn join(&self, toks: &[Token<'a>]) -> String {
        toks.iter().map(|t| t.text).collect()
    }

    fn equals(&self, left: &Token<'a>, right: &Token<'a>, opts: &Options) -> bool {
        if opts.ignore_case {
            super::base::js_eq_ignore_case(left.text, right.text)
        } else {
            left.text == right.text
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn dedupe_whitespace(
    start_keep: Option<&mut Change>,
    deletion: Option<&mut Change>,
    insertion: Option<&mut Change>,
    end_keep: Option<&mut Change>,
) {
    match (deletion, insertion) {
        (Some(del), Some(ins)) => {
            let del_value = del.value.clone();
            let ins_value = ins.value.clone();
            let old_pre = leading_ws(&del_value);
            let new_pre = leading_ws(&ins_value);

            if let Some(sk) = start_keep {
                let sk_value = sk.value.clone();
                let common = longest_common_prefix(old_pre, new_pre);
                sk.value = replace_suffix(&sk_value, new_pre, common);
                del.value = remove_prefix(&del_value, common);
                ins.value = remove_prefix(&ins_value, common);
            }
            if let Some(ek) = end_keep {
                let ek_value = ek.value.clone();
                let del_value = del.value.clone();
                let ins_value = ins.value.clone();
                let old_suf = trailing_ws(&del_value);
                let new_suf = trailing_ws(&ins_value);
                let common = longest_common_suffix(old_suf, new_suf);
                ek.value = replace_prefix(&ek_value, new_suf, common);
                del.value = remove_suffix(&del_value, common);
                ins.value = remove_suffix(&ins_value, common);
            }
        }
        (None, Some(ins)) => {
            if let Some(_sk) = start_keep {
                let ins_value = ins.value.clone();
                let ws = leading_ws(&ins_value);
                ins.value = ins_value[ws.len()..].to_string();
            }
            if let Some(ek) = end_keep {
                let ek_value = ek.value.clone();
                let ws = leading_ws(&ek_value);
                ek.value = ek_value[ws.len()..].to_string();
            }
        }
        (Some(del), None) => match (start_keep, end_keep) {
            (Some(sk), Some(ek)) => {
                let sk_value = sk.value.clone();
                let ek_value = ek.value.clone();
                let del_value = del.value.clone();

                let new_full = leading_ws(&ek_value);
                let del_start = leading_ws(&del_value);
                let del_end = trailing_ws(&del_value);
                let new_start = longest_common_prefix(new_full, del_start);
                del.value = remove_prefix(&del_value, new_start);

                let del_value = del.value.clone();
                let new_end = longest_common_suffix(&new_full[new_start.len()..], del_end);
                del.value = remove_suffix(&del_value, new_end);
                ek.value = replace_prefix(&ek_value, new_full, new_end);
                sk.value = replace_suffix(
                    &sk_value,
                    new_full,
                    &new_full[..new_full.len() - new_end.len()],
                );
            }
            (None, Some(ek)) => {
                let ek_value = ek.value.clone();
                let del_value = del.value.clone();
                let overlap = maximum_overlap(trailing_ws(&del_value), leading_ws(&ek_value));
                del.value = remove_suffix(&del_value, overlap);
            }
            (Some(sk), None) => {
                let sk_value = sk.value.clone();
                let del_value = del.value.clone();
                let overlap = maximum_overlap(trailing_ws(&sk_value), leading_ws(&del_value));
                del.value = remove_prefix(&del_value, overlap);
            }
            _ => {}
        },
        _ => {}
    }
}

fn dedupe_whitespace_with_options(
    start_keep: Option<&mut Change>,
    deletion: Option<&mut Change>,
    insertion: Option<&mut Change>,
    end_keep: Option<&mut Change>,
    options: &JsValue,
) -> Result<(), JsValue> {
    let segmenter = js_sys::Reflect::get(options, &JsValue::from_str("intlSegmenter"))?;
    if segmenter.is_falsy() {
        dedupe_whitespace(start_keep, deletion, insertion, end_keep);
        return Ok(());
    }

    let values = js_sys::Array::new();
    for change in [
        start_keep.as_deref(),
        deletion.as_deref(),
        insertion.as_deref(),
        end_keep.as_deref(),
    ] {
        values.push(&change.map_or(JsValue::NULL, |change| JsValue::from_str(&change.value)));
    }
    let deduped = dedupe_dynamic_word_whitespace(&values, &segmenter)?;
    for (index, change) in [start_keep, deletion, insertion, end_keep]
        .into_iter()
        .enumerate()
    {
        if let Some(change) = change {
            change.value = deduped.get(index as u32).as_string().unwrap();
        }
    }
    Ok(())
}

fn post_process_whitespace(mut changes: Vec<Change>, opts: &Options) -> Vec<Change> {
    if opts.one_change_per_token {
        return changes;
    }

    let mut last_keep: Option<*mut Change> = None;
    let mut insertion: Option<*mut Change> = None;
    let mut deletion: Option<*mut Change> = None;

    for ch in changes.iter_mut() {
        let ptr = ch as *mut Change;
        if ch.added {
            insertion = Some(ptr);
        } else if ch.removed {
            deletion = Some(ptr);
        } else {
            if insertion.is_some() || deletion.is_some() {
                unsafe {
                    dedupe_whitespace(
                        last_keep.map(|p| &mut *p),
                        deletion.map(|p| &mut *p),
                        insertion.map(|p| &mut *p),
                        Some(&mut *ch),
                    );
                }
            }
            last_keep = Some(ptr);
            insertion = None;
            deletion = None;
        }
    }

    if insertion.is_some() || deletion.is_some() {
        unsafe {
            dedupe_whitespace(
                last_keep.map(|p| &mut *p),
                deletion.map(|p| &mut *p),
                insertion.map(|p| &mut *p),
                None,
            );
        }
    }

    changes
}

fn post_process_whitespace_with_options(
    mut changes: Vec<Change>,
    options: &Options,
    js_options: &JsValue,
) -> Result<Vec<Change>, JsValue> {
    if options.one_change_per_token {
        return Ok(changes);
    }

    let mut last_keep: Option<*mut Change> = None;
    let mut insertion: Option<*mut Change> = None;
    let mut deletion: Option<*mut Change> = None;

    for change in &mut changes {
        let pointer = change as *mut Change;
        if change.added {
            insertion = Some(pointer);
        } else if change.removed {
            deletion = Some(pointer);
        } else {
            if insertion.is_some() || deletion.is_some() {
                unsafe {
                    dedupe_whitespace_with_options(
                        last_keep.map(|value| &mut *value),
                        deletion.map(|value| &mut *value),
                        insertion.map(|value| &mut *value),
                        Some(&mut *change),
                        js_options,
                    )?;
                }
            }
            last_keep = Some(pointer);
            insertion = None;
            deletion = None;
        }
    }

    if insertion.is_some() || deletion.is_some() {
        unsafe {
            dedupe_whitespace_with_options(
                last_keep.map(|value| &mut *value),
                deletion.map(|value| &mut *value),
                insertion.map(|value| &mut *value),
                None,
                js_options,
            )?;
        }
    }
    Ok(changes)
}

#[derive(Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct WordOptions {
    #[serde(default)]
    ignore_case: bool,
    #[serde(default)]
    ignore_whitespace: Option<bool>,
    #[serde(default)]
    one_change_per_token: bool,
    #[serde(default)]
    max_edit_length: Option<usize>,
}

impl From<WordOptions> for Options {
    fn from(wo: WordOptions) -> Self {
        Options {
            ignore_case: wo.ignore_case,
            one_change_per_token: wo.one_change_per_token,
            max_edit_length: wo.max_edit_length,
        }
    }
}

fn normalize_options(options: JsValue) -> JsValue {
    if options.is_undefined() {
        js_sys::Object::new().into()
    } else {
        options
    }
}

fn segmented_tokens<'a>(tokens: JsValue) -> Option<Vec<WordToken<'a>>> {
    if tokens.is_null() {
        return None;
    }
    let tokens = tokens.unchecked_into::<js_sys::Array>();
    Some(
        tokens
            .iter()
            .map(WordToken::Dynamic)
            .filter(WordToken::is_truthy)
            .collect(),
    )
}

fn borrowed_tokens(value: &str) -> Vec<WordToken<'_>> {
    let mut arena = Vec::new();
    WordTokenizer
        .tokenize(value, &mut arena)
        .iter()
        .filter(|token| !token.text.is_empty())
        .map(|token| WordToken::Borrowed(token.text))
        .collect()
}

fn identical_changes<'a, T: Tokeniser<'a>>(tokenizer: &T, value: &'a str) -> Vec<Change> {
    if value.is_empty() {
        return Vec::new();
    }
    let mut arena = Vec::new();
    let count = tokenizer.tokenize(value, &mut arena).len() as u32;
    vec![Change {
        value: value.to_string(),
        count,
        added: false,
        removed: false,
    }]
}

#[wasm_bindgen(js_name = diffWords)]
pub fn diff_words(old: &str, new_: &str, opts: JsValue) -> Result<JsValue, JsValue> {
    let opts = normalize_options(opts);
    let wo: WordOptions = swb::from_value(opts.clone()).unwrap_or_default();
    let base_opts: Options = wo.clone().into();
    let use_with_space = wo.ignore_whitespace == Some(false);

    use super::memory_pool::PooledDiff;
    let changes = if use_with_space {
        if old == new_ && !base_opts.one_change_per_token {
            identical_changes(&WordWithSpaceTokenizer, new_)
        } else {
            let mut diff = PooledDiff::new(WordWithSpaceTokenizer, base_opts);
            diff.diff(old, new_)
        }
    } else {
        let segmented = tokenize_pair_with_segmenter(old, new_, &opts)?;
        let (old_segmented, new_segmented) = if segmented.is_null() {
            (None, None)
        } else {
            let segmented = segmented.unchecked_into::<js_sys::Array>();
            (
                segmented_tokens(segmented.get(0)),
                segmented_tokens(segmented.get(1)),
            )
        };
        let changes = match (old_segmented, new_segmented) {
            (None, None) if old == new_ && !base_opts.one_change_per_token => {
                identical_changes(&WordTokenizer, new_)
            }
            (None, None) => {
                let mut diff = PooledDiff::new(WordTokenizerNoPost, base_opts.clone());
                diff.diff(old, new_)
            }
            (old_segmented, new_segmented) => {
                let old_tokens = old_segmented.unwrap_or_else(|| borrowed_tokens(old));
                let new_tokens = new_segmented.unwrap_or_else(|| borrowed_tokens(new_));
                DynamicWordDiff::new(base_opts.clone()).diff(&old_tokens, &new_tokens)?
            }
        };
        post_process_whitespace_with_options(changes, &base_opts, &opts)?
    };
    swb::to_value(&changes).map_err(|e| JsValue::from(e.to_string()))
}

#[wasm_bindgen(js_name = diffWordsWithSpace)]
pub fn diff_words_with_space(old: &str, new_: &str, opts: JsValue) -> Result<JsValue, JsValue> {
    let wo: WordOptions = swb::from_value(opts).unwrap_or_default();
    let base_opts: Options = wo.into();

    use super::memory_pool::PooledDiff;
    let mut diff = PooledDiff::new(WordWithSpaceTokenizer, base_opts);
    let changes = diff.diff(old, new_);
    swb::to_value(&changes).map_err(|e| JsValue::from(e.to_string()))
}

#[wasm_bindgen(js_name = wordDiff)]
pub struct WordDiff;

#[wasm_bindgen(js_class = wordDiff)]
impl WordDiff {
    #[wasm_bindgen(js_name = tokenize)]
    pub fn tokenize_js(text: &str, options: JsValue) -> Result<JsValue, JsValue> {
        let options = normalize_options(options);
        let segmented = tokenize_with_segmenter(text, &options)?;
        if !segmented.is_null() {
            return Ok(segmented);
        }

        let tok = WordTokenizer;
        let mut arena = Vec::new();
        let toks = tok.tokenize(text, &mut arena);
        let vec: Vec<&str> = toks.iter().map(|t| t.text).collect();
        swb::to_value(&vec).map_err(|e| JsValue::from(e.to_string()))
    }
}
