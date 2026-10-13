// Dev only. Checks that every extension in the popular theme list still resolves on Open VSX: its package.json is served,
// it contributes color themes, and a theme file, with the files it includes, reads as a theme. It uses the network and
// takes a while, so it is not part of `npm test`. Run with `npm run check:themes`. By default it fetches the first theme
// of each extension; `--all` fetches every theme. Exits 1 on any failure.
import { POPULAR_THEMES } from "../hooks/syntax-popular.ts";
import { fileUrl, flattenTheme, needsStrings, parseExtensionId, themesOf } from "../hooks/syntax-remote.ts";
import { themeProblem } from "../hooks/syntax-themes.ts";

const all = process.argv.includes("--all");
const CONCURRENCY = 6;

async function text(extension, path) {
  const response = await fetch(fileUrl(extension, path));

  return response.ok ? response.text() : undefined;
}

async function check({ id }) {
  const extension = parseExtensionId(id);
  const manifest = extension === undefined ? undefined : await text(extension, "package.json");

  if (extension === undefined || manifest === undefined) {
    return [`${id}: package.json is not served`];
  }

  let themes = themesOf(manifest);

  if (needsStrings(themes)) {
    themes = themesOf(manifest, await text(extension, "package.nls.json"));
  }

  if (themes.length === 0) {
    return [`${id}: contributes no color themes`];
  }

  const problems = [];

  for (const theme of all ? themes : themes.slice(0, 1)) {
    const file = await text(extension, theme.path);
    const content =
      file === undefined ? undefined : await flattenTheme(file, theme.path, (path) => text(extension, path.slice(1)));
    const problem =
      file === undefined ? "file is not served" : content === undefined ? "not valid JSON" : themeProblem(content);

    if (problem !== undefined) {
      problems.push(`${id}: ${theme.label}: ${problem}`);
    }
  }

  return problems;
}

const failures = [];
const queue = [...POPULAR_THEMES];

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let entry = queue.shift(); entry !== undefined; entry = queue.shift()) {
      failures.push(...(await check(entry).catch((error) => [`${entry.id}: ${error.message}`])));
    }
  }),
);

for (const failure of failures) {
  console.error(failure);
}

console.log(
  `${POPULAR_THEMES.length - new Set(failures.map((line) => line.split(":")[0])).size} of ${POPULAR_THEMES.length} extensions resolve.`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
