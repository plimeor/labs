---
tags:
  - sample/structure
created: 2026-06-10
related:
  - "[[another note]]"
---

# 结构复杂的样例笔记 🧪

A paragraph mixing **bold**, `inline code`, a [[wikilink]], and CJK 文本，
with a soft newline and an emoji 🎉.

> 引用段落：A blockquote
> spanning two lines.

- top item
  - nested item with 中文
  - another nested
- second top item

1. ordered one
2. ordered two

| col A | col B |
| ----- | ----- |
| 值 1  | value |
| 值 2  | 𝄞 surrogate pair |

---

````markdown
An outer 4-backtick fence holding a smaller fence:

```rust
fn main() {

    println!("blank line above stays inside");
}
```

Prose between inner fences.
````

~~~text
A tilde fence

with a blank line.
~~~

Final paragraph after everything.
