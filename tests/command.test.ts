import { expect, test } from "claude-code/testing";

import { looksLikeDiff, outputSource, shellWords } from "../hooks/command";

const file = (path: string, numbered = false) => ({ kind: "file", path, numbered });
const diff = { kind: "diff" };
const grep = { kind: "grep" };

test("cat of one file prints that file", () => {
  expect(outputSource("cat src/a.ts")).toEqual(file("src/a.ts"));
  expect(outputSource("cat -- src/a.ts")).toEqual(file("src/a.ts"));
  expect(outputSource('cat "my docs/a b.py"')).toEqual(file("my docs/a b.py"));
  expect(outputSource("cat 'a b.py'")).toEqual(file("a b.py"));
  expect(outputSource("cat my\\ file.rs")).toEqual(file("my file.rs"));
  expect(outputSource("cat ~/notes/todo.md")).toEqual(file("~/notes/todo.md"));
});

test("cat that adds to or mixes the output answers null", () => {
  for (const command of [
    "cat -A a.ts",
    "cat -n -b a.ts",
    "cat a.ts b.ts",
    "cat",
    "cat -",
    "cat a.ts | grep x",
    "cat a.ts | sort",
    "cat a.ts > b.ts",
    "cat a.ts 2> err.log",
    "cat a.ts || echo none",
    "cat a.ts && ls",
    "cat a.ts; ls",
    "cat a.ts; cat b.py",
    "cat a.ts | head -n 5 a.ts",
    "cat a.ts | head -c 5",
    "cat *.ts",
    "cat $FILE",
    "cat $(echo a.ts)",
    "cat `echo a.ts`",
    'cat "$HOME/a.ts"',
    "cat a.ts # note",
    "cat a.ts\nls",
    "cat 'a.ts",
    "cat a.ts &",
    "FOO=1 cat a.ts",
  ]) {
    expect(outputSource(command)).toBeNull();
  }
});

test("cat -n prints the file with a number column", () => {
  expect(outputSource("cat -n a.ts")).toEqual(file("a.ts", true));
  expect(outputSource("cat -n a.ts b.ts")).toBeNull();
  expect(outputSource("cat a.ts; cat -n b.ts")).toBeNull();
});

test("a cd, 2>/dev/null and 2>&1 change nothing about what is printed", () => {
  expect(outputSource("cd /repo && cat a.ts")).toEqual(file("a.ts"));
  expect(outputSource('cd "/my repo" && cat a.ts')).toEqual(file("a.ts"));
  expect(outputSource("cd /repo; cat a.ts")).toEqual(file("a.ts"));
  expect(outputSource("cd /repo && cd src && cat a.ts")).toEqual(file("a.ts"));
  expect(outputSource("cat a.ts 2>/dev/null")).toEqual(file("a.ts"));
  expect(outputSource("cd /repo && cat a.ts 2> /dev/null")).toEqual(file("a.ts"));
  expect(outputSource("cat a.ts 2>&1")).toEqual(file("a.ts"));
  expect(outputSource("cd /repo && cd")).toBeNull();
});

test("commands in a row count when they print the same language", () => {
  expect(outputSource("tail -12 hooks/paint.ts; sed -n 1,10p hooks/paint.ts")).toEqual(file("hooks/paint.ts"));
  expect(outputSource("head -5 a.ts && tail -5 b.ts")).toEqual(file("a.ts"));
  expect(outputSource("cat a.ts\ncat b.ts")).toEqual(file("a.ts"));
  expect(outputSource("cat a.ts; cat b.tsx")).toBeNull();
  expect(outputSource("cat a.ts; cat -n b.ts")).toBeNull();
  expect(outputSource("cat a.ts; git diff")).toBeNull();
  expect(outputSource("git diff a; git diff b")).toEqual(diff);
  expect(outputSource("cat a.ts;")).toEqual(file("a.ts"));
  expect(outputSource("cat a.ts; echo done")).toBeNull();
});

test("head or tail after a pipe keeps the output whole", () => {
  expect(outputSource("cat a.ts | head -50")).toEqual(file("a.ts"));
  expect(outputSource("git diff | head -n 100")).toEqual(diff);
  expect(outputSource("cat a.ts | head -50 | tail -n 5")).toEqual(file("a.ts"));
  expect(outputSource("git diff | head -n 100 a")).toBeNull();
  expect(outputSource("cat a.ts |")).toBeNull();
});

test("a search of one file is told so, since it prints no file name", () => {
  const one = (file: string) => ({ kind: "grep", file });

  expect(outputSource("grep -n foo a.ts")).toEqual(one("a.ts"));
  expect(outputSource('grep -n "export async function paintLines" -B2 -A6 hooks/paint.ts')).toEqual(
    one("hooks/paint.ts"),
  );
  expect(outputSource("grep -nA3 foo a.ts")).toEqual(one("a.ts"));
  expect(outputSource("grep -n -A 3 foo a.ts")).toEqual(one("a.ts"));
  expect(outputSource("grep -n --max-count 2 foo a.ts")).toEqual(one("a.ts"));
  expect(outputSource("grep -n --after-context=2 foo a.ts")).toEqual(one("a.ts"));
  expect(outputSource("rg -n -e foo a.ts")).toEqual(one("a.ts"));
  expect(outputSource("rg -n -g '*.ts' foo a.ts")).toEqual(one("a.ts"));
  expect(outputSource("grep -n foo -- a.ts")).toEqual(one("a.ts"));
  expect(outputSource("grep -rn foo a.ts")).toEqual(grep);
  expect(outputSource("grep -n foo a.ts b.ts")).toEqual(grep);
  expect(outputSource("rg -n foo src")).toEqual(grep);
  expect(outputSource("rg -n foo .github")).toEqual(grep);
  expect(outputSource("rg -n foo")).toEqual(grep);
  expect(outputSource("grep -n foo")).toEqual(grep);
});

test("searches of the same file in a row, with sed after a pipe, are one kind of output", () => {
  expect(outputSource('grep -n "hintOf" -B3 -A8 a.ts | sed -n 1,30p; grep -n "paint" a.ts')).toEqual({
    kind: "grep",
    file: "a.ts",
  });
  expect(outputSource("grep -n foo a.ts; grep -n foo b.ts")).toEqual({ kind: "grep", file: "a.ts" });
  expect(outputSource("grep -n foo a.ts; grep -n foo b.py")).toBeNull();
  expect(outputSource("grep -n foo a.ts; grep -rn foo src")).toBeNull();
  expect(outputSource("grep -n TAB fold.tsx | head -3; sed -n 100,125p paint.ts")).toBeNull();
  expect(outputSource("grep -n foo a.ts | sed -n 1,30p")).toEqual({ kind: "grep", file: "a.ts" });
  expect(outputSource("grep -n foo a.ts | sed -n '/x/p'")).toBeNull();
  expect(outputSource("grep -n foo a.ts | sed -n 1,30p a.ts")).toBeNull();
});

test("rg, grep and git grep may print matches", () => {
  expect(outputSource('rg -n "let x" src')).toEqual(grep);
  expect(outputSource("grep -rn foo .")).toEqual(grep);
  expect(outputSource("git grep -n foo")).toEqual(grep);
  expect(outputSource("rg -n foo | head -20")).toEqual(grep);
  expect(outputSource("rg -n foo; cat a.ts")).toBeNull();
  expect(outputSource("rg -n foo | sort")).toBeNull();
});

test("head and tail with a line count and one file print part of that file", () => {
  expect(outputSource("head a.ts")).toEqual(file("a.ts"));
  expect(outputSource("head -n 20 a.ts")).toEqual(file("a.ts"));
  expect(outputSource("head -n20 a.ts")).toEqual(file("a.ts"));
  expect(outputSource("head -20 a.ts")).toEqual(file("a.ts"));
  expect(outputSource("head --lines=5 a.ts")).toEqual(file("a.ts"));
  expect(outputSource("tail -n 5 a.ts")).toEqual(file("a.ts"));
  expect(outputSource("tail -n +5 a.ts")).toEqual(file("a.ts"));
  expect(outputSource("tail -n +5 -- a.ts")).toEqual(file("a.ts"));
});

test("head and tail with other options or several files answer null", () => {
  for (const command of [
    "head -c 100 a.ts",
    "head -q a.ts b.ts",
    "head a.ts b.ts",
    "head -n x a.ts",
    "head -n +5 a.ts",
    "tail -f a.log",
    "tail -F a.log",
    "tail -n a.ts",
    "head",
  ]) {
    expect(outputSource(command)).toBeNull();
  }
});

test("sed -n with a line range prints part of one file", () => {
  expect(outputSource("sed -n '5,20p' a.ts")).toEqual(file("a.ts"));
  expect(outputSource("sed -n 5p a.ts")).toEqual(file("a.ts"));
  expect(outputSource("sed -n '10,$p' a.ts")).toEqual(file("a.ts"));
  expect(outputSource("sed -n '5,20p' a.ts b.ts")).toBeNull();
  expect(outputSource("sed -n '/foo/p' a.ts")).toBeNull();
  expect(outputSource("sed -i 's/a/b/' a.ts")).toBeNull();
  expect(outputSource("sed 's/a/b/' a.ts")).toBeNull();
  expect(outputSource("sed -n -e '5p' a.ts")).toBeNull();
});

test("git diff, show and log -p print a diff", () => {
  expect(outputSource("git diff")).toEqual(diff);
  expect(outputSource("git diff --staged src/a.ts")).toEqual(diff);
  expect(outputSource("git --no-pager diff HEAD~1")).toEqual(diff);
  expect(outputSource("git -C /repo diff")).toEqual(diff);
  expect(outputSource("git -c core.pager=cat diff")).toEqual(diff);
  expect(outputSource("git show HEAD")).toEqual(diff);
  expect(outputSource("git show --stat HEAD")).toEqual(diff);
  expect(outputSource("git log -p -1")).toEqual(diff);
  expect(outputSource("git log --patch")).toEqual(diff);
  expect(outputSource("git stash show -p")).toEqual(diff);
  expect(outputSource("cd /repo && git diff")).toEqual(diff);
});

test("git show of a path at a revision prints that file", () => {
  expect(outputSource("git show HEAD:src/a.ts")).toEqual(file("src/a.ts"));
  expect(outputSource("git show main:docs/x.md")).toEqual(file("docs/x.md"));
  expect(outputSource("git show --stat HEAD:src/a.ts")).toEqual(diff);
});

test("git commands that print no diff, and unknown git options, answer null", () => {
  for (const command of [
    "git log",
    "git log --oneline",
    "git status",
    "git stash show",
    "git branch",
    "git --unknown diff",
    "git",
    "git diff | sort",
    "git diff > out.patch",
  ]) {
    expect(outputSource(command)).toBeNull();
  }
});

test("diff prints a diff only when it is a unified one", () => {
  expect(outputSource("diff -u a.ts b.ts")).toEqual(diff);
  expect(outputSource("diff -ru a b")).toEqual(diff);
  expect(outputSource("diff -U5 a.ts b.ts")).toEqual(diff);
  expect(outputSource("diff --unified=3 a b")).toEqual(diff);
  expect(outputSource("diff a.ts b.ts")).toBeNull();
});

test("other commands answer null", () => {
  for (const command of ["", "   ", "ls -la", "bat a.ts", "jq . a.json", "npm test", "echo hi", "less a.ts"]) {
    expect(outputSource(command)).toBeNull();
  }
});

test("shellWords reads quotes and escapes, and refuses expansions", () => {
  expect(shellWords("a 'b c' \"d e\" f\\ g")).toEqual(["a", "b c", "d e", "f g"]);
  expect(shellWords('a "b\\"c"')).toEqual(["a", 'b"c']);
  expect(shellWords("a ''")).toEqual(["a", ""]);
  expect(shellWords("a '$HOME *'")).toEqual(["a", "$HOME *"]);
  expect(shellWords("a $HOME")).toBeNull();
  expect(shellWords('a "$HOME"')).toBeNull();
  expect(shellWords("a | b")).toBeNull();
  expect(shellWords("a\\")).toBeNull();
});

test("only output with the marks of a diff is taken for one", () => {
  expect(looksLikeDiff(["diff --git a/x b/x", "index 1..2"])).toBe(true);
  expect(looksLikeDiff(["--- a/x", "+++ b/x", "@@ -1 +1 @@", "-a", "+b"])).toBe(true);
  expect(looksLikeDiff([" a.ts | 2 +-", " 1 file changed, 1 insertion(+)"])).toBe(false);
  expect(looksLikeDiff(["commit abc", "", "    fix the thing"])).toBe(false);
});
