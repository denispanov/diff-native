pub fn array_equal<T: PartialEq>(a: &[T], b: &[T]) -> bool {
    a.len() == b.len() && array_starts_with(a, b)
}

pub fn array_starts_with<T: PartialEq>(array: &[T], start: &[T]) -> bool {
    if start.len() > array.len() {
        return false;
    }
    array.iter().zip(start).all(|(l, r)| l == r)
}
