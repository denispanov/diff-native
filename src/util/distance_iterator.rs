pub struct DistanceIterator {
    next_forward: isize,
    next_backward: isize,
    want_forward: bool,
    min: isize,
    max: isize,
}

impl DistanceIterator {
    pub fn new(start: isize, min: isize, max: isize) -> Self {
        Self {
            next_forward: start,
            next_backward: start,
            want_forward: true,
            min,
            max,
        }
    }
}

impl Iterator for DistanceIterator {
    type Item = isize;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.want_forward {
                self.next_forward += 1;
                self.want_forward = false;
                if self.next_forward <= self.max {
                    return Some(self.next_forward);
                }
            } else {
                self.next_backward -= 1;
                self.want_forward = true;
                if self.next_backward >= self.min {
                    return Some(self.next_backward);
                }
            }

            if self.next_forward > self.max && self.next_backward < self.min {
                return None;
            }
        }
    }
}
