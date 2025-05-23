use core::marker::PhantomData;
use serde::{Deserialize, Serialize};

use super::token::Token;

#[derive(Default, Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    #[serde(default)]
    pub ignore_case: bool,
    #[serde(default)]
    pub one_change_per_token: bool,
    #[serde(default)]
    pub max_edit_length: Option<usize>,
}

#[derive(Serialize, Debug, Clone)]
pub struct Change {
    pub value: String,
    pub count: u32,
    pub added: bool,
    pub removed: bool,
}

pub trait Tokeniser<'a> {
    fn cast_input(&self, input: &'a str, _opts: &Options) -> &'a str {
        input
    }
    fn tokenize<'b>(&self, input: &'a str, arena: &'b mut Vec<Token<'a>>) -> &'b [Token<'a>];

    #[inline(always)]
    fn is_empty(&self, tok: &Token<'a>) -> bool {
        tok.text.is_empty()
    }
    #[inline]
    fn remove_empty(&self, toks: &[Token<'a>]) -> Vec<Token<'a>> {
        let mut out = Vec::with_capacity(toks.len());
        for t in toks {
            if !self.is_empty(t) {
                out.push(*t);
            }
        }
        out
    }

    fn join(&self, toks: &[Token<'a>]) -> String;

    #[inline(always)]
    fn equals(&self, l: &Token<'a>, r: &Token<'a>, opts: &Options) -> bool {
        if !opts.ignore_case {
            if l.text.len() != r.text.len() {
                return false;
            }
            if core::ptr::eq(l.text.as_ptr(), r.text.as_ptr()) {
                return true;
            }
        }
        if opts.ignore_case {
            ascii_eq_ignore_case(l.text.as_bytes(), r.text.as_bytes())
        } else {
            l.text == r.text
        }
    }

    fn post_process(&self, changes: Vec<Change>, _opts: &Options) -> Vec<Change> {
        changes
    }
}

#[inline(always)]
fn ascii_eq_ignore_case(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len()
        && a.iter()
            .zip(b)
            .all(|(x, y)| x.to_ascii_lowercase() == y.to_ascii_lowercase())
}

#[derive(Clone, Copy, Debug)]
struct Component {
    count: u32,
    added: bool,
    removed: bool,
    previous: Option<u32>,
}

impl Component {
    #[inline(always)]
    fn new(count: u32, added: bool, removed: bool, previous: Option<u32>) -> Self {
        Self {
            count,
            added,
            removed,
            previous,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Path {
    pub old_pos: isize,
    pub last: Option<u32>,
}

impl Default for Path {
    fn default() -> Self {
        Self {
            old_pos: -1,
            last: None,
        }
    }
}

impl Path {
    pub fn insert(&mut self, path: Path) -> &mut Self {
        *self = path;
        self
    }
}

pub struct Diff<'a, T: Tokeniser<'a>> {
    tokenizer: T,
    opts: Options,
    use_longest_token: bool,
    _lt: PhantomData<&'a ()>,
}

impl<'a, T: Tokeniser<'a>> Diff<'a, T> {
    pub fn new(tokenizer: T, opts: Options) -> Self {
        Self {
            tokenizer,
            opts,
            use_longest_token: false,
            _lt: PhantomData,
        }
    }

    #[inline]
    pub fn with_longest_token(mut self) -> Self {
        self.use_longest_token = true;
        self
    }

    pub fn diff(&self, old_raw: &'a str, new_raw: &'a str) -> Vec<Change> {
        let old_cast = self.tokenizer.cast_input(old_raw, &self.opts);
        let new_cast = self.tokenizer.cast_input(new_raw, &self.opts);

        let (mut arena_a, mut arena_b) = (Vec::new(), Vec::new());
        let a_tok = self.tokenizer.tokenize(old_cast, &mut arena_a);
        let b_tok = self.tokenizer.tokenize(new_cast, &mut arena_b);

        let a_vec = self.tokenizer.remove_empty(a_tok);
        let b_vec = self.tokenizer.remove_empty(b_tok);

        let (a, b) = (a_vec.as_slice(), b_vec.as_slice());
        let (a_len, b_len) = (a.len() as isize, b.len() as isize);

        if a_len == 0 && b_len == 0 {
            return Vec::new();
        }
        if a_len == 0 {
            return self.tokenizer.post_process(
                vec![Change {
                    value: new_raw.to_string(),
                    count: b_len as u32,
                    added: true,
                    removed: false,
                }],
                &self.opts,
            );
        }
        if b_len == 0 {
            return self.tokenizer.post_process(
                vec![Change {
                    value: old_raw.to_string(),
                    count: a_len as u32,
                    added: false,
                    removed: true,
                }],
                &self.opts,
            );
        }

        return self.run_myers(a_len, b_len, a, b);
    }

    #[inline(always)]
    fn extract_common(
        &self,
        path: &mut Path,
        new_toks: &[Token<'a>],
        old_toks: &[Token<'a>],
        diagonal: isize,
        comps: &mut Vec<Component>,
    ) -> isize {
        let (old_len, new_len) = (old_toks.len() as isize, new_toks.len() as isize);
        let mut old_pos = path.old_pos;
        let mut new_pos = old_pos - diagonal;
        let mut common = 0;

        while new_pos + 1 < new_len
            && old_pos + 1 < old_len
            && self.tokenizer.equals(
                &old_toks[(old_pos + 1) as usize],
                &new_toks[(new_pos + 1) as usize],
                &self.opts,
            )
        {
            old_pos += 1;
            new_pos += 1;
            common += 1;

            if self.opts.one_change_per_token {
                let idx = comps.len() as u32;
                comps.push(Component::new(1, false, false, path.last));
                path.last = Some(idx);
            }
        }

        if common > 0 && !self.opts.one_change_per_token {
            let idx = comps.len() as u32;
            comps.push(Component::new(common as u32, false, false, path.last));
            path.last = Some(idx);
        }

        path.old_pos = old_pos;
        new_pos
    }

    fn finish_and_postprocess(
        &self,
        tail: Option<u32>,
        comps: &[Component],
        new_toks: &[Token<'a>],
        old_toks: &[Token<'a>],
    ) -> Vec<Change> {
        let mut chain = Vec::<u32>::new();
        let mut cur = tail;
        while let Some(i) = cur {
            chain.push(i);
            cur = comps[i as usize].previous;
        }
        chain.reverse();

        let (mut new_pos, mut old_pos) = (0usize, 0usize);
        let mut out = Vec::with_capacity(chain.len());

        for &idx in &chain {
            let c = &comps[idx as usize];
            let value = if c.removed {
                let slice = &old_toks[old_pos..old_pos + c.count as usize];
                old_pos += c.count as usize;
                self.tokenizer.join(slice)
            } else {
                let slice = &new_toks[new_pos..new_pos + c.count as usize];
                let val = if !c.added && self.use_longest_token {
                    let mut chosen = Vec::with_capacity(c.count as usize);
                    for i in 0..c.count as usize {
                        let new_tok = &new_toks[new_pos + i];
                        let old_tok = &old_toks[old_pos + i];
                        if old_tok.text.len() > new_tok.text.len() {
                            chosen.push(*old_tok);
                        } else {
                            chosen.push(*new_tok);
                        }
                    }
                    self.tokenizer.join(&chosen)
                } else {
                    self.tokenizer.join(slice)
                };
                new_pos += c.count as usize;
                if !c.added {
                    old_pos += c.count as usize;
                }
                val
            };

            out.push(Change {
                value: to_owned(value),
                count: c.count,
                added: c.added,
                removed: c.removed,
            });
        }

        self.tokenizer.post_process(out, &self.opts)
    }

    #[inline(always)]
    fn extend_path(
        &self,
        path: Path,
        added: bool,
        removed: bool,
        old_inc: isize,
        comps: &mut Vec<Component>,
    ) -> Path {
        let merged = if !self.opts.one_change_per_token {
            if let Some(prev_idx) = path.last {
                let prev = &comps[prev_idx as usize];
                if prev.added == added && prev.removed == removed {
                    let idx = comps.len() as u32;
                    comps.push(Component::new(
                        prev.count + 1,
                        added,
                        removed,
                        prev.previous,
                    ));
                    Some(idx)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        let last_idx = if let Some(idx) = merged {
            idx
        } else {
            let idx = comps.len() as u32;
            comps.push(Component::new(1, added, removed, path.last));
            idx
        };

        Path {
            old_pos: path.old_pos + old_inc,
            last: Some(last_idx),
        }
    }

    fn run_myers(
        &self,
        a_len: isize,
        b_len: isize,
        a: &[Token<'a>],
        b: &[Token<'a>],
    ) -> Vec<Change> {
        let natural_limit = (a_len + b_len) as usize;
        let max_d = self
            .opts
            .max_edit_length
            .map_or(natural_limit, |m| m.min(natural_limit));

        let offset = max_d as isize;
        let size = 2 * max_d + 1;
        let mut v: Vec<Option<Path>> = vec![None; size];

        let mut comps: Vec<Component> = Vec::with_capacity((a_len + b_len + 1) as usize);

        let mut best0 = Path::default();

        let new_pos = self.extract_common(&mut best0, b, a, 0, &mut comps);

        if best0.old_pos + 1 >= a_len && new_pos + 1 >= b_len {
            return self.finish_and_postprocess(best0.last, &comps, b, a);
        }
        v[offset as usize] = Some(best0);

        let (mut min_k_consider, mut max_k_consider) = (isize::MIN, isize::MAX);

        for d in 1..=max_d {
            let k_min = min_k_consider.max(-(d as isize));
            let k_max = max_k_consider.min(d as isize);

            for k in (k_min..=k_max).step_by(2) {
                let idx = (k + offset) as usize;

                let remove_path = if idx > 0 { v[idx - 1].take() } else { None };
                let add_path = if idx + 1 < size {
                    v[idx + 1].clone()
                } else {
                    None
                };

                let can_add = add_path
                    .as_ref()
                    .map_or(false, |p| (0..b_len).contains(&(p.old_pos - k)));
                let can_remove = remove_path
                    .as_ref()
                    .map_or(false, |p| p.old_pos + 1 < a_len);

                if !can_add && !can_remove {
                    v[idx] = None;
                    continue;
                }

                let base = if !can_remove
                    || (can_add
                        && remove_path.as_ref().unwrap().old_pos
                            < add_path.as_ref().unwrap().old_pos)
                {
                    self.extend_path(add_path.unwrap(), true, false, 0, &mut comps)
                } else {
                    self.extend_path(remove_path.unwrap(), false, true, 1, &mut comps)
                };

                let new_pos_after =
                    self.extract_common(&mut v[idx].insert(base), b, a, k, &mut comps);

                let p = v[idx].as_ref().unwrap();
                if p.old_pos + 1 >= a_len && new_pos_after + 1 >= b_len {
                    return self.finish_and_postprocess(p.last, &comps, b, a);
                }

                if p.old_pos + 1 >= a_len {
                    max_k_consider = max_k_consider.min(k - 1);
                }
                if new_pos_after + 1 >= b_len {
                    min_k_consider = min_k_consider.max(k + 1);
                }
            }
        }

        Vec::new()
    }
}

#[inline(always)]
fn to_owned(s: String) -> String {
    s
}
