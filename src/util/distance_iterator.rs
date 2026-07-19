pub struct DistanceIterator {
    next_forward: isize,
    next_backward: isize,
    want_forward: bool,
    forward_exhausted: bool,
    backward_exhausted: bool,
    min: isize,
    max: isize,
}

impl DistanceIterator {
    pub fn new(start: isize, min: isize, max: isize) -> Self {
        Self {
            next_forward: start,
            next_backward: start,
            want_forward: true,
            forward_exhausted: false,
            backward_exhausted: false,
            min,
            max,
        }
    }
}

impl Iterator for DistanceIterator {
    type Item = isize;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.want_forward && self.forward_exhausted {
                self.want_forward = false;
            } else if !self.want_forward && self.backward_exhausted {
                self.want_forward = true;
            }

            if self.want_forward && !self.forward_exhausted {
                self.want_forward = false;
                match self.next_forward.checked_add(1) {
                    Some(next) if next <= self.max => {
                        self.next_forward = next;
                        return Some(next);
                    }
                    _ => self.forward_exhausted = true,
                }
            } else if !self.backward_exhausted {
                self.want_forward = true;
                match self.next_backward.checked_sub(1) {
                    Some(next) if next >= self.min => {
                        self.next_backward = next;
                        return Some(next);
                    }
                    _ => self.backward_exhausted = true,
                }
            }

            if self.forward_exhausted && self.backward_exhausted {
                return None;
            }
        }
    }
}
