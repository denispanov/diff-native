use super::base::{Change, Options, Path, Tokeniser};
use super::component_pool::ComponentPool;
use super::token::Token;
use core::marker::PhantomData;
use std::cell::RefCell;

thread_local! {
    static COMPONENT_POOL: RefCell<ComponentPool> = RefCell::new(ComponentPool::with_capacity(1024));
    static PATH_POOL: RefCell<Vec<Option<Path>>> = RefCell::new(Vec::with_capacity(256));
}

pub struct PooledDiff<'a, T: Tokeniser<'a>> {
    tokenizer: T,
    opts: Options,
    use_longest_token: bool,
    components: ComponentPool,
    paths: Vec<Option<Path>>,
    _lt: PhantomData<&'a ()>,
}

impl<'a, T: Tokeniser<'a>> PooledDiff<'a, T> {
    pub fn new(tokenizer: T, opts: Options) -> Self {
        let components = COMPONENT_POOL.with(|pool| {
            let mut pool = pool.borrow_mut();
            pool.clear(); // Reset for reuse
            std::mem::take(&mut *pool)
        });

        let paths = PATH_POOL.with(|pool| {
            let mut pool = pool.borrow_mut();
            pool.clear();
            std::mem::take(&mut *pool)
        });

        Self {
            tokenizer,
            opts,
            use_longest_token: false,
            components,
            paths,
            _lt: PhantomData,
        }
    }

    #[inline]
    pub fn with_longest_token(mut self) -> Self {
        self.use_longest_token = true;
        self
    }

    pub fn diff(&mut self, old_raw: &'a str, new_raw: &'a str) -> Vec<Change> {
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

        self.run_myers(a_len, b_len, a, b)
    }

    #[inline(always)]
    fn extract_common(
        &mut self,
        path: &mut Path,
        new_toks: &[Token<'a>],
        old_toks: &[Token<'a>],
        diagonal: isize,
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
                let idx = self.components.push(1, false, false, path.last);
                path.last = Some(idx);
            }
        }

        if common > 0 && !self.opts.one_change_per_token {
            let idx = self.components.push(common as u32, false, false, path.last);
            path.last = Some(idx);
        }

        path.old_pos = old_pos;
        new_pos
    }

    fn finish_and_postprocess(
        &self,
        tail: Option<u32>,
        new_toks: &[Token<'a>],
        old_toks: &[Token<'a>],
    ) -> Vec<Change> {
        let chain = self.components.trace_path(tail);

        let (mut new_pos, mut old_pos) = (0usize, 0usize);
        let mut out = Vec::with_capacity(chain.len());

        for &idx in &chain {
            let (count, added, removed, _) = self.components.get(idx);

            let value = if removed {
                let slice = &old_toks[old_pos..old_pos + count as usize];
                old_pos += count as usize;
                self.tokenizer.join(slice)
            } else {
                let slice = &new_toks[new_pos..new_pos + count as usize];
                let val = if !added && self.use_longest_token {
                    let mut chosen = Vec::with_capacity(count as usize);
                    for i in 0..count as usize {
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
                new_pos += count as usize;
                if !added {
                    old_pos += count as usize;
                }
                val
            };

            out.push(Change {
                value: to_owned(value),
                count,
                added,
                removed,
            });
        }

        self.tokenizer.post_process(out, &self.opts)
    }

    #[inline(always)]
    fn extend_path(&mut self, path: Path, added: bool, removed: bool, old_inc: isize) -> Path {
        let merged = if !self.opts.one_change_per_token {
            if let Some(prev_idx) = path.last {
                let (prev_count, prev_added, prev_removed, prev_previous) =
                    self.components.get(prev_idx);
                if prev_added == added && prev_removed == removed {
                    let idx = self
                        .components
                        .push(prev_count + 1, added, removed, prev_previous);
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
            self.components.push(1, added, removed, path.last)
        };

        Path {
            old_pos: path.old_pos + old_inc,
            last: Some(last_idx),
        }
    }

    fn run_myers(
        &mut self,
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

        self.paths.clear();
        self.paths.resize(size, None);

        let mut best0 = Path::default();

        let new_pos = self.extract_common(&mut best0, b, a, 0);

        if best0.old_pos + 1 >= a_len && new_pos + 1 >= b_len {
            return self.finish_and_postprocess(best0.last, b, a);
        }

        self.paths[offset as usize] = Some(best0);

        let (mut min_k_consider, mut max_k_consider) = (isize::MIN, isize::MAX);

        for d in 1..=max_d {
            let k_min = min_k_consider.max(-(d as isize));
            let k_max = max_k_consider.min(d as isize);

            for k in (k_min..=k_max).step_by(2) {
                let idx = (k + offset) as usize;

                let remove_path = if idx > 0 {
                    self.paths[idx - 1].take()
                } else {
                    None
                };
                let add_path = if idx + 1 < size {
                    self.paths[idx + 1]
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
                    self.paths[idx] = None;
                    continue;
                }

                let base = if !can_remove
                    || (can_add
                        && remove_path.as_ref().unwrap().old_pos
                            < add_path.as_ref().unwrap().old_pos)
                {
                    self.extend_path(add_path.unwrap(), true, false, 0)
                } else {
                    self.extend_path(remove_path.unwrap(), false, true, 1)
                };

                self.paths[idx] = Some(base);
                let mut path = self.paths[idx].unwrap();
                let new_pos_after = self.extract_common(&mut path, b, a, k);
                self.paths[idx] = Some(path);

                let p = self.paths[idx].as_ref().unwrap();
                if p.old_pos + 1 >= a_len && new_pos_after + 1 >= b_len {
                    return self.finish_and_postprocess(p.last, b, a);
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

impl<'a, T: Tokeniser<'a>> Drop for PooledDiff<'a, T> {
    fn drop(&mut self) {
        COMPONENT_POOL.with(|pool| {
            *pool.borrow_mut() = std::mem::take(&mut self.components);
        });

        PATH_POOL.with(|pool| {
            *pool.borrow_mut() = std::mem::take(&mut self.paths);
        });
    }
}

#[derive(Debug)]
pub struct PoolStats {
    pub component_pool_size: usize,
    pub path_pool_size: usize,
    pub component_pool_capacity: usize,
    pub path_pool_capacity: usize,
}

pub fn get_pool_stats() -> PoolStats {
    COMPONENT_POOL.with(|pool| {
        let pool = pool.borrow();
        let component_stats = pool.memory_usage();

        PATH_POOL.with(|path_pool| {
            let path_pool = path_pool.borrow();
            PoolStats {
                component_pool_size: component_stats.total_elements,
                path_pool_size: path_pool.len(),
                component_pool_capacity: component_stats.total_bytes(),
                path_pool_capacity: path_pool.capacity() * std::mem::size_of::<Path>(),
            }
        })
    })
}

pub fn clear_pools() {
    COMPONENT_POOL.with(|pool| {
        pool.borrow_mut().clear();
    });

    PATH_POOL.with(|pool| {
        pool.borrow_mut().clear();
    });
}

#[inline(always)]
fn to_owned(s: String) -> String {
    s
}
