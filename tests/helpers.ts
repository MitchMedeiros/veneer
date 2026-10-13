import type { On, RenderElement } from "claude-code";
import { mock } from "claude-code/testing";

// The row Claude Code draws itself, which a Veneer hook replaces or leaves as it is.
export const NATIVE: RenderElement = { type: "engine", ref: 0 };

// A row some other mod already drew, which Veneer must pass through untouched.
export const OTHER_MOD: RenderElement = { type: "Text", props: {}, children: ["another mod"] };

// The world beneath the plugins for a render test: a fixed clock, no environment, a working folder, and a `ui.render`
// that answers with `row`.
export function stub(on: On, row: RenderElement = NATIVE): void {
  mock.clock(on, { now: 10_000 });
  on("env.get", () => ({ value: undefined }));
  on("session.cwd", () => ({ value: "/work" }));
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.render", () => row);
}
