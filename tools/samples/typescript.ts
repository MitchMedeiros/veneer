import type { Foo } from "./foo";
import * as path from "node:path";

// A line comment with `code` inside
/**
 * A doc comment.
 * @param name the name
 */
export async function greet<T extends { id: number }>(name: string, items: Map<string, T> = new Map()): Promise<void> {
  const re = /ab+c\/(?<year>\d{4})/giu;
  const text = `hello ${name.toUpperCase()} and ${items.size > 0 ? `nested ${name}` : "none"}`;
  const n = 0xff + 1_000n + 3.14e-2;

  for (const [key, value] of items) {
    if (!value || key === undefined) continue;
    await fetch(`/api/${key}`, { method: "POST", body: JSON.stringify({ value }) });
  }

  label: while (true) {
    break label;
  }
}

enum Color {
  Red = "RED",
  Green = "GREEN",
}

abstract class Shape<T> implements Iterable<T> {
  private readonly points: T[] = [];
  static #count = 0;
  protected constructor(public readonly name: string) {}
  abstract area(): number;
  get size(): number {
    return this.points.length;
  }
  *[Symbol.iterator](): Iterator<T> {
    yield* this.points;
  }
}

type Mapped<K extends string> = { [P in K]?: P extends "a" ? number : string };
declare module "foo" {
  export const x: number;
}
const fn = <T,>(x: T): x is NonNullable<T> => x != null;
export default class {}
