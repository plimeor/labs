//! F29 — tag OR-Set add-wins (D28): order-independent membership.

mod common;
use common::*;

fn tags(vault: &anchor_core::model::Vault, id: &str) -> Vec<String> {
    vault.nodes[id].content.tags.iter().cloned().collect()
}

#[test]
fn distinct_tags_commute() {
    let ops = [
        create_note("c", 1, "mac", "u", "n", None, "V"),
        tag_add("a1", hlc(2, "mac"), "u", "n", "research"),
        tag_add("a2", hlc(3, "iph"), "u", "n", "todo"),
    ];
    let vault = assert_order_independent(&ops);
    assert_eq!(tags(&vault, "n"), vec!["research".to_string(), "todo".to_string()]);
}

#[test]
fn add_wins_over_concurrent_unobserved_remove() {
    // Remove did not observe the add ⇒ add wins.
    let ops = [
        create_note("c", 1, "mac", "u", "n", None, "V"),
        tag_add("ax", hlc(4, "iph"), "uB", "n", "z"),
        tag_remove("rx", hlc(5, "mac"), "uA", "n", "z", &[]),
    ];
    let vault = assert_order_independent(&ops);
    assert!(vault.nodes["n"].content.tags.contains("z"), "add must win");
}

#[test]
fn observed_remove_deletes_tag() {
    let ops = [
        create_note("c", 1, "mac", "u", "n", None, "V"),
        tag_add("ax", hlc(4, "mac"), "u", "n", "z"),
        tag_remove("rx", hlc(5, "mac"), "u", "n", "z", &["ax"]),
    ];
    let vault = assert_order_independent(&ops);
    assert!(!vault.nodes["n"].content.tags.contains("z"), "observed remove deletes");
}

#[test]
fn re_add_after_remove_is_present() {
    // add / remove(observed) / re-add(new identity) ⇒ present, order-independent.
    let ops = [
        create_note("c", 1, "mac", "u", "n", None, "V"),
        tag_add("ax", hlc(2, "mac"), "u", "n", "z"),
        tag_remove("rx", hlc(3, "mac"), "u", "n", "z", &["ax"]),
        tag_add("ax2", hlc(4, "mac"), "u", "n", "z"),
    ];
    let vault = assert_order_independent(&ops);
    assert!(vault.nodes["n"].content.tags.contains("z"), "re-add restores tag");
}
