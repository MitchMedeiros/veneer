// What a shell command's output is, when the command says so plainly: the text of a file or files in one language, a
// diff, or search matches. Anything that could change or mix the output, such as a redirect, a glob, an expansion or an
// option that adds to it, answers null, so the card stays plain rather than be coloured as the wrong language.

// A grep names `file` when it searches exactly one file, which grep and ripgrep then print without the file's name.
export type OutputSource =
  { kind: "file"; path: string; numbered: boolean } | { kind: "diff" } | { kind: "grep"; file?: string };

// What names a file's language: its extension, or for a file without one its name (`Dockerfile`).
export function hintOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = name.lastIndexOf(".");

  return dot > 0 ? name.slice(dot + 1) : name;
}

const UNQUOTED_REFUSED = new Set([
  "|",
  "&",
  ";",
  "<",
  ">",
  "(",
  ")",
  "$",
  "`",
  "*",
  "?",
  "[",
  "]",
  "{",
  "}",
  "!",
  "#",
  "\n",
]);
const DOUBLE_QUOTED_REFUSED = new Set(["$", "`", "\n"]);

// The words of a command as a shell reads them, or null when it holds anything that is not a plain word: an expansion,
// a glob, an operator, a comment or a line break.
export function shellWords(command: string): string[] | null {
  const words: string[] = [];
  let word = "";
  let started = false;
  let quote: "'" | '"' | null = null;

  for (let at = 0; at < command.length; at++) {
    const char = command[at]!;

    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
    } else if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (DOUBLE_QUOTED_REFUSED.has(char)) {
        return null;
      } else if (char === "\\" && '"\\'.includes(command[at + 1] ?? "")) {
        word += command[++at];
      } else {
        word += char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === "\\") {
      if (at + 1 >= command.length || command[at + 1] === "\n") return null;

      word += command[++at];
      started = true;
    } else if (char === " " || char === "\t") {
      if (started) words.push(word);

      word = "";
      started = false;
    } else if (UNQUOTED_REFUSED.has(char)) {
      return null;
    } else {
      word += char;
      started = true;
    }
  }

  if (quote !== null) return null;
  if (started) words.push(word);

  return words;
}

// The command as pipelines of stages, split at `;`, `&&` and line breaks, and then at `|`, wherever they sit outside
// quotes. Null for `||`, which runs a command only if another failed. Redirects and expansions are left in the stage
// text for `shellWords` to refuse.
function pipelines(command: string): string[][] | null {
  const result: string[][] = [];
  let stages: string[] = [];
  let stage = "";
  let quote: "'" | '"' | null = null;

  const endStage = () => {
    stages.push(stage);
    stage = "";
  };
  const endPipeline = () => {
    endStage();
    result.push(stages);
    stages = [];
  };

  for (let at = 0; at < command.length; at++) {
    const char = command[at]!;
    const next = command[at + 1];

    if (quote !== null) {
      stage += char;

      if (char === "\\" && quote === '"' && next !== undefined) stage += command[++at];
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
      stage += char;
    } else if (char === "\\" && next !== undefined) {
      stage += char + command[++at];
    } else if (char === ";" || char === "\n") {
      endPipeline();
    } else if (char === "&" && next === "&") {
      endPipeline();
      at++;
    } else if (char === "|") {
      if (next === "|") return null;

      endStage();
    } else {
      stage += char;
    }
  }

  endPipeline();

  return result;
}

const COUNT = /^\+?\d+$/;

// The file operands of `head` or `tail` with only a line count as options; any other option, such as `-c`, `-q` or `-f`,
// answers null. A count with a plus is `tail`'s, which counts from the start.
function lineWindow(words: string[], plus: boolean): string[] | null {
  const operands: string[] = [];

  for (let at = 1; at < words.length; at++) {
    const word = words[at]!;
    const attached = /^-n(.+)$/.exec(word)?.[1] ?? /^--lines=(.+)$/.exec(word)?.[1] ?? /^-(\d+)$/.exec(word)?.[1];

    if (word === "-n" || word === "--lines") {
      if (!COUNT.test(words[++at] ?? "") || (!plus && words[at]!.startsWith("+"))) return null;
    } else if (attached !== undefined) {
      if (!COUNT.test(attached) || (!plus && attached.startsWith("+"))) return null;
    } else if (word === "--") {
      operands.push(...words.slice(at + 1));
      break;
    } else if (word.startsWith("-") && word !== "-") {
      return null;
    } else {
      operands.push(word);
    }
  }

  return operands;
}

const SED_RANGE = /^(\$|\d+)(,(\$|\d+))?p$/;

// `sed -n 'A,Bp' file`, which prints lines A to B of one file. A script that does anything else answers null.
function sedRange(words: string[]): string | null {
  const [, flag, script, file, ...rest] = words;

  return flag === "-n" && SED_RANGE.test(script ?? "") && file !== undefined && rest.length === 0 ? file : null;
}

const GIT_FLAGS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
const GIT_PLAIN_FLAGS = new Set([
  "--no-pager",
  "-P",
  "--paginate",
  "-p",
  "--no-optional-locks",
  "--no-replace-objects",
]);
const PATCH_FLAGS = new Set(["-p", "--patch", "-u", "--cc"]);

// `git diff`, `git show` and `git log -p` print a diff; `git show rev:path` prints the file at that revision; `git grep`
// prints matches.
function gitSource(words: string[]): OutputSource | null {
  let at = 1;

  while (at < words.length && words[at]!.startsWith("-")) {
    const word = words[at]!;

    if (GIT_FLAGS_WITH_VALUE.has(word)) at += 2;
    else if (GIT_PLAIN_FLAGS.has(word) || /^--(git-dir|work-tree|namespace)=/.test(word)) at += 1;
    else return null;
  }

  const [subcommand, ...args] = words.slice(at);

  if (subcommand === "diff") return { kind: "diff" };

  if (subcommand === "grep") return { kind: "grep" };

  if (subcommand === "show") {
    const spec = args.filter((arg) => !arg.startsWith("-"));
    const revisionPath = spec.length === 1 && args.length === 1 ? /^[^:\s]+:(.+)$/.exec(spec[0]!)?.[1] : undefined;

    return revisionPath === undefined ? { kind: "diff" } : { kind: "file", path: revisionPath, numbered: false };
  }

  if (subcommand === "log" || (subcommand === "stash" && args[0] === "show")) {
    return args.some((arg) => PATCH_FLAGS.has(arg)) ? { kind: "diff" } : null;
  }

  return null;
}

const SEARCH_SHORT_VALUES = new Set(["A", "B", "C", "m", "e", "f", "g", "t", "T", "d", "D"]);
const SEARCH_LONG_VALUES = new Set([
  "--after-context",
  "--before-context",
  "--context",
  "--max-count",
  "--regexp",
  "--file",
  "--glob",
  "--type",
  "--type-not",
  "--include",
  "--exclude",
  "--exclude-dir",
  "--max-depth",
  "--directories",
  "--devices",
]);
const RECURSIVE_FLAGS = new Set(["-r", "-R", "--recursive", "--dereference-recursive"]);
const LONG_PATTERN_FLAGS = new Set(["--regexp", "--file"]);

// The one file a `grep` or `rg` searches, when it is plainly one: a single path operand that looks like a file and no
// recursive search. A directory with a dot in its name passes for a file here, so what a search prints is checked against
// this before it is used.
function searchedFile(words: string[]): string | undefined {
  const operands: string[] = [];
  let patternGiven = false;
  let recursive = false;

  for (let at = 1; at < words.length; at++) {
    const word = words[at]!;

    if (word === "--") {
      operands.push(...words.slice(at + 1));
      break;
    }

    if (word.startsWith("--")) {
      const name = word.split("=")[0]!;

      recursive ||= RECURSIVE_FLAGS.has(name);
      patternGiven ||= LONG_PATTERN_FLAGS.has(name);

      if (SEARCH_LONG_VALUES.has(name) && !word.includes("=")) at++;
    } else if (word.startsWith("-") && word.length > 1) {
      for (let i = 1; i < word.length; i++) {
        const flag = word[i]!;

        recursive ||= flag === "r" || flag === "R";
        patternGiven ||= flag === "e" || flag === "f";

        if (SEARCH_SHORT_VALUES.has(flag)) {
          if (i === word.length - 1) at++;

          break;
        }
      }
    } else {
      operands.push(word);
    }
  }

  const paths = patternGiven ? operands : operands.slice(1);
  const name = paths[0]?.slice(paths[0].lastIndexOf("/") + 1) ?? "";

  return !recursive && paths.length === 1 && /^[^.].*\.[A-Za-z0-9_+-]+$/.test(name) ? paths[0] : undefined;
}

// What one command, with no pipe after it, prints; null when that is not certain.
function sourceOfCommand(words: string[]): OutputSource | null {
  const name = words[0];

  if (name === "cat") {
    const numbered = words[1] === "-n";
    const operands = words.slice(numbered ? 2 : 1);
    const files = operands[0] === "--" ? operands.slice(1) : operands;

    return files.length === 1 && !files[0]!.startsWith("-") ? { kind: "file", path: files[0]!, numbered } : null;
  }

  if (name === "head" || name === "tail") {
    const files = lineWindow(words, name === "tail");

    return files?.length === 1 ? { kind: "file", path: files[0]!, numbered: false } : null;
  }

  if (name === "sed") {
    const file = sedRange(words);

    return file === null ? null : { kind: "file", path: file, numbered: false };
  }

  if (name === "git") return gitSource(words);

  if (name === "rg" || name === "grep" || name === "egrep" || name === "fgrep") {
    return { kind: "grep", file: searchedFile(words) };
  }

  if (name === "diff") {
    return words.some((word) => /^(-u|-U\d*|--unified(=\d+)?|-\w*u\w*)$/.test(word)) ? { kind: "diff" } : null;
  }

  return null;
}

// What a pipeline prints: its first command, kept whole by any `head` or `tail` after it that only takes a line count.
function sourceOfPipeline(stages: string[]): OutputSource | null {
  const [first, ...rest] = stages.map((stage) => shellWords(stage.trim().replace(/\s+2>\s*(&1|\/dev\/null)$/, "")));

  if (first === null || first === undefined || first.length === 0) return null;

  const filters = rest.every((words) => {
    const name = words?.[0];

    if (words === null || name === undefined) return false;

    return name === "sed"
      ? words.length === 3 && words[1] === "-n" && SED_RANGE.test(words[2]!)
      : (name === "head" || name === "tail") && lineWindow(words, name === "tail")?.length === 0;
  });

  return filters ? sourceOfCommand(first) : null;
}

const sameLanguage = (a: string | undefined, b: string | undefined): boolean =>
  a === undefined || b === undefined ? a === b : hintOf(a) === hintOf(b);

const sameSource = (a: OutputSource, b: OutputSource): boolean => {
  if (a.kind === "file") return b.kind === "file" && a.numbered === b.numbered && sameLanguage(a.path, b.path);

  return a.kind === "grep" ? b.kind === "grep" && sameLanguage(a.file, b.file) : b.kind === "diff";
};

// What a command's output is, or null when that is not certain. Several commands in a row, joined by `;` or `&&`, count
// when they all print the same kind of thing, and `cd` between them prints nothing.
export function outputSource(command: string): OutputSource | null {
  const parts = pipelines(command);

  if (parts === null) return null;

  const sources: OutputSource[] = [];

  for (const stages of parts) {
    const words = stages.length === 1 ? shellWords(stages[0]!) : undefined;

    if (stages.every((stage) => stage.trim() === "")) continue;

    if (words?.[0] === "cd" && words.length <= 2) continue;

    const source = sourceOfPipeline(stages);

    if (source === null) return null;

    sources.push(source);
  }

  const [first] = sources;

  return first !== undefined && sources.every((source) => sameSource(first, source)) ? first : null;
}

// Whether the text has the marks of a diff, so a command that was expected to print one but printed something else, such
// as `git diff --stat`, is not coloured as one.
export const looksLikeDiff = (lines: readonly string[]): boolean =>
  lines.some((line) => /^(diff --git |@@ .*@@|--- \S|\+\+\+ \S)/.test(line));
