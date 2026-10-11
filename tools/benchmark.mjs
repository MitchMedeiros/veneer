// Dev only. Times the tokenizer on the shipped samples, one fresh Node process per language so every number is a first
// call with a cold engine. Node is not the plugin host, so read the numbers against each other and against the targets in
// `docs/work/syntax-highlighting.md`, not as absolute times. Run with `npm run benchmark`, optionally followed by
// language names.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
const WARM_RUNS = 20;
const BLOCK_LINES = 1500;

const sampleFor = (name) => {
  const file = readdirSync(new URL("tools/samples/", ROOT)).find((entry) => entry.startsWith(`${name}.`));

  if (file === undefined) throw new Error(`no sample for ${name}`);

  return read(`tools/samples/${file}`).replace(/\n$/, "");
};

async function measure(name) {
  const clock = () => performance.now();
  const index = JSON.parse(read("grammars/index.json"));
  const scopeName = index.languages[name].scopeName;

  let start = clock();
  const { Registry, tokenizeLine } = await import("../hooks/syntax/engine.ts");
  const engineLoad = clock() - start;

  start = clock();
  const own = JSON.parse(read(`grammars/${index.scopes[scopeName]}`));
  const parse = clock() - start;

  const others = Object.entries(index.scopes)
    .filter(([scope]) => scope !== scopeName)
    .map(([, file]) => JSON.parse(read(`grammars/${file}`)));
  const grammars = [own, ...others];
  const registryOf = () => {
    const created = new Registry();

    grammars.forEach((grammar) => created.add(grammar));

    return created;
  };

  const lines = sampleFor(name).split("\n");
  const pass = (registry, count) => {
    for (let copy = 0; copy < count; copy++) {
      let state = registry.initialState(scopeName);

      lines.forEach((line, row) => {
        state = tokenizeLine(line, state, row === 0).state;
      });
    }
  };

  const registry = registryOf();

  start = clock();
  pass(registry, 1);
  const first = clock() - start;

  start = clock();
  pass(registry, WARM_RUNS);
  const warm = (clock() - start) / WARM_RUNS;

  const copies = Math.ceil(BLOCK_LINES / lines.length);
  const cold = registryOf();

  start = clock();
  pass(cold, copies);
  const block = clock() - start;

  return {
    name,
    lines: lines.length,
    engineLoad,
    parse,
    first,
    warm,
    perLine: warm / lines.length,
    block,
    blockLines: copies * lines.length,
  };
}

const format = (value) => value.toFixed(1).padStart(7);

if (process.argv[2] === "--child") {
  console.log(JSON.stringify(await measure(process.argv[3])));
} else {
  const index = JSON.parse(read("grammars/index.json"));
  const only = process.argv.slice(2);
  const names = Object.keys(index.languages).filter((name) => only.length === 0 || only.includes(name));
  const rows = [];

  for (const name of names) {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--child", name], { encoding: "utf8" });

    if (run.status !== 0) {
      console.error(`${name}: ${run.stderr.trim().split("\n").at(-1)}`);
      process.exit(1);
    }

    rows.push(JSON.parse(run.stdout));
  }

  console.log("ms        engine   parse   first    warm  ms/line   block   (block lines)");

  for (const row of rows) {
    console.log(
      `${row.name.padEnd(12)}${format(row.engineLoad)}${format(row.parse)}${format(row.first)}${format(row.warm)}` +
        `${row.perLine.toFixed(3).padStart(9)}${format(row.block)}   ${row.blockLines}`,
    );
  }

  const worst = (key) => rows.reduce((a, b) => (b[key] > a[key] ? b : a));

  console.log(
    `\nslowest first call: ${worst("first").name} ${worst("first").first.toFixed(1)} ms; ` +
      `slowest per line: ${worst("perLine").name} ${worst("perLine").perLine.toFixed(3)} ms; ` +
      `slowest ${BLOCK_LINES}-line block: ${worst("block").name} ${worst("block").block.toFixed(1)} ms`,
  );
}
