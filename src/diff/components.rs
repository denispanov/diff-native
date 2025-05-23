// Optimized component structure - exactly 8 bytes
// Packs the flags and previous index into a single u32
#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct Component {
    count: u32,
    previous_and_flags: u32,
}

impl Component {
    pub const ADDED_FLAG: u32 = 1 << 31;
    pub const REMOVED_FLAG: u32 = 1 << 30;
    pub const PREVIOUS_MASK: u32 = (1 << 30) - 1;
    pub const NONE_MARKER: u32 = (1 << 30) - 1;

    #[inline(always)]
    pub fn new(count: u32, added: bool, removed: bool, previous: Option<u32>) -> Self {
        debug_assert!(
            count < (1 << 30),
            "Count too large for packed representation"
        );

        let mut packed = previous.unwrap_or(Self::NONE_MARKER);
        debug_assert!(packed <= Self::PREVIOUS_MASK, "Previous index too large");

        if added {
            packed |= Self::ADDED_FLAG;
        }
        if removed {
            packed |= Self::REMOVED_FLAG;
        }

        Self {
            count,
            previous_and_flags: packed,
        }
    }

    #[inline(always)]
    pub fn count(&self) -> u32 {
        self.count
    }

    #[inline(always)]
    pub fn is_added(&self) -> bool {
        self.previous_and_flags & Self::ADDED_FLAG != 0
    }

    #[inline(always)]
    pub fn is_removed(&self) -> bool {
        self.previous_and_flags & Self::REMOVED_FLAG != 0
    }

    #[inline(always)]
    pub fn previous(&self) -> Option<u32> {
        let prev = self.previous_and_flags & Self::PREVIOUS_MASK;
        if prev == Self::NONE_MARKER {
            None
        } else {
            Some(prev)
        }
    }
}
