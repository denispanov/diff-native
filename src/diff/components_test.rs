use super::components::Component;
use std::mem;

#[test]
fn test_component_size() {
    assert_eq!(mem::size_of::<Component>(), 8);
}

#[test]
fn test_component_functionality() {
    let comp = Component::new(42, true, false, Some(100));
    assert_eq!(comp.count(), 42);
    assert!(comp.is_added());
    assert!(!comp.is_removed());
    assert_eq!(comp.previous(), Some(100));

    let comp = Component::new(10, false, true, None);
    assert_eq!(comp.count(), 10);
    assert!(!comp.is_added());
    assert!(comp.is_removed());
    assert_eq!(comp.previous(), None);

    let comp = Component::new(5, true, true, Some(50));
    assert_eq!(comp.count(), 5);
    assert!(comp.is_added());
    assert!(comp.is_removed());
    assert_eq!(comp.previous(), Some(50));

    let comp = Component::new(0, false, false, Some(Component::PREVIOUS_MASK - 1));
    assert_eq!(comp.count(), 0);
    assert!(!comp.is_added());
    assert!(!comp.is_removed());
    assert_eq!(comp.previous(), Some(Component::PREVIOUS_MASK - 1));
}

#[test]
#[should_panic(expected = "Count too large for packed representation")]
fn test_count_overflow() {
    Component::new(1 << 30, false, false, None);
}

#[test]
#[should_panic(expected = "Previous index too large")]
fn test_previous_overflow() {
    Component::new(100, false, false, Some(1 << 30));
}
