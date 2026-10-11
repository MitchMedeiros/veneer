// Marks the build tool leaves in a translated regex for what a regex cannot say. This file holds only erasable syntax so
// Node can run the build tool and the conformance check against it.

// A back reference to a begin capture inside an `end` or `while` regex. The build tool writes the mark, the group
// number and the mark again in place of `\N`; the tokenizer swaps in the captured text once the begin has matched.
export const BACK_REFERENCE_MARK = String.fromCharCode(0xe000);

// A `\G` anchor. The tokenizer swaps in a test for the position the anchor is at.
export const ANCHOR_MARK = String.fromCharCode(0xe001);

// A `\A` anchor, which holds at the start of the first line of a file.
export const FIRST_LINE_MARK = String.fromCharCode(0xe002);

// The source with every mark replaced by something that compiles, to check a regex or count its groups.
export const withoutMarks = (source: string): string =>
  source.replaceAll(BACK_REFERENCE_MARK, "x").replaceAll(ANCHOR_MARK, "(?:)").replaceAll(FIRST_LINE_MARK, "(?:)");
