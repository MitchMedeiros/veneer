// The first and the newest row of the transcript that a render hook has drawn, by the id `ui.scroll` takes. The engine
// names no row, so the hooks note each row as it is drawn, and the first and last seen stand for the ends.

const REMEMBERED = 20_000;

const known = new Set<string>();
let first: string | undefined;
let last: string | undefined;

// Notes a row as drawn. A row seen again leaves the last one as it was, so a redraw of an old row is not the newest.
export function noteRow(id: string): void {
  if (known.has(id)) {
    return;
  }

  known.add(id);
  first ??= id;
  last = id;

  if (known.size > REMEMBERED) {
    known.delete(known.values().next().value!);
  }
}

export const firstRow = (): string | undefined => first;

export const lastRow = (): string | undefined => last;

// A new session or a cleared one starts its own transcript.
export function forgetRows(): void {
  known.clear();
  first = undefined;
  last = undefined;
}
