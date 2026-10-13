// Dev only. Checks the shipped grammars and the tokenizer against Shiki, which runs the same TextMate grammars on the
// Oniguruma engine. For every language in `languages.json` it tokenizes `tools/samples/<language>.*` both ways and
// compares the scope stack of every character. It also compiles every regex of every shipped grammar. Exits 1 on any
// difference. Run with `npm run conformance`, optionally followed by language names.
import { readdirSync, readFileSync } from "node:fs";
import { createHighlighter } from "shiki";

import { Registry, tokenizeLine } from "../hooks/syntax/engine.ts";
import { withoutMarks } from "../hooks/syntax/mark.ts";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
const languages = JSON.parse(read("tools/languages.json"));
const index = JSON.parse(read("grammars/index.json"));
const only = process.argv.slice(2);
const shown = 3;

// Every regex of a grammar must compile. A rule is only compiled when a sample first reaches it, so this finds a bad
// translation that no sample exercises.
function badRegexes(grammar) {
  const bad = [];

  (function walk(value) {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value !== null && typeof value === "object") {
      for (const key of ["match", "begin", "end", "while"]) {
        const written = value[key];

        if (typeof written !== "string") continue;

        const slash = written.lastIndexOf("/");

        try {
          new RegExp(withoutMarks(written.slice(1, slash)), written.slice(slash + 1));
        } catch (error) {
          bad.push(`${written.slice(0, 60)}: ${error.message}`);
        }
      }

      Object.values(value).forEach(walk);
    }
  })(grammar);

  return bad;
}

const registry = new Registry();
const grammars = Object.fromEntries(
  Object.entries(index.scopes).map(([scope, file]) => [scope, JSON.parse(read(`grammars/${file}`))]),
);

Object.values(grammars).forEach((grammar) => registry.add(grammar));

const oracle = await createHighlighter({
  themes: [{ name: "conformance", type: "dark", colors: {}, tokenColors: [] }],
  langs: Object.entries(index.languages).map(([name, language]) => ({
    ...JSON.parse(read(`node_modules/tm-grammars/grammars/${name}.json`)),
    name,
    aliases: language.aliases,
  })),
});

const sampleFor = (name) => {
  const file = readdirSync(new URL("tools/samples/", ROOT)).find((entry) => entry.startsWith(`${name}.`));

  if (file === undefined) throw new Error(`no sample for ${name}: add tools/samples/${name}.<extension>`);

  return read(`tools/samples/${file}`).replace(/\n$/, "");
};

// The scope stack of each character of each line, as the tokenizer here produces it. Shiki never gives an empty line to
// the grammar, while vscode-textmate does, so an empty line is skipped here too: a rule that ends on a blank line would
// differ from Shiki and the comparison would say nothing else.
function ours(scopeName, code) {
  let state = registry.initialState(scopeName);

  return code.split("\n").map((line, row) => {
    if (line === "") return [];

    const result = tokenizeLine(line, state, row === 0);
    const scopes = [];

    state = result.state;

    for (const token of result.tokens) {
      scopes.push(...Array.from({ length: token.end - token.start }, () => token.scope.path.join(" ")));
    }

    return scopes;
  });
}

// The same from Shiki.
function reference(name, code) {
  const lines = oracle.codeToTokensBase(code, { lang: name, theme: "conformance", includeExplanation: true });

  return lines.map((line) =>
    line.flatMap((token) =>
      (token.explanation ?? []).flatMap((part) =>
        Array.from({ length: part.content.length }, () => part.scopes.map((scope) => scope.scopeName).join(" ")),
      ),
    ),
  );
}

let failed = 0;

for (const [name, language] of Object.entries(index.languages)) {
  if ((only.length > 0 && !only.includes(name)) || languages[name] === undefined) continue;

  const code = sampleFor(name);
  const mine = ours(language.scopeName, code);
  const theirs = reference(name, code);
  const lines = code.split("\n");
  const differences = [];
  let characters = 0;

  theirs.forEach((expected, row) => {
    for (let column = 0; column < Math.max(expected.length, mine[row]?.length ?? 0); column++) {
      characters++;

      if (expected[column] !== mine[row]?.[column]) {
        differences.push(
          `${row + 1}:${column + 1} «${lines[row]?.slice(Math.max(0, column - 12), column + 12)}»\n` +
            `      expected ${expected[column]}\n      got      ${mine[row]?.[column]}`,
        );
      }
    }
  });

  const regexes = badRegexes(grammars[language.scopeName]);
  const status = differences.length === 0 && regexes.length === 0 ? "ok  " : "FAIL";

  console.log(`${status} ${name.padEnd(12)} ${characters} characters, ${differences.length} differ`);

  if (status === "FAIL") {
    failed++;
    differences.slice(0, shown).forEach((difference) => console.log(`    ${difference}`));
    regexes.slice(0, shown).forEach((regex) => console.log(`    bad regex ${regex}`));
  }
}

console.log(failed === 0 ? "all languages match Shiki" : `${failed} language(s) differ from Shiki`);
process.exit(failed === 0 ? 0 : 1);
