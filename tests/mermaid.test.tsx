import { expect, test } from "claude-code/testing";

import { parseClass } from "../hooks/mermaid-class";
import { diagramSketch } from "../hooks/mermaid-diagram";
import { parseEr } from "../hooks/mermaid-er";
import { flowSketch, parseFlow } from "../hooks/mermaid-flowchart";
import { layered } from "../hooks/mermaid-layout";
import { parseSequence } from "../hooks/mermaid-sequence";
import { plain, sourceLines, unquote } from "../hooks/mermaid-source";
import { parseState } from "../hooks/mermaid-state";
import { mermaidText } from "../hooks/mermaid-text";
import { baseOf } from "../hooks/palette";
import { cellHeightOf } from "../hooks/picture";
import { measure } from "../hooks/svg-text";
import { NATIVE, stub } from "./helpers";

const PALETTE = baseOf("dark");
const FONT = { family: "Helvetica Neue", cellHeight: cellHeightOf(2.9) };
const FLOW = "graph TD\n  A[Start] --> B{Ok?}\n  B -->|yes| C([Go])\n  B -->|no| D[Fix]\n  D --> B";

const reply = (text: string, id: string) =>
  ({
    plugin: "veneer",
    viewport: { columns: 100, rows: 30 },
    surface: "terminal",
    component: "AssistantMessage",
    requestId: id,
    props: { text, isFirstOfReply: true, isSummary: false },
  }) as never;

test("a flowchart reads into nodes and labelled edges", () => {
  const flow = parseFlow(FLOW)!;

  expect(flow.nodes.map(({ id, shape }) => [id, shape])).toEqual([
    ["A", "box"],
    ["B", "diamond"],
    ["C", "round"],
    ["D", "box"],
  ]);
  expect(flow.edges.map(({ from, to, label }) => `${from}>${to}:${label}`)).toEqual([
    "A>B:",
    "B>C:yes",
    "B>D:no",
    "D>B:",
  ]);
});

test("a diagram that is not a plain flowchart is not read as one", () => {
  expect(parseFlow("sequenceDiagram\n  A->>B: hi")).toBeNull();
  expect(parseFlow("graph TD\n  subgraph one\n  A --> B\n  end")).toBeNull();
  expect(parseFlow("graph TD\n  A --> B & C")).toBeNull();
});

test("a flowchart sketch is a whole number of cells wide and tall, and null where it would be too small", () => {
  const sketch = flowSketch(parseFlow(FLOW)!, 100, PALETTE, FONT)!;

  expect(sketch.svg).toContain(`width="${sketch.columns * 20}"`);
  expect(sketch.svg).toContain(`height="${sketch.rows * FONT.cellHeight}"`);
  expect(sketch.alt).toContain("Ok? -> Go (yes)");
  expect(flowSketch(parseFlow("graph TD\n A --> B\n A --> C\n A --> D\n A --> E")!, 10, PALETTE, FONT)).toBeNull();
});

test("an edge that skips a rank goes around the node between", () => {
  const flow = parseFlow("graph LR\n  A --> B --> C\n  A --> C")!;
  const direct = parseFlow("graph LR\n  A --> B --> C")!;

  expect(flowSketch(flow, 100, PALETTE, FONT)!.rows).toBeGreaterThan(flowSketch(direct, 100, PALETTE, FONT)!.rows);
});

const DIAGRAMS = {
  state: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: go\n  Busy --> Idle\n  Busy --> [*]",
  sequence: "sequenceDiagram\n  participant A as Alice\n  A->>+B: hi\n  B-->>-A: back\n  Note over A,B: done",
  class:
    "classDiagram\n  class Animal {\n    +name\n    +speak() void\n  }\n  Animal <|-- Dog\n  Owner --> Animal : has",
  er: "erDiagram\n  USER ||--o{ ORDER : places\n  ORDER {\n    int id PK\n  }",
};

test("state, sequence, class and er diagrams are pictures over whole cells", () => {
  for (const source of Object.values(DIAGRAMS)) {
    const sketch = diagramSketch(source, 100, PALETTE, FONT)!;

    expect(sketch.svg).toContain(`width="${sketch.columns * 20}"`);
    expect(sketch.svg).toContain(`height="${sketch.rows * FONT.cellHeight}"`);
    expect(sketch.alt).not.toBe("");
  }
});

test("a diagram wider than the window is scaled down, and null where that would be too small", () => {
  const wide = `sequenceDiagram\n  A->>B: ${"a long message ".repeat(8)}`;

  expect(diagramSketch(wide, 70, PALETTE, FONT)).not.toBeNull();
  expect(diagramSketch(wide, 20, PALETTE, FONT)).toBeNull();
});

test("a diagram the picture drawing cannot read is left to the text renderer", () => {
  expect(diagramSketch("stateDiagram-v2\n  state Group {\n    A --> B\n  }", 100, PALETTE, FONT)).toBeNull();
  expect(diagramSketch("sequenceDiagram\n  box Purple Team\n  participant A\n  end", 100, PALETTE, FONT)).toBeNull();
  expect(diagramSketch('pie\n  "a": 1', 100, PALETTE, FONT)).toBeNull();
});

test("state, class and er diagrams read their parts", () => {
  expect(parseState(DIAGRAMS.state)!.transitions).toHaveLength(4);
  expect(parseSequence(DIAGRAMS.sequence)!.participants.map(({ label }) => label)).toEqual(["Alice", "B"]);
  expect(parseClass(DIAGRAMS.class)!.classes.map(({ id }) => id)).toEqual(["Animal", "Dog", "Owner"]);
  expect(parseEr(DIAGRAMS.er)!.entities.find(({ id }) => id === "ORDER")!.attributes).toHaveLength(1);
});

test("a flowchart reads edge styles, labels, separators and comments", () => {
  const flow = parseFlow("graph LR; A --> B\n%% note\n  B -.-> C\n  C ==> D\n  A --- D\n  D -- why --> A")!;

  expect(flow.direction).toBe("right");
  expect(flow.edges.map(({ line, isArrow, label }) => `${line}:${isArrow}:${label}`)).toEqual([
    "solid:true:",
    "dotted:true:",
    "thick:true:",
    "solid:false:",
    "solid:true:why",
  ]);
});

test("a state diagram tells its start from its end and reads descriptions, choices and direction", () => {
  const diagram = parseState(
    "stateDiagram-v2\n  direction LR\n  [*] --> Idle\n  Idle : waiting\n  state pick <<choice>>\n  Idle --> pick\n  note right of Idle : ignored\n  pick --> [*]",
  )!;
  const kinds = Object.fromEntries(diagram.states.map(({ id, kind }) => [id, kind]));

  expect(diagram.direction).toBe("right");
  expect(kinds).toEqual({ "[*]start": "start", Idle: "state", pick: "choice", "[*]end": "end" });
  expect(diagram.states.find(({ id }) => id === "Idle")!.notes).toEqual(["waiting"]);
  expect(parseState("stateDiagram-v2\n  A --> B\n  what is this")).toBeNull();
});

test("a sequence diagram reads arrows, activation and nested blocks, and refuses unbalanced ones", () => {
  const diagram = parseSequence(
    "sequenceDiagram\n  A->>+B: call\n  B--)A: async\n  A-xB: lost\n  A->B: plain\n  loop twice\n  alt yes\n  A->>B: x\n  else no\n  B-->>-A: y\n  end\n  end",
  )!;
  const messages = diagram.events.flatMap((event) => (event.type === "message" ? [event] : []));

  expect(messages.map(({ head, isDotted }) => `${head}:${isDotted}`)).toEqual([
    "filled:false",
    "open:true",
    "cross:false",
    "none:false",
    "filled:false",
    "filled:true",
  ]);
  expect(messages[0]).toMatchObject({ activates: true, deactivates: false });
  expect(messages.at(-1)).toMatchObject({ activates: false, deactivates: true });
  expect(diagram.events.filter(({ type }) => type === "begin")).toHaveLength(2);
  expect(parseSequence("sequenceDiagram\n  A->>B: hi\n  end")).toBeNull();
  expect(parseSequence("sequenceDiagram\n  loop forever\n  A->>B: hi")).toBeNull();
});

test("a class diagram reads members, generics and the marker each arrow draws", () => {
  const diagram = parseClass(
    "classDiagram\n  class Box~T~ {\n    <<interface>>\n    +T value\n    +get() T\n  }\n  Box <|-- Crate\n  Crate *-- Lid\n  Lid ..> Box : uses\n  Crate -- Lid",
  )!;
  const box = diagram.classes.find(({ id }) => id === "Box~T~")!;

  expect(box).toMatchObject({
    label: "Box<T>",
    annotation: "<<interface>>",
    fields: ["+T value"],
    methods: ["+get() T"],
  });
  expect(diagram.relations.map(({ marker, isDashed }) => `${marker?.at}:${marker?.kind}:${isDashed}`)).toEqual([
    "from:triangle:false",
    "from:diamondFilled:false",
    "to:open:true",
    "undefined:undefined:false",
  ]);
});

test("an er diagram reads cardinalities, aliases and keys", () => {
  const diagram = parseEr('erDiagram\n  P["Person"] }o..|{ C : owns\n  P {\n    string id PK, FK\n  }')!;
  const person = diagram.entities.find(({ id }) => id === "P")!;

  expect(person.label).toBe("Person");
  expect(person.attributes).toEqual([{ type: "string", name: "id", keys: "PK,FK" }]);
  expect(diagram.relationships[0]).toMatchObject({
    fromCardinality: "zeroMany",
    toCardinality: "many",
    isDashed: true,
  });
  expect(parseEr("erDiagram\n  A {\n    not an attribute at all\n  }")).toBeNull();
});

test("a diagram with nothing in it, or too much, is not drawn", () => {
  for (const header of ["stateDiagram-v2", "sequenceDiagram", "classDiagram", "erDiagram", "graph TD"]) {
    expect(diagramSketch(header, 100, PALETTE, FONT)).toBeNull();
  }

  const crowd = Array.from({ length: 41 }, (_, i) => `N${i} --> N${i + 1}`).join("\n");

  expect(diagramSketch(`graph TD\n${crowd}`, 100, PALETTE, FONT)).toBeNull();
});

test("a sketch is the same drawing every time and holds no broken numbers", () => {
  for (const source of [FLOW, ...Object.values(DIAGRAMS)]) {
    const first = diagramSketch(source, 100, PALETTE, FONT)!;

    expect(diagramSketch(source, 100, PALETTE, FONT)!.svg).toBe(first.svg);
    expect(first.svg).not.toMatch(/NaN|undefined|Infinity/);
  }
});

test("every kind draws left to right as well as top to bottom", () => {
  const sources = [
    "graph LR\n  A --> B --> C",
    "stateDiagram-v2\n  direction LR\n  [*] --> A\n  A --> B",
    "classDiagram\n  direction LR\n  A <|-- B",
    "erDiagram\n  direction LR\n  A ||--o{ B : has",
  ];

  for (const source of sources) {
    const sketch = diagramSketch(source, 100, PALETTE, FONT)!;

    expect(sketch).not.toBeNull();
    expect(sketch.svg).not.toMatch(/NaN|undefined|Infinity/);
  }
});

test("text from the source is escaped in every kind", () => {
  const sources = [
    "graph TD\n  A[a < b & c] --> B",
    'stateDiagram-v2\n  state "a < b & c" as X\n  [*] --> X',
    "sequenceDiagram\n  A->>B: a < b & c",
    "classDiagram\n  class X {\n    +a < b & c\n  }",
    'erDiagram\n  E["a < b & c"] ||--o{ F : has',
  ];

  for (const source of sources) {
    const { svg } = diagramSketch(source, 100, PALETTE, FONT)!;

    expect(svg).toContain("a &lt; b &amp; c");
    expect(svg).not.toContain("a < b");
  }
});

type Box = { x: number; y: number; w: number; h: number };

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const GRAPHS: Record<string, [string, string][]> = {
  chain: [
    ["a", "b"],
    ["b", "c"],
    ["c", "d"],
  ],
  diamond: [
    ["a", "b"],
    ["a", "c"],
    ["b", "d"],
    ["c", "d"],
    ["a", "d"],
  ],
  cycle: [
    ["a", "b"],
    ["b", "c"],
    ["c", "a"],
  ],
  loop: [
    ["a", "a"],
    ["a", "b"],
  ],
  fan: [
    ["r", "a"],
    ["r", "b"],
    ["r", "c"],
    ["r", "d"],
    ["r", "e"],
    ["r", "f"],
    ["r", "g"],
  ],
  apart: [
    ["a", "b"],
    ["c", "d"],
  ],
};

test("a layout never overlaps nodes, keeps every point inside the picture and routes every edge", () => {
  for (const direction of ["down", "right"] as const) {
    for (const pairs of Object.values(GRAPHS)) {
      const ids = [...new Set(pairs.flat())];
      const layout = layered(
        ids.map((id) => ({ id, w: 120 + (id.charCodeAt(0) % 4) * 10, h: 80 })),
        pairs.map(([from, to]) => ({ from, to, label: "label" })),
        direction,
        { sibling: 60, rank: 120, labelSize: 28 },
      );

      expect(layout.routes).toHaveLength(pairs.length);

      for (const [i, node] of layout.nodes.entries()) {
        expect(layout.nodes.slice(i + 1).some((other) => overlaps(node, other))).toBe(false);
      }

      for (const { points, label } of layout.routes) {
        const width = measure("label", 28);
        const left =
          label.anchor === "start" ? label.x : label.anchor === "end" ? label.x - width : label.x - width / 2;

        expect(left).toBeGreaterThanOrEqual(0);
        expect(left + width).toBeLessThanOrEqual(layout.width);

        for (const { x, y } of points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(layout.width);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(layout.height);
        }
      }
    }
  }
});

test("a layout puts the target of a forward edge after its source, and a cycle still ends up ranked", () => {
  const layout = layered(
    ["a", "b", "c"].map((id) => ({ id, w: 100, h: 60 })),
    [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" },
    ],
    "down",
    { sibling: 40, rank: 80 },
  );
  const at = Object.fromEntries(layout.nodes.map(({ id, y }) => [id, y]));

  expect(at.a).toBeLessThan(at.b!);
  expect(at.b).toBeLessThan(at.c!);
});

test("source helpers drop comments and blanks and flatten line breaks", () => {
  expect(sourceLines("a\r\n\n  %% c\n b ")).toEqual(["a", "b"]);
  expect(plain("one<br/>two   three")).toBe("one two three");
  expect(unquote('  "quoted <br> text" ')).toBe("quoted text");
});

test("the text renderer draws flowcharts and sequence diagrams in boxes and returns null for other kinds", () => {
  expect(mermaidText(FLOW)!.join("\n")).toContain("┌");
  expect(mermaidText("sequenceDiagram\n  A->>B: hi")!.join("\n")).toContain("hi");
  expect(mermaidText('pie\n  "a": 1')).toBeNull();
});

test("a mermaid fence with no picture is a text diagram card with a copy button", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply(`before\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n\nafter`, "mm1"));

  expect(await ui.find({ type: "Text", text: "mermaid" })).toBeDefined();
  expect(await ui.find({ type: "Button" })).toBeDefined();
});

test("a mermaid fence the text renderer cannot read stays a code block", async ($, on) => {
  stub(on, NATIVE);

  const ui = await $.ui.mount(reply('```mermaid\npie\n  "a": 1\n```', "mm2"));

  expect(await ui.find({ type: "Text", text: "pie" })).toBeDefined();
});
