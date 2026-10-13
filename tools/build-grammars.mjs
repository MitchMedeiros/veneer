// Dev only. Turns the TextMate grammars of the `tm-grammars` package into the compact JSON the mod reads at run time:
// every regex translated to JavaScript, `captures` settled, unused fields dropped. Run with `npm run build:grammars`.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { toRegExpDetails } from "oniguruma-to-es";
import { grammars as available } from "tm-grammars";

import { ANCHOR_MARK, BACK_REFERENCE_MARK, FIRST_LINE_MARK, withoutMarks } from "../hooks/syntax/mark.ts";

const OUT = new URL("../grammars/", import.meta.url);
const SOURCE = new URL("../node_modules/tm-grammars/grammars/", import.meta.url);
const wanted = JSON.parse(readFileSync(new URL("./languages.json", import.meta.url), "utf8"));

// How deep a recursive pattern, such as nested template arguments, is unrolled. Each level multiplies the size of the
// regex. Oniguruma allows 20; 8 cut the first highlight of C++ by more than half, and code nested deeper is rare.
const RECURSION_LIMIT = 8;

// Unicode classes that V8 spends most of its compile time on where a grammar repeats them, and a class that matches
// nearly the same text and compiles several times faster. The word class is the translator's Oniguruma `\w`; the
// replacement differs from it for a few symbols (superscript digits, fractions, enclosing marks). `\d` is ASCII digits
// only, `\s` adds U+FEFF, and `ID_Start` leaves out some combining marks that `Alphabetic` has. All are rare in code.
const FASTER_CLASSES = [
  [String.raw`\p{L}\p{M}\p{N}\p{Pc}`, String.raw`\p{ID_Continue}`],
  [String.raw`\p{Alpha}`, String.raw`\p{ID_Start}`],
  [String.raw`\p{Nd}`, String.raw`\d`],
  [String.raw`\p{space}`, String.raw`\s`],
];

const HEX_PROPERTY = String.raw`\p{AHex}`;

// `AHex` is exactly the hex digits. Its replacement is the bare range inside a character class and a class outside one.
function hexDigits(pattern) {
  let out = "";
  let inClass = false;

  for (let at = 0; at < pattern.length; at++) {
    const char = pattern[at];

    if (char === "\\") {
      if (pattern.startsWith(HEX_PROPERTY, at)) {
        out += inClass ? "0-9A-Fa-f" : "[0-9A-Fa-f]";
        at += HEX_PROPERTY.length - 1;
      } else {
        out += char + (pattern[++at] ?? "");
      }
    } else {
      if (char === "[") inClass = true;
      else if (char === "]") inClass = false;

      out += char;
    }
  }

  return out;
}

const fasterClasses = (pattern) =>
  hexDigits(FASTER_CLASSES.reduce((out, [slow, fast]) => out.replaceAll(slow, fast), pattern));

// A class intersection (`&&`) needs ES2024, and so does a nested class. The forms the grammars use are rewritten before
// translation. `[[base]&&[^without]]` becomes a look ahead and the base class; inside a look behind, which cannot hold
// a look ahead, it becomes two look behinds. Digits without the dot is the digits, and Racket's `[[^\w\s]\d]` and
// `[^\W\d]` are written out as alternatives.
const INTERSECTION = String.raw`\[\[([^\]]*)\]&&\[\^(\]?[^\]]*)\]\]`;
const NOT_BEHIND = new RegExp(String.raw`\(\?<!${INTERSECTION}\)`, "g");
const BEHIND = new RegExp(String.raw`\(\?<=${INTERSECTION}\)`, "g");
const AHEAD = new RegExp(INTERSECTION, "g");
const DIGITS_WITHOUT_DOT = /\[0-9&&\[\^\.\]\]/g;
const NOT_WORD_OR_SPACE_OR_DIGIT = String.raw`[[^\w\s]\d]`;
const WORD_WITHOUT_DIGIT = String.raw`[^\W\d]`;

const escaped = (chars) => chars.replace(/^\]/, String.raw`\]`);

const withoutIntersections = (pattern) =>
  pattern
    .replace(NOT_BEHIND, (_, base, without) => String.raw`(?:(?<![${base}])|(?<=[${escaped(without)}]))`)
    .replace(BEHIND, (_, base, without) => String.raw`(?<=[${base}])(?<![${escaped(without)}])`)
    .replace(AHEAD, (_, base, without) => String.raw`(?:(?![${escaped(without)}])[${base}])`)
    .replace(DIGITS_WITHOUT_DOT, "[0-9]")
    .replaceAll(NOT_WORD_OR_SPACE_OR_DIGIT, String.raw`(?:[^\w\s]|\d)`)
    .replaceAll(WORD_WITHOUT_DIGIT, String.raw`(?:(?!\d)\w)`);

const NEVER = String.fromCharCode(0xffff);

const failures = [];

// A regex as `/source/flags`, and `groups`: the group number in the JavaScript regex of each group the grammar wrote,
// which differs where the translation adds groups of its own. `indices` asks for capture positions. `backReferences`
// turns `\N` into marks the tokenizer fills in once the begin has matched, numbered through `beginGroups`.
function translate(pattern, { indices, backReferences, beginGroups }, where) {
  // The translator cannot say `\G` or a back reference to another regex, so both become marks the tokenizer fills in.
  const source = withoutIntersections(pattern).replace(/(\\\\)|\\G|\\A|\\([1-9])/g, (all, pair, n) => {
    if (pair) return all;
    if (all === "\\G") return ANCHOR_MARK;
    if (all === "\\A") return FIRST_LINE_MARK;
    if (!backReferences) return all;

    return `${BACK_REFERENCE_MARK}${beginGroups?.[n - 1] ?? n}${BACK_REFERENCE_MARK}`;
  });

  try {
    const details = toRegExpDetails(source, {
      accuracy: "loose",
      target: "ES2018",
      hasIndices: indices,
      rules: {
        allowOrphanBackrefs: true,
        asciiWordBoundaries: true,
        captureGroup: true,
        recursionLimit: RECURSION_LIMIT,
        singleline: true,
      },
    });
    const hidden = new Set(details.options?.hiddenCaptures ?? []);
    const total = new RegExp(`${withoutMarks(details.pattern)}|`, details.flags).exec("")?.length ?? 1;
    const groups = [];

    for (let index = 1; index < total; index++) {
      if (!hidden.has(index)) groups.push(index);
    }

    return { source: `/${fasterClasses(details.pattern)}/${details.flags}`, groups };
  } catch (error) {
    failures.push(`${where}: ${error.message.split("\n")[0]} in ${pattern.slice(0, 80)}`);

    return null;
  }
}

// A scope name may use `$N` and `${N:/downcase}` for group N of the match. Renumbers them to the groups of the regex as
// translated, so the tokenizer can read them straight from its match.
const renumber = (name, groups) =>
  name?.replace(/\$(\d+)|\$\{(\d+):/g, (found, plain, braced) => {
    const at = Number(plain ?? braced);
    const mapped = at === 0 ? 0 : (groups[at - 1] ?? at);

    return plain === undefined ? `\${${mapped}:` : `$${mapped}`;
  });

// The captures of a rule, numbered by the groups of the regex as translated.
function compileCaptures(captures, groups, where) {
  if (captures === undefined) {
    return undefined;
  }

  const result = {};

  for (const [key, capture] of Object.entries(captures)) {
    const patterns = capture.patterns && compilePatterns(capture.patterns, `${where}/${key}`);
    const at = key === "0" ? 0 : groups[Number(key) - 1];

    if (at !== undefined) {
      result[at] = {
        ...(capture.name && { name: renumber(capture.name, groups) }),
        ...(patterns?.length && { patterns }),
      };
    }
  }

  return result;
}

const isEmpty = (object) => object === undefined || Object.keys(object).length === 0;

// A regex with its captures, or null when it cannot be translated.
function compileRegex(pattern, captures, options, where) {
  const translated = translate(pattern, { ...options, indices: !isEmpty(captures) }, where);

  return translated === null ? null : { ...translated, captures: compileCaptures(captures, translated.groups, where) };
}

// A rule may carry a repository of its own, which only that rule and what lies inside it can include. The mod has one
// repository per grammar, so each entry is moved there under a name no other rule has, and the includes inside the
// rule are pointed at the new names.
const hoisted = {};
let localNames = new Map();

function includeOf(target) {
  const found = target.startsWith("#") ? localNames.get(target.slice(1)) : undefined;

  return found === undefined ? target : `#${found}`;
}

// One rule as the mod reads it, or null when a regex of it cannot be translated.
function compileRule(rule, where) {
  const outer = localNames;

  if (rule.repository) {
    localNames = new Map(outer);

    for (const key of Object.keys(rule.repository)) localNames.set(key, `${where}/${key}`);

    for (const [key, entry] of Object.entries(rule.repository)) {
      const compiled = compileRule(entry, localNames.get(key));

      if (compiled !== null) hoisted[localNames.get(key)] = compiled;
    }
  }

  try {
    return compileRuleBody(rule, where);
  } finally {
    localNames = outer;
  }
}

function compileRuleBody(rule, where) {
  if (rule.disabled) {
    return null;
  }

  if (rule.include !== undefined) {
    return { include: includeOf(rule.include) };
  }

  const out = {};

  if (rule.match !== undefined) {
    const match = compileRegex(rule.match, rule.captures, {}, where);

    if (match === null) return null;

    if (rule.name) out.name = renumber(rule.name, match.groups);
    out.match = match.source;
    if (!isEmpty(match.captures)) out.captures = match.captures;
  } else if (rule.begin !== undefined) {
    // A rule closes with `end` or, for a block that continues while each line matches, with `while`.
    const closer = rule.while === undefined ? "end" : "while";
    // A missing or empty `end` never closes the rule, as in vscode-textmate, which gives it a character that cannot occur.
    const closing = rule[closer] || NEVER;
    const begin = compileRegex(rule.begin, rule.beginCaptures ?? rule.captures, {}, `${where}/begin`);
    const close =
      begin === null
        ? null
        : compileRegex(
            closing,
            rule[`${closer}Captures`] ?? rule.captures,
            { backReferences: true, beginGroups: begin.groups },
            `${where}/${closer}`,
          );

    if (begin === null || close === null) return null;

    if (rule.name) out.name = renumber(rule.name, begin.groups);
    if (rule.contentName) out.contentName = renumber(rule.contentName, begin.groups);
    out.begin = begin.source;
    out[closer] = close.source;
    if (!isEmpty(begin.captures)) out.beginCaptures = begin.captures;
    if (!isEmpty(close.captures)) out[`${closer}Captures`] = close.captures;
    if (rule.applyEndPatternLast) out.applyEndPatternLast = true;
  } else if (!rule.patterns) {
    return null;
  }

  if (rule.patterns) {
    out.patterns = compilePatterns(rule.patterns, where);
  }

  return out;
}

function compilePatterns(patterns, where) {
  return patterns.map((rule, i) => compileRule(rule, `${where}[${i}]`)).filter((rule) => rule !== null);
}

function includesOf(value, found = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => includesOf(item, found));
  } else if (value && typeof value === "object") {
    if (typeof value.include === "string" && !value.include.startsWith("#") && !value.include.startsWith("$")) {
      found.add(value.include.split("#")[0]);
    }

    Object.values(value).forEach((item) => includesOf(item, found));
  }

  return found;
}

// A grammar may include languages that are not shipped; those includes match nothing, and the grammar lists as `deps`
// only the shipped ones, so the mod loads no more than it has.
function compileGrammar(source, shipped) {
  const repository = {};

  Object.keys(hoisted).forEach((key) => delete hoisted[key]);

  for (const [key, rule] of Object.entries(source.repository ?? {})) {
    const compiled = compileRule(rule, `${source.name}#${key}`);

    if (compiled !== null) repository[key] = compiled;
  }

  const grammar = { scopeName: source.scopeName, patterns: compilePatterns(source.patterns ?? [], source.name) };

  Object.assign(repository, hoisted);

  if (Object.keys(repository).length > 0) grammar.repository = repository;

  const deps = [...includesOf(source)].filter((scope) => scope !== source.scopeName && shipped.has(scope));

  if (deps.length > 0) grammar.deps = deps;

  return grammar;
}

const byName = new Map(available.map((entry) => [entry.name, entry]));
const entries = Object.keys(wanted).map((name) => {
  const entry = byName.get(name);

  if (entry === undefined) throw new Error(`tm-grammars has no grammar named ${name}`);

  return entry;
});
const shipped = new Set(entries.map((entry) => entry.scopeName));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const entry of entries) {
  const source = JSON.parse(readFileSync(new URL(`${entry.name}.json`, SOURCE), "utf8"));

  writeFileSync(new URL(`${entry.name}.json`, OUT), JSON.stringify(compileGrammar(source, shipped)));
}

const languages = Object.fromEntries(
  entries.map((entry) => [
    entry.name,
    {
      scopeName: entry.scopeName,
      file: `${entry.name}.json`,
      aliases: entry.aliases ?? [],
      extensions: wanted[entry.name].extensions,
    },
  ]),
);
const scopes = Object.fromEntries(entries.map((entry) => [entry.scopeName, `${entry.name}.json`]));

writeFileSync(new URL("index.json", OUT), JSON.stringify({ languages, scopes }));
copyFileSync(new URL("../node_modules/tm-grammars/NOTICE", import.meta.url), new URL("NOTICE", OUT));

// The rules a theme falls back on for scopes it does not colour, as VS Code does with the Dark+ and Light+ tokenColors.
// Only the rules are kept, so a fallback never sets a theme's background or foreground.
for (const kind of ["dark", "light"]) {
  const { default: theme } = await import(`@shikijs/themes/${kind}-plus`);

  writeFileSync(
    new URL(`../syntax-themes/fallback-${kind}.json`, import.meta.url),
    `${JSON.stringify({ name: `${kind} fallback`, tokenColors: theme.tokenColors })}\n`,
  );
}

console.log(`${entries.length} grammars written, ${failures.length} rules dropped`);

for (const failure of failures.slice(0, 40)) console.log(`  ${failure}`);
