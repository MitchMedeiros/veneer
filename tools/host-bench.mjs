// Dev only. Times the highlighter inside the plugin test host, which is the environment the mod runs in. A test there
// cannot read the disk, so for each language this builds a scratch copy of the mod with the real grammar files and a
// sample written into a `fixture.ts`, and runs `claude plugin test` on it, one process per language so every cold
// number is a first call. Nothing is written to the repo. Run with `npm run benchmark:host`, optionally followed by
// language names.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
const DEFAULT_LANGUAGES = ["typescript", "python", "cpp"];
const COPIED = [".claude", ".claude-plugin", "hooks", "themes", "types"];

const index = JSON.parse(read("grammars/index.json"));
const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : DEFAULT_LANGUAGES;

// The scope names a grammar includes from other grammars, as `source.x` or `source.x#rule`.
function includedScopes(grammarText) {
  return [...grammarText.matchAll(/"include":"([^"#$]+)/g)].map((found) => found[1]);
}

// The grammar of a language and every grammar it reaches, by path under the plugin folder.
function grammarFiles(scopeName) {
  const files = {};
  const pending = [scopeName];

  while (pending.length > 0) {
    const scope = pending.pop();
    const file = index.scopes[scope];

    if (file === undefined || files[`/grammars/${file}`] !== undefined) continue;

    files[`/grammars/${file}`] = read(`grammars/${file}`);
    pending.push(...includedScopes(files[`/grammars/${file}`]));
  }

  return files;
}

const sampleFor = (name) => {
  const file = readdirSync(new URL("tools/samples/", ROOT)).find((entry) => entry.startsWith(`${name}.`));

  if (file === undefined) throw new Error(`no sample for ${name}`);

  return read(`tools/samples/${file}`).replace(/\n$/, "");
};

function run(name) {
  const language = index.languages[name];

  if (language === undefined) throw new Error(`unknown language ${name}`);

  const scratch = mkdtempSync(`${tmpdir()}/veneer-host-bench-`);

  try {
    for (const entry of COPIED) cpSync(new URL(entry, ROOT), `${scratch}/${entry}`, { recursive: true });

    const files = {
      ...grammarFiles(language.scopeName),
      "/grammars/index.json": read("grammars/index.json"),
      "/themes/default.json": read("themes/default.json"),
    };

    mkdirSync(`${scratch}/tests`);
    writeFileSync(
      `${scratch}/tests/fixture.ts`,
      `export const LANGUAGE = ${JSON.stringify(name)};\n` +
        `export const SAMPLE = ${JSON.stringify(sampleFor(name))};\n` +
        `export const FILES: Record<string, string> = ${JSON.stringify(files)};\n`,
    );
    writeFileSync(`${scratch}/tests/host-bench.test.tsx`, read("tools/host-bench.template.tsx"));

    const result = spawnSync("claude", ["plugin", "test", scratch], { cwd: tmpdir(), encoding: "utf8" });
    const output = `${result.stdout}${result.stderr}`;
    const line = output.split("\n").find((entry) => entry.includes("BENCH "));

    if (line === undefined) {
      console.error(`${name}: no timing in the output of claude plugin test\n${output.slice(-1500)}`);
      process.exitCode = 1;
    } else {
      console.log(line.trim());
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

names.forEach(run);
