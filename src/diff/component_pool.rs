pub struct ComponentPool {
    counts: Vec<u32>,
    flags: Vec<u8>,
    previous: Vec<u32>,
    len: usize,
}

impl ComponentPool {
    const FLAG_ADDED: u8 = 1;
    const FLAG_REMOVED: u8 = 2;
    const NONE_MARKER: u32 = u32::MAX;

    pub fn new() -> Self {
        Self::with_capacity(256)
    }

    pub fn with_capacity(cap: usize) -> Self {
        Self {
            counts: Vec::with_capacity(cap),
            flags: Vec::with_capacity(cap),
            previous: Vec::with_capacity(cap),
            len: 0,
        }
    }

    #[inline(always)]
    pub fn push(&mut self, count: u32, added: bool, removed: bool, previous: Option<u32>) -> u32 {
        let idx = self.len as u32;

        self.counts.push(count);

        let mut flag = 0u8;
        if added {
            flag |= Self::FLAG_ADDED;
        }
        if removed {
            flag |= Self::FLAG_REMOVED;
        }
        self.flags.push(flag);

        self.previous.push(previous.unwrap_or(Self::NONE_MARKER));

        self.len += 1;
        idx
    }

    #[inline(always)]
    pub fn get(&self, idx: u32) -> (u32, bool, bool, Option<u32>) {
        let idx = idx as usize;
        debug_assert!(idx < self.len, "Index out of bounds");

        let count = self.counts[idx];
        let flag = self.flags[idx];
        let prev = self.previous[idx];

        (
            count,
            flag & Self::FLAG_ADDED != 0,
            flag & Self::FLAG_REMOVED != 0,
            if prev == Self::NONE_MARKER {
                None
            } else {
                Some(prev)
            },
        )
    }

    #[inline(always)]
    pub fn count(&self, idx: u32) -> u32 {
        self.counts[idx as usize]
    }

    #[inline(always)]
    pub fn is_added(&self, idx: u32) -> bool {
        self.flags[idx as usize] & Self::FLAG_ADDED != 0
    }

    #[inline(always)]
    pub fn is_removed(&self, idx: u32) -> bool {
        self.flags[idx as usize] & Self::FLAG_REMOVED != 0
    }

    #[inline(always)]
    pub fn previous(&self, idx: u32) -> Option<u32> {
        let prev = self.previous[idx as usize];
        if prev == Self::NONE_MARKER {
            None
        } else {
            Some(prev)
        }
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn clear(&mut self) {
        self.counts.clear();
        self.flags.clear();
        self.previous.clear();
        self.len = 0;
    }

    pub fn trace_path(&self, start: Option<u32>) -> Vec<u32> {
        let mut path = Vec::new();
        let mut current = start;

        while let Some(idx) = current {
            path.push(idx);
            let prev = self.previous[idx as usize];
            current = if prev == Self::NONE_MARKER {
                None
            } else {
                Some(prev)
            };
        }

        path.reverse();
        path
    }

    pub fn find_by_flags(&self, added: bool, removed: bool) -> Vec<u32> {
        let target_flag = (if added { Self::FLAG_ADDED } else { 0 })
            | (if removed { Self::FLAG_REMOVED } else { 0 });

        let mut result = Vec::new();
        for (idx, &flag) in self.flags.iter().enumerate() {
            if flag == target_flag {
                result.push(idx as u32);
            }
        }
        result
    }

    pub fn memory_usage(&self) -> ComponentPoolMemoryStats {
        ComponentPoolMemoryStats {
            counts_bytes: self.counts.capacity() * std::mem::size_of::<u32>(),
            flags_bytes: self.flags.capacity() * std::mem::size_of::<u8>(),
            previous_bytes: self.previous.capacity() * std::mem::size_of::<u32>(),
            total_elements: self.len,
        }
    }
}

impl Default for ComponentPool {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
pub struct ComponentPoolMemoryStats {
    pub counts_bytes: usize,
    pub flags_bytes: usize,
    pub previous_bytes: usize,
    pub total_elements: usize,
}

impl ComponentPoolMemoryStats {
    pub fn total_bytes(&self) -> usize {
        self.counts_bytes + self.flags_bytes + self.previous_bytes
    }

    pub fn bytes_per_element(&self) -> f64 {
        if self.total_elements == 0 {
            0.0
        } else {
            self.total_bytes() as f64 / self.total_elements as f64
        }
    }
}
