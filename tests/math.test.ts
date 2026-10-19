import { expect, test } from "claude-code/testing";

import { splitReply } from "../hooks/markdown";
import { mathSketch } from "../hooks/math";
import { inlineMath, texToText } from "../hooks/math-unicode";
import { baseOf } from "../hooks/palette";
import { cellHeightOf } from "../hooks/picture";

const PALETTE = baseOf("dark");
const FONT = { family: "Helvetica Neue", cellHeight: cellHeightOf(2.9) };

test("display math splits out of a reply in each delimiter style", () => {
  const segments = splitReply(
    "intro\n\n$$\nx^2 + y^2\n$$\n\nmid\n\n\\[ a = b \\]\n\n$$c$$\n\n\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}\n\nend",
  );

  expect(segments.map((segment) => segment.kind)).toEqual(["text", "math", "text", "math", "math", "math", "text"]);
  expect(segments.filter((segment) => segment.kind === "math").map((segment) => segment.tex)).toEqual([
    "x^2 + y^2",
    "a = b",
    "c",
    "\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}",
  ]);
});

test("an equation still streaming, or followed by text on its last line, stays text", () => {
  expect(splitReply("intro\n\n$$\nx^2 +").map((segment) => segment.kind)).toEqual(["text"]);
  expect(splitReply("$$x$$ and more").map((segment) => segment.kind)).toEqual(["text"]);
});

test("math inside a code fence is left as code", () => {
  const segments = splitReply("```tex\n$$\nx\n$$\n```");

  expect(segments.map((segment) => segment.kind)).toEqual(["code"]);
});

test("TeX reads as Unicode text", () => {
  expect(texToText("\\alpha + \\beta \\leq \\gamma")).toBe("α + β ≤ γ");
  expect(texToText("x^2 + y_i^{n+1}")).toBe("x² + yᵢⁿ⁺¹");
  expect(texToText("\\frac{a+b}{c}")).toBe("(a + b)/c");
  expect(texToText("\\sqrt{x}")).toBe("√x");
  expect(texToText("\\sum_{i=1}^{n} i")).toBe("∑ᵢ₌₁ⁿi");
  expect(texToText("\\mathbb{R}^n")).toBe("ℝⁿ");
  expect(texToText("\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}")).toBe("(a b; c d)");
});

test("inline formulas are replaced and prices and code spans are not", () => {
  expect(inlineMath("Let $x \\in \\mathbb{R}$ and \\(y^2\\).")).toBe("Let x ∈ ℝ and y².");
  expect(inlineMath("It costs $5 and $10 in total.")).toBe("It costs $5 and $10 in total.");
  expect(inlineMath("Run `echo $HOME and $PATH` now")).toBe("Run `echo $HOME and $PATH` now");
});

test("display math is drawn as an SVG picture in the theme's text colour", () => {
  const sketch = mathSketch("\\frac{a}{b} + \\sqrt{x^2}", 80, PALETTE, FONT);

  expect(sketch).not.toBeNull();
  expect(sketch!.svg).toContain(PALETTE.text);
  expect(sketch!.svg).not.toContain("currentColor");
  expect(sketch!.rows).toBeGreaterThanOrEqual(2);
  expect(sketch!.columns).toBeLessThanOrEqual(80);
});

test("an equation wider than the room is scaled to fit it", () => {
  const sketch = mathSketch(Array.from({ length: 40 }, (_, i) => `x_${i}`).join(" + "), 40, PALETTE, FONT);

  expect(sketch!.columns).toBeLessThanOrEqual(40);
});

test("TeX MathJax cannot read gives no picture", () => {
  expect(mathSketch("\\frac{a", 80, PALETTE, FONT)).toBeNull();
  expect(mathSketch("\\notacommand{x}", 80, PALETTE, FONT)).toBeNull();
});
