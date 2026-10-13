// A regex written as `/source/flags`, already translated to JavaScript by the grammar build tool.
export type RegexSource = string;

export type CaptureRule = { name?: string; patterns?: GrammarRule[] };

export type Captures = Record<string, CaptureRule>;

// A TextMate rule as the build tool writes it: the shape of a TextMate grammar with every regex translated. A rule is a
// match, a begin and end pair, a begin and while pair, or only a list of patterns and includes.
export type GrammarRule = {
  name?: string;
  contentName?: string;
  match?: RegexSource;
  begin?: RegexSource;
  end?: RegexSource;
  while?: RegexSource;
  include?: string;
  patterns?: GrammarRule[];
  captures?: Captures;
  beginCaptures?: Captures;
  endCaptures?: Captures;
  whileCaptures?: Captures;
  applyEndPatternLast?: boolean;
};

export type Grammar = {
  scopeName: string;
  patterns: GrammarRule[];
  repository?: Record<string, GrammarRule>;
  // Scope names of the grammars this one includes, so they are loaded before it tokenizes.
  deps?: string[];
};

// One language of the shipped set, as the grammar index lists it.
export type LanguageEntry = {
  scopeName: string;
  file: string;
  aliases: string[];
  extensions: string[];
};

export type GrammarIndex = {
  languages: Record<string, LanguageEntry>;
  // The file that holds each scope name, for includes across grammars.
  scopes: Record<string, string>;
};

// A VS Code colour theme as far as syntax goes.
export type ThemeRule = {
  name?: string;
  scope?: string | string[];
  settings: { foreground?: string; background?: string; fontStyle?: string };
};

export type ThemeFile = {
  name?: string;
  type?: string;
  include?: string;
  colors?: Record<string, string>;
  tokenColors?: ThemeRule[];
};

export type TokenStyle = {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
};

// A run of text in one style; the unit the cards draw.
export type StyledRun = { text: string } & TokenStyle;
