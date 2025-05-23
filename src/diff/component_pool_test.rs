use super::component_pool::ComponentPool;

#[test]
fn test_component_pool_basic() {
    let mut pool = ComponentPool::new();

    let idx1 = pool.push(42, true, false, None);
    let idx2 = pool.push(10, false, true, Some(idx1));
    let idx3 = pool.push(5, true, true, Some(idx2));

    assert_eq!(pool.len(), 3);

    let (count, added, removed, prev) = pool.get(idx1);
    assert_eq!(count, 42);
    assert!(added);
    assert!(!removed);
    assert_eq!(prev, None);

    let (count, added, removed, prev) = pool.get(idx2);
    assert_eq!(count, 10);
    assert!(!added);
    assert!(removed);
    assert_eq!(prev, Some(idx1));

    let (count, added, removed, prev) = pool.get(idx3);
    assert_eq!(count, 5);
    assert!(added);
    assert!(removed);
    assert_eq!(prev, Some(idx2));
}

#[test]
fn test_trace_path() {
    let mut pool = ComponentPool::new();

    let idx1 = pool.push(1, false, false, None);
    let idx2 = pool.push(2, false, false, Some(idx1));
    let idx3 = pool.push(3, false, false, Some(idx2));

    let path = pool.trace_path(Some(idx3));
    assert_eq!(path, vec![idx1, idx2, idx3]);

    let path = pool.trace_path(None);
    assert!(path.is_empty());
}

#[test]
fn test_find_by_flags() {
    let mut pool = ComponentPool::new();

    let _idx1 = pool.push(1, true, false, None);
    let idx2 = pool.push(2, false, true, None);
    let _idx3 = pool.push(3, true, true, None);
    let _idx4 = pool.push(4, false, false, None);
    let idx5 = pool.push(5, false, true, None);

    let removed_only = pool.find_by_flags(false, true);
    assert_eq!(removed_only, vec![idx2, idx5]);

    let added_only = pool.find_by_flags(true, false);
    assert_eq!(added_only.len(), 1);

    let both = pool.find_by_flags(true, true);
    assert_eq!(both.len(), 1);

    let neither = pool.find_by_flags(false, false);
    assert_eq!(neither.len(), 1);
}

#[test]
fn test_clear() {
    let mut pool = ComponentPool::new();

    pool.push(1, true, false, None);
    pool.push(2, false, true, None);

    assert_eq!(pool.len(), 2);

    pool.clear();

    assert_eq!(pool.len(), 0);
    assert!(pool.is_empty());
}
