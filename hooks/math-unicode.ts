const GREEK =
  "alpha α beta β gamma γ delta δ epsilon ϵ varepsilon ε zeta ζ eta η theta θ vartheta ϑ iota ι kappa κ lambda λ mu μ nu ν " +
  "xi ξ pi π varpi ϖ rho ρ varrho ϱ sigma σ varsigma ς tau τ upsilon υ phi ϕ varphi φ chi χ psi ψ omega ω Gamma Γ " +
  "Delta Δ Theta Θ Lambda Λ Xi Ξ Pi Π Sigma Σ Upsilon Υ Phi Φ Psi Ψ Omega Ω";

const SYMBOLS =
  "partial ∂ nabla ∇ infty ∞ hbar ℏ ell ℓ Re ℜ Im ℑ aleph ℵ emptyset ∅ varnothing ∅ forall ∀ exists ∃ neg ¬ lnot ¬ " +
  "wedge ∧ land ∧ vee ∨ lor ∨ cap ∩ cup ∪ setminus ∖ sum ∑ prod ∏ coprod ∐ int ∫ iint ∬ iiint ∭ oint ∮ " +
  "bigcup ⋃ bigcap ⋂ angle ∠ triangle △ square □ prime ′ degree ° dots … ldots … cdots ⋯ vdots ⋮ ddots ⋱ dagger † " +
  "ddagger ‡ star ⋆ ast ∗ circ ∘ bullet • top ⊤ bot ⊥ perp ⊥ parallel ∥ mid ∣ nmid ∤ lbrace { rbrace } " +
  "langle ⟨ rangle ⟩ lceil ⌈ rceil ⌉ lfloor ⌊ rfloor ⌋ vert | Vert ‖";

const SPACED =
  "pm ± mp ∓ times × div ÷ cdot ⋅ oplus ⊕ ominus ⊖ otimes ⊗ odot ⊙ leq ≤ le ≤ geq ≥ ge ≥ neq ≠ ne ≠ approx ≈ " +
  "sim ∼ simeq ≃ cong ≅ equiv ≡ propto ∝ ll ≪ gg ≫ prec ≺ succ ≻ preceq ⪯ succeq ⪰ in ∈ notin ∉ ni ∋ " +
  "subset ⊂ supset ⊃ subseteq ⊆ supseteq ⊇ nsubseteq ⊈ to → rightarrow → leftarrow ← gets ← leftrightarrow ↔ " +
  "Rightarrow ⇒ Leftarrow ⇐ Leftrightarrow ⇔ implies ⟹ impliedby ⟸ iff ⟺ mapsto ↦ longrightarrow ⟶ " +
  "longleftarrow ⟵ uparrow ↑ downarrow ↓ hookrightarrow ↪ rightharpoonup ⇀ vdash ⊢ models ⊨ therefore ∴ because ∵ " +
  "colon : amalg ⨿";

const FUNCTIONS = new Set([
  ...["sin", "cos", "tan", "cot", "sec", "csc", "sinh", "cosh", "tanh", "arcsin", "arccos", "arctan"],
  ...["log", "ln", "lg", "exp", "lim", "liminf", "limsup", "max", "min", "sup", "inf", "det", "dim", "ker", "deg"],
  ...["gcd", "arg", "Pr", "hom", "mod"],
]);

const pairs = (list: string): [string, string][] => {
  const words = list.split(" ");

  return Array.from({ length: words.length / 2 }, (_, i) => [words[2 * i]!, words[2 * i + 1]!]);
};

const glyphs = new Map<string, string>([...pairs(GREEK), ...pairs(SYMBOLS)]);
const spaced = new Map<string, string>(pairs(SPACED).map(([name, glyph]) => [name, ` ${glyph} `]));

const SUPERSCRIPT = zip("0123456789+-=()abcdefghijklmnoprstuvwxyzABDEGHIJKLMNOPRTUVWθβγφχ", [
  ..."⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁⱽᵂᶿᵝᵞᵠᵡ",
]);
const SUBSCRIPT = zip("0123456789+-=()aehijklmnoprstuvxβγρφχ", [..."₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓᵦᵧᵨᵩᵪ"]);

const DOUBLE_STRUCK = zip("CHNPQRZ", [..."ℂℍℕℙℚℝℤ"]);
const ACCENTS: Record<string, string> = {
  hat: "̂",
  widehat: "̂",
  bar: "̄",
  overline: "̄",
  tilde: "̃",
  widetilde: "̃",
  dot: "̇",
  ddot: "̈",
  vec: "⃗",
  underline: "̲",
};
const WRAPPERS = new Set([
  ...["text", "textrm", "textbf", "textit", "mathrm", "mathbf", "mathit", "mathsf", "mathtt", "mathcal", "mathfrak"],
  ...["mathscr", "operatorname", "boldsymbol", "bm", "mbox"],
]);
const STYLE_SWITCHES = new Set(["displaystyle", "textstyle", "scriptstyle", "limits", "nolimits"]);
const SIZED_FENCE = /^(left|right|[bB]ig+[lr]?)$/;
const MATRICES = /^(p|b|B|v|V|small)?matrix\*?$/;
const FENCES: Record<string, [string, string]> = { p: ["(", ")"], b: ["[", "]"], B: ["{", "}"], v: ["|", "|"] };

function zip(keys: string, values: string[]): Map<string, string> {
  return new Map([...keys].map((key, i) => [key, values[i]!]));
}

const script = (map: ReadonlyMap<string, string>, marker: string, text: string): string => {
  const chars = [...text.replaceAll(" − ", "-").replace(/\s+/g, "")];

  if (chars.length > 0 && chars.every((char) => map.has(char))) {
    return chars.map((char) => map.get(char)!).join("");
  }

  return chars.length === 1 ? `${marker}${text}` : `${marker}(${text})`;
};

const isAtom = (text: string): boolean => [...text].length === 1;
const group = (text: string): string => (isAtom(text) || /^[\w.]+$/.test(text) ? text : `(${text})`);

// TeX as one line of Unicode text: Greek letters, operators and sub and superscripts as glyphs, fractions as `a/b`. It
// covers what reads well in a line; layout that needs two dimensions, such as a stacked fraction, is flattened.
export function texToText(tex: string): string {
  return new Reader(tex).run().replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
}

class Reader {
  private at = 0;

  constructor(private readonly source: string) {}

  run(): string {
    let out = "";

    while (this.at < this.source.length) {
      out += this.next();
    }

    return out;
  }

  // The text of one item and everything bound to it: a script after it attaches to what came before.
  private next(): string {
    const char = this.source[this.at++]!;

    if (char === "^" || char === "_") {
      const inner = this.operand();

      return script(char === "^" ? SUPERSCRIPT : SUBSCRIPT, char, inner);
    }

    if (char === "\\") {
      return this.command();
    }

    if (char === "{") {
      return new Reader(this.braced()).run();
    }

    if (char === "-") {
      return /[\w})]/.test(
        this.source
          .slice(0, this.at - 1)
          .trimEnd()
          .slice(-1),
      )
        ? " − "
        : "-";
    }

    if ("+=<>".includes(char)) {
      return ` ${char} `;
    }

    return /\s/.test(char) ? "" : char === "~" || char === "&" ? " " : char;
  }

  // The group that opens at the cursor, which is just past its `{`, and the cursor moves past its `}`.
  private braced(): string {
    const start = this.at;
    let depth = 1;

    while (this.at < this.source.length && depth > 0) {
      const char = this.source[this.at++];

      depth += char === "{" ? 1 : char === "}" ? -1 : char === "\\" ? (this.at++, 0) : 0;
    }

    return this.source.slice(start, depth === 0 ? this.at - 1 : this.at);
  }

  // The converted text of the next argument: a group, a command, or one character.
  private operand(): string {
    while (/\s/.test(this.source[this.at] ?? "")) {
      this.at++;
    }

    if (this.at >= this.source.length) {
      return "";
    }

    if (this.source[this.at] === "{") {
      this.at++;

      return new Reader(this.braced()).run().trim();
    }

    if (this.source[this.at] === "\\") {
      this.at++;

      return this.command().trim();
    }

    return this.source[this.at++]!;
  }

  private optional(): string | undefined {
    if (this.source[this.at] !== "[") {
      return undefined;
    }

    const end = this.source.indexOf("]", this.at);
    const text = this.source.slice(this.at + 1, end === -1 ? undefined : end);

    this.at = end === -1 ? this.source.length : end + 1;

    return text;
  }

  private command(): string {
    const name = /^[A-Za-z]+/.exec(this.source.slice(this.at))?.[0];

    if (name === undefined) {
      const symbol = this.source[this.at++] ?? "";

      return symbol === "\\" ? " ; " : /[,;:!> ]/.test(symbol) ? (symbol === "!" ? "" : " ") : symbol;
    }

    this.at += name.length;

    if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "cfrac") {
      const top = this.operand();

      return `${group(top)}/${group(this.operand())}`;
    }

    if (name === "binom") {
      const top = this.operand();

      return `C(${top}, ${this.operand()})`;
    }

    if (name === "sqrt") {
      const index = this.optional();
      const body = this.operand();
      const root = index === "3" ? "∛" : index === "4" ? "∜" : "√";

      return `${index === undefined || root !== "√" ? "" : `${script(SUPERSCRIPT, "^", index)}`}${root}${isAtom(body) ? body : `(${body})`}`;
    }

    if (name === "mathbb") {
      return [...this.operand()].map((char) => DOUBLE_STRUCK.get(char) ?? char).join("");
    }

    const accent = ACCENTS[name];

    if (accent !== undefined) {
      const body = [...this.operand()];

      return body.length === 0 ? "" : `${body[0]}${accent}${body.slice(1).join("")}`;
    }

    if (name === "begin") {
      return this.environment(this.operand());
    }

    if (name === "end") {
      this.operand();

      return "";
    }

    if (name === "color") {
      this.operand();

      return "";
    }

    if (name === "quad" || name === "qquad") {
      return "  ";
    }

    if (STYLE_SWITCHES.has(name)) {
      return "";
    }

    if (SIZED_FENCE.test(name)) {
      this.at += this.source[this.at] === "." ? 1 : 0;

      return "";
    }

    if (WRAPPERS.has(name)) {
      return this.operand();
    }

    if (FUNCTIONS.has(name)) {
      return `${name} `;
    }

    return spaced.get(name) ?? glyphs.get(name) ?? name;
  }

  private environment(kind: string): string {
    const close = `\\end{${kind}}`;
    const end = this.source.indexOf(close, this.at);
    const body = this.source.slice(this.at, end === -1 ? undefined : end);

    this.at = end === -1 ? this.source.length : end + close.length;

    const rows = body
      .split(/\\\\/)
      .map((row) =>
        row
          .split("&")
          .map((cell) => new Reader(cell).run().trim())
          .join(MATRICES.test(kind) ? " " : "  "),
      )
      .filter((row) => row.trim() !== "");
    const matrix = MATRICES.exec(kind);

    if (matrix === null) {
      return rows.join("; ");
    }

    const [open, shut] = FENCES[matrix[1] ?? ""] ?? ["", ""];

    return `${open}${rows.join("; ")}${shut}`;
  }
}

const CODE_SPAN = /(`[^`\n]*`)/;
const INLINE = /\\\((.+?)\\\)|(?<![\\$\d])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?!\d)/g;

// Text with each inline formula, `$...$` or `\(...\)`, replaced by its Unicode form. Code spans are left alone.
export function inlineMath(text: string): string {
  if (!text.includes("$") && !text.includes("\\(")) {
    return text;
  }

  return text
    .split(CODE_SPAN)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(INLINE, (_, paren, dollar) => texToText(paren ?? dollar))))
    .join("");
}
