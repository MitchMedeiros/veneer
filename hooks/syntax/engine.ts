import { ANCHOR_MARK, BACK_REFERENCE_MARK, FIRST_LINE_MARK } from "./mark.ts";
import type { Captures, Grammar, GrammarRule } from "./types";

const BACK_REFERENCE = new RegExp(`${BACK_REFERENCE_MARK}(\\d+)${BACK_REFERENCE_MARK}`, "g");

const escapeRegex = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");

const CASES: Record<string, (text: string) => string> = {
  upcase: (text) => text.toUpperCase(),
  downcase: (text) => text.toLowerCase(),
  capitalize: (text) => text.charAt(0).toUpperCase() + text.slice(1),
};

// A scope name with its `$N` and `${N:/case}` parts replaced by the groups of a match.
const fillGroups = (name: string, match: RegExpExecArray): string =>
  name.replace(/\$(\d+)|\$\{(\d+):\/(\w+)\}/g, (_, plain: string | undefined, braced: string | undefined, how = "") => {
    // Leading dots would make an invalid scope, so vscode-textmate drops them.
    const text = (match[Number(plain ?? braced)] ?? "").replace(/^\.+/, "");

    return CASES[how]?.(text) ?? text;
  });

// A scope name and the scopes around it. Nodes are shared, so one scope path is one object and a theme can cache by it.
export class ScopeNode {
  private readonly children = new Map<string, ScopeNode>();
  readonly name: string;
  readonly parent: ScopeNode | null;

  constructor(name: string, parent: ScopeNode | null) {
    this.name = name;
    this.parent = parent;
  }

  // The node under this one for a rule's `name`, which may hold several scopes separated by spaces. A `$1` or
  // `${1:/downcase}` in the name is replaced by that group of `match`.
  push(names: string | undefined, match?: RegExpExecArray): ScopeNode {
    if (names === undefined) {
      return this;
    }

    return (match === undefined || !names.includes("$") ? names : fillGroups(names, match))
      .split(/\s+/)
      .filter((name) => name !== "")
      .reduce<ScopeNode>((node, name) => node.child(name), this);
  }

  // The scope names from the outermost to this one.
  get path(): string[] {
    return this.parent === null ? [] : [...this.parent.path, this.name];
  }

  private child(name: string): ScopeNode {
    let node = this.children.get(name);

    if (node === undefined) {
      node = new ScopeNode(name, this);
      this.children.set(name, node);
    }

    return node;
  }
}

export const ROOT_SCOPE = new ScopeNode("", null);

export type Token = { start: number; end: number; scope: ScopeNode };

type Found = { index: number; match: RegExpExecArray };

type Hit = Found & { rule: Rule | null };

// A translated regex, compiled on first use. Where it holds `\G` or `\A`, the build tool left a mark, and the regex is
// compiled once for each position the anchor has been at and for the first line of a file.
class Re {
  private readonly source: string;
  private readonly flags: string;
  private readonly compiled = new Map<string, RegExp>();
  // Whether the regex holds `\G`, so a match depends on where the anchor is.
  readonly anchored: boolean;
  private readonly usesFirstLine: boolean;

  constructor(written: string) {
    const slash = written.lastIndexOf("/");

    this.source = written.slice(1, slash);
    this.flags = `${written.slice(slash + 1)}g`;
    this.anchored = this.source.includes(ANCHOR_MARK);
    this.usesFirstLine = this.source.includes(FIRST_LINE_MARK);
  }

  find(line: { text: string; first: boolean }, from: number, anchor: number): Found | null {
    const regex = this.regexFor(anchor, line.first);

    regex.lastIndex = from;

    const match = regex.exec(line.text);

    return match === null ? null : { index: match.index, match };
  }

  // `\G` holds at the anchor and nowhere else: a look behind for exactly that many characters, or no match when the
  // anchor is unset. `\A` holds at the start of the first line.
  private regexFor(anchor: number, first: boolean): RegExp {
    const key = `${this.anchored ? anchor : 0}${this.usesFirstLine && first ? "f" : ""}`;
    let regex = this.compiled.get(key);

    if (regex === undefined) {
      const at = anchor < 0 ? "(?!)" : `(?<=^[^]{${anchor}})`;
      const source = this.source.replaceAll(ANCHOR_MARK, at).replaceAll(FIRST_LINE_MARK, first ? "(?<![^])" : "(?!)");

      regex = new RegExp(source, this.flags);
      this.compiled.set(key, regex);
    }

    return regex;
  }
}

// What a rule scans for: its own regex, or the end of the rule on top of the stack (rule null).
type Candidate = { re: Re; rule: Rule | null };

const fixed = (written: string | undefined): Re | undefined =>
  written === undefined || written.includes(BACK_REFERENCE_MARK) ? undefined : new Re(written);

class Rule {
  readonly match: Re | undefined;
  readonly begin: Re | undefined;
  private readonly fixedEnd: Re | undefined;
  private readonly fixedWhile: Re | undefined;
  private flat: Rule[] | undefined;
  readonly json: GrammarRule;
  readonly grammar: GrammarRuntime;

  constructor(json: GrammarRule, grammar: GrammarRuntime) {
    this.json = json;
    this.grammar = grammar;
    this.match = json.match === undefined ? undefined : new Re(json.match);
    this.begin = json.begin === undefined ? undefined : new Re(json.begin);
    this.fixedEnd = fixed(json.end);
    this.fixedWhile = fixed(json.while);
  }

  get isPush(): boolean {
    return this.begin !== undefined;
  }

  // The rules a position can start inside this one, with includes followed.
  get patterns(): Rule[] {
    this.flat ??= this.grammar.flatten(this.json.patterns ?? [], new Set());

    return this.flat;
  }

  endFor(begin: RegExpExecArray): Re | null {
    return this.resolved(this.json.end, this.fixedEnd, begin);
  }

  whileFor(begin: RegExpExecArray): Re | null {
    return this.resolved(this.json.while, this.fixedWhile, begin);
  }

  private resolved(written: string | undefined, fixedRe: Re | undefined, begin: RegExpExecArray): Re | null {
    if (written === undefined) {
      return null;
    }

    return fixedRe ?? new Re(written.replace(BACK_REFERENCE, (_, n: string) => escapeRegex(begin[Number(n)] ?? "")));
  }
}

// A grammar being used: its rules compiled on demand, and includes resolved through the registry.
class GrammarRuntime {
  private readonly rules = new WeakMap<GrammarRule, Rule>();
  private readonly groups = new WeakMap<GrammarRule[], Rule>();
  private readonly registry: Registry;
  readonly json: Grammar;

  constructor(json: Grammar, registry: Registry) {
    this.json = json;
    this.registry = registry;
  }

  get root(): Rule {
    return this.groupOf(this.json.patterns);
  }

  ruleOf(json: GrammarRule): Rule {
    let rule = this.rules.get(json);

    if (rule === undefined) {
      rule = new Rule(json, this);
      this.rules.set(json, rule);
    }

    return rule;
  }

  // A rule that holds only these patterns, as a capture with patterns of its own needs.
  groupOf(patterns: GrammarRule[]): Rule {
    let rule = this.groups.get(patterns);

    if (rule === undefined) {
      rule = new Rule({ patterns }, this);
      this.groups.set(patterns, rule);
    }

    return rule;
  }

  // The matchable rules among these patterns, with every include replaced by what it names. `seen` stops a rule that
  // includes itself.
  flatten(patterns: GrammarRule[], seen: Set<GrammarRule>): Rule[] {
    return patterns.flatMap((pattern) => this.flattenOne(pattern, seen));
  }

  flattenOne(pattern: GrammarRule, seen: Set<GrammarRule>): Rule[] {
    if (seen.has(pattern)) {
      return [];
    }

    seen.add(pattern);

    if (pattern.include !== undefined) {
      const target = this.resolve(pattern.include);

      if (target === undefined) {
        return [];
      }

      return target.rule === undefined
        ? target.runtime.flatten(target.runtime.json.patterns, seen)
        : target.runtime.flattenOne(target.rule, seen);
    }

    if (this.isSkipped(pattern)) {
      return [];
    }

    if (pattern.match !== undefined || pattern.begin !== undefined) {
      return [this.ruleOf(pattern)];
    }

    return this.flatten(pattern.patterns ?? [], seen);
  }

  // What an include names: a rule of a grammar, or a whole grammar when no rule is named. Undefined when the grammar or
  // the rule is not there.
  private resolve(target: string): { runtime: GrammarRuntime; rule: GrammarRule | undefined } | undefined {
    if (target === "$self" || target === "$base") {
      return { runtime: this, rule: undefined };
    }

    const [scope = "", name] = target.startsWith("#") ? ["", target.slice(1)] : target.split("#");
    const runtime = scope === "" ? this : this.registry.runtime(scope);
    const rule = name === undefined ? undefined : runtime?.json.repository?.[name];

    if (runtime === undefined || (name !== undefined && rule === undefined)) {
      return undefined;
    }

    return { runtime, rule };
  }

  // A rule whose patterns all name something that is not there is left out of the rules around it, as vscode-textmate
  // does. A rule with no patterns at all is kept.
  private isSkipped(rule: GrammarRule, visiting = new Set<GrammarRule>()): boolean {
    const declared = rule.patterns ?? [];

    if (declared.length === 0 || visiting.has(rule)) {
      return false;
    }

    visiting.add(rule);

    const kept = declared.some((pattern) => {
      if (pattern.include === undefined) {
        return !this.isSkipped(pattern, visiting);
      }

      const target = this.resolve(pattern.include);

      return target !== undefined && (target.rule === undefined || !target.runtime.isSkipped(target.rule, visiting));
    });

    visiting.delete(rule);

    return !kept;
  }
}

// The grammars loaded so far, by scope name.
export class Registry {
  private readonly grammars = new Map<string, GrammarRuntime>();

  has(scopeName: string): boolean {
    return this.grammars.has(scopeName);
  }

  add(grammar: Grammar): void {
    this.grammars.set(grammar.scopeName, new GrammarRuntime(grammar, this));
  }

  runtime(scopeName: string): GrammarRuntime | undefined {
    return this.grammars.get(scopeName);
  }

  // The state before the first line of a file in this grammar.
  initialState(scopeName: string): StateStack | undefined {
    const grammar = this.grammars.get(scopeName);

    if (grammar === undefined) {
      return undefined;
    }

    const scope = ROOT_SCOPE.push(scopeName);

    return new StateStack({
      parent: null,
      rule: grammar.root,
      enterPos: 0,
      anchorPos: -1,
      name: scope,
      content: scope,
      end: null,
      whileRe: null,
      endsLine: false,
    });
  }
}

type Frame = {
  parent: StateStack | null;
  rule: Rule;
  // Where the rule began on the line being tokenized, or -1 when it began on an earlier line.
  enterPos: number;
  // Where `\G` matched when the rule began; it matches there again once the rule ends.
  anchorPos: number;
  // Scopes of the rule's own text (its begin and end) and of the text between them.
  name: ScopeNode;
  content: ScopeNode;
  end: Re | null;
  whileRe: Re | null;
  // A begin that took the line break leaves `\G` at the start of the next line.
  endsLine: boolean;
};

// The rules a line is inside, innermost last. Each line takes the state the one before it left.
export class StateStack implements Frame {
  private scanned: Candidate[] | undefined;

  readonly parent: StateStack | null;
  readonly rule: Rule;
  enterPos: number;
  anchorPos: number;
  readonly name: ScopeNode;
  readonly content: ScopeNode;
  readonly end: Re | null;
  readonly whileRe: Re | null;
  readonly endsLine: boolean;

  constructor(frame: Frame) {
    this.parent = frame.parent;
    this.rule = frame.rule;
    this.enterPos = frame.enterPos;
    this.anchorPos = frame.anchorPos;
    this.name = frame.name;
    this.content = frame.content;
    this.end = frame.end;
    this.whileRe = frame.whileRe;
    this.endsLine = frame.endsLine;
  }

  get candidates(): Candidate[] {
    if (this.scanned === undefined) {
      const patterns = this.rule.patterns.map((rule): Candidate => ({ re: (rule.match ?? rule.begin) as Re, rule }));
      const end: Candidate[] = this.end === null ? [] : [{ re: this.end, rule: null }];

      this.scanned = this.rule.json.applyEndPatternLast ? [...patterns, ...end] : [...end, ...patterns];
    }

    return this.scanned;
  }

  // Forgets the positions of the line before, which mean nothing on the next.
  startLine(): void {
    this.enterPos = -1;
    this.anchorPos = -1;
    this.parent?.startLine();
  }
}

class Emitter {
  readonly tokens: Token[] = [];
  private last = 0;
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  to(position: number, scope: ScopeNode): void {
    const end = Math.min(position, this.limit);

    if (end <= this.last) {
      return;
    }

    const previous = this.tokens.at(-1);

    if (previous?.scope === scope && previous.end === this.last) {
      previous.end = end;
    } else {
      this.tokens.push({ start: this.last, end, scope });
    }

    this.last = end;
  }

  // A view that cuts every position at `limit`. A capture tokenized again runs on the text up to its end and a little
  // past it, which must not paint the characters after the capture.
  within(limit: number): Sink {
    return {
      to: (position, scope) => this.to(Math.min(position, limit), scope),
      within: (inner) => this.within(Math.min(inner, limit)),
    };
  }
}

type Sink = Pick<Emitter, "to" | "within">;

type Line = { text: string; first: boolean; cache: Map<Re, Found | null>; out: Sink };

// The first match of a stack's candidates at or after `from`: the lowest index wins, then the earlier rule.
function scan(line: Line, stack: StateStack, from: number, anchor: number): Hit | null {
  let best: Hit | null = null;

  for (const { re, rule } of stack.candidates) {
    const found = search(line, re, from, anchor);

    if (found !== null && (best === null || found.index < best.index)) {
      best = { ...found, rule };

      if (found.index === from) {
        break;
      }
    }
  }

  return best;
}

// A match found from an earlier position stays the first match from every position up to its index, so each regex
// scans a line once. A regex that holds `\G` depends on the anchor and is searched every time.
function search(line: Line, re: Re, from: number, anchor: number): Found | null {
  if (re.anchored) {
    return re.find(line, from, anchor);
  }

  const cached = line.cache.get(re);

  if (cached !== undefined && (cached === null || cached.index >= from)) {
    return cached;
  }

  const found = re.find(line, from, anchor);

  line.cache.set(re, found);

  return found;
}

// Emits a match with its captures laid over the rule's scope. A capture that has patterns of its own is tokenized again
// inside its range.
function emitMatch(
  line: Line,
  base: ScopeNode,
  match: RegExpExecArray,
  captures: Captures | undefined,
  rule: Rule,
): void {
  const end = match.index + match[0].length;
  const whole = base.push(captures?.["0"]?.name, match);
  const indices = match.indices;

  if (captures === undefined || indices === undefined) {
    line.out.to(end, whole);

    return;
  }

  const open: { end: number; scope: ScopeNode }[] = [];
  const groups = Object.keys(captures)
    .map(Number)
    .filter((n) => n > 0 || captures[String(n)]?.patterns !== undefined)
    .sort((a, b) => a - b);

  for (const n of groups) {
    const range = indices[n];
    const capture = captures[String(n)];

    if (range === undefined || capture === undefined || range[1] <= range[0]) {
      continue;
    }

    for (let top = open.at(-1); top !== undefined && top.end <= range[0]; top = open.at(-1)) {
      line.out.to(top.end, top.scope);
      open.pop();
    }

    line.out.to(range[0], open.at(-1)?.scope ?? whole);

    const retokenizes = capture.patterns !== undefined && capture.patterns.length > 0;
    // Group 0 is the whole match, whose name is already in `whole`. A capture that is tokenized again starts from the
    // rule's own scopes and not from the captures around it, as vscode-textmate does.
    const scope = n === 0 ? whole : (retokenizes ? base : (open.at(-1)?.scope ?? whole)).push(capture.name, match);

    if (retokenizes && capture.patterns !== undefined) {
      const inner = {
        ...line,
        text: line.text.slice(0, range[1]),
        first: line.first && range[0] === 0,
        cache: new Map<Re, Found | null>(),
        out: line.out.within(range[1]),
      };
      const root = rule.grammar.groupOf(capture.patterns);

      const frame = new StateStack({
        parent: null,
        rule: root,
        enterPos: range[0],
        anchorPos: -1,
        name: scope,
        content: scope,
        end: null,
        whileRe: null,
        endsLine: false,
      });

      run(inner, frame, range[0]);
    } else {
      open.push({ end: range[1], scope });
    }
  }

  for (let top = open.pop(); top !== undefined; top = open.pop()) {
    line.out.to(top.end, top.scope);
  }

  line.out.to(end, whole);
}

// Pops the frames whose `while` no longer matches at the start of the line. Returns the stack left and where the
// frames that stayed ended their match.
function checkWhile(line: Line, stack: StateStack): { stack: StateStack; pos: number; anchor: number } {
  const open: StateStack[] = [];

  for (let frame: StateStack | null = stack; frame !== null; frame = frame.parent) {
    if (frame.whileRe !== null) {
      open.unshift(frame);
    }
  }

  let pos = 0;
  let anchor = stack.endsLine ? 0 : -1;

  for (const frame of open) {
    const found = frame.whileRe?.find(line, pos, anchor) ?? null;

    if (found === null) {
      return { stack: frame.parent ?? frame, pos, anchor };
    }

    emitMatch(line, frame.content, found.match, frame.rule.json.whileCaptures, frame.rule);
    pos = Math.max(pos, found.index + found.match[0].length);
    anchor = pos;
  }

  return { stack, pos, anchor };
}

// Whether a rule that matched nothing is already open at this position, which would push it forever.
function repeats(stack: StateStack, rule: Rule, position: number): boolean {
  for (let frame: StateStack | null = stack; frame !== null && frame.enterPos === position; frame = frame.parent) {
    if (frame.rule === rule) {
      return true;
    }
  }

  return false;
}

function run(
  line: Line,
  start: StateStack,
  from: number,
  startAnchor = from === 0 && start.endsLine ? 0 : -1,
): StateStack {
  const length = line.text.length;
  let stack = start;
  let pos = from;
  let anchor = startAnchor;

  // A rule may begin on nothing at the very end of the line, which is how a block that takes over from the next line is
  // opened, so the scan runs up to and including the end.
  while (pos <= length) {
    const found = scan(line, stack, pos, anchor);

    if (found === null) {
      break;
    }

    const { index, match, rule } = found;
    const end = index + match[0].length;

    line.out.to(index, stack.content);

    if (rule === null) {
      const popped = stack;

      if (popped.parent === null) {
        break;
      }

      emitMatch(line, popped.name, match, popped.rule.json.endCaptures, popped.rule);
      stack = popped.parent;
      anchor = popped.anchorPos;

      // Loop guards as in vscode-textmate: a rule that ends where it began, a rule that begins again where it began, and
      // a match that does not advance, each end the line. The last one also closes the rule around the match.
      if (end <= pos && popped.enterPos === pos) {
        stack = popped;

        break;
      }
    } else if (!rule.isPush) {
      const scope = stack.content.push(rule.json.name, match);

      emitMatch(line, scope, match, rule.json.captures, rule);

      if (end <= pos) {
        stack = stack.parent ?? stack;

        break;
      }
    } else {
      const name = stack.content.push(rule.json.name, match);

      emitMatch(line, name, match, rule.json.beginCaptures ?? rule.json.captures, rule);

      if (end <= pos && repeats(stack, rule, pos)) {
        break;
      }

      stack = new StateStack({
        parent: stack,
        rule,
        enterPos: pos,
        anchorPos: anchor,
        name,
        content: name.push(rule.json.contentName, match),
        end: rule.endFor(match),
        whileRe: rule.whileFor(match),
        endsLine: end >= length,
      });
      anchor = end;
    }

    pos = end;
  }

  line.out.to(length, stack.content);

  return stack;
}

// Tokenizes one line (without its line break) from the state the line before it left. The tokens cover the line.
// `first` is true for the first line of a file, which is where `\A` holds.
export function tokenizeLine(text: string, state: StateStack, first = false): { tokens: Token[]; state: StateStack } {
  const out = new Emitter(text.length);
  const line: Line = { text: `${text}\n`, first, cache: new Map(), out };
  state.startLine();

  const entered = checkWhile(line, state);
  const next = run(line, entered.stack, entered.pos, entered.anchor);

  return { tokens: out.tokens, state: next };
}
