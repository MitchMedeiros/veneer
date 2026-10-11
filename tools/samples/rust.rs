//! Crate doc
use std::collections::HashMap;

/// Doc comment
#[derive(Debug, Clone, PartialEq)]
pub struct Point<T: Copy> {
    pub x: T,
    y: T,
}

// line comment
impl<T: Copy + std::ops::Add<Output = T>> Point<T> {
    pub const ORIGIN: usize = 0;
    pub fn sum(&self) -> T {
        self.x + self.y
    }
}

enum Shape {
    Circle(f64),
    Rect { w: f64, h: f64 },
}

fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() > b.len() { a } else { b }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let raw = r#"raw "string""#;
    let s = "esc\n\u{1F600} {}";
    let c = b'a';
    let n = 0xFF_u8 as u32 + 1_000 + 3.5e-2f64 as u32;
    let mut map: HashMap<String, Vec<i32>> = HashMap::new();
    map.entry("a".into()).or_default().push(1);
    match n {
        0..=9 => println!("{s} {}", raw),
        x if x > 100 => {}
        _ => unsafe { std::hint::unreachable_unchecked() },
    }
    let closure = |a: i32, b| -> i32 { a + b };
    macro_rules! twice { ($e:expr) => { $e * 2 }; }
    Ok(())
}
