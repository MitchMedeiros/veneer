import { CELL_WIDTH, fill, rowsFor, svgDocument } from "./picture";
import type { Font, Sketch } from "./picture";
import { escapeXml, measure } from "./svg-text";

export type Point = { x: number; y: number };
export type Direction = "down" | "right";
export type GraphNode = { id: string; w: number; h: number };
export type GraphEdge = { from: string; to: string; label?: string };
export type Placed = GraphNode & { x: number; y: number };
export type Label = Point & { anchor: "start" | "middle" | "end" };

// A way through the graph from one node to another: waypoints on the borders of the two nodes and the centres of the
// ranks between, drawn as curves that leave and arrive along the direction of the ranks. `startDir` and `endDir` are
// the unit vectors the route travels along at its two ends.
export type Route<E extends GraphEdge = GraphEdge> = {
  edge: E;
  points: Point[];
  isLoop: boolean;
  isDown: boolean;
  startDir: Point;
  endDir: Point;
  label: Label;
};

type Layout<E extends GraphEdge = GraphEdge> = {
  nodes: Placed[];
  routes: Route<E>[];
  width: number;
  height: number;
};

// Text sizes shared by every diagram, so a diagram reads the same size whatever its kind: the name of a node, the text
// that runs along it, and the detail beside it.
export const TEXT = 34;
export const LABEL = 28;
export const DETAIL = 24;
export const LINE_HEIGHT = TEXT * 1.3;

export const EDGE_WIDTH = 2.5;
export const MARGIN = 8;
const LOOP = 44;
const DUMMY = 24;
const SWEEPS = 8;
const RELAX = 8;
const PORT_STEP = 32;
const PORT_PAD = 20;
const MIN_SCALE = 0.55;

const average = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

// The edges that close a cycle, found walking from each node in order.
function backEdges<E extends GraphEdge>(order: readonly string[], edges: readonly E[]): Set<E> {
  const state = new Map<string, "open" | "done">();
  const back = new Set<E>();

  const walk = (id: string) => {
    state.set(id, "open");

    for (const edge of edges.filter((candidate) => candidate.from === id)) {
      const seen = state.get(edge.to);

      if (seen === "open") {
        back.add(edge);
      } else if (seen === undefined) {
        walk(edge.to);
      }
    }

    state.set(id, "done");
  };

  for (const id of order) {
    if (!state.has(id)) {
      walk(id);
    }
  }

  return back;
}

type Item = { key: string; w: number; h: number };

// Nodes in ranks along `direction`, with long edges threaded through the ranks between, rows ordered to cut crossings
// and spread by pulling each node toward the ones it joins. `gaps.sibling` separates neighbours in a rank and `gaps.rank`
// separates ranks.
export function layered<E extends GraphEdge>(
  nodes: readonly GraphNode[],
  edges: readonly E[],
  direction: Direction,
  gaps: { sibling: number; rank: number; labelSize?: number },
): Layout<E> {
  const isDown = direction === "down";
  const order = nodes.map(({ id }) => id);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sizeOf = ({ w, h }: GraphNode) => (isDown ? { w, h } : { w: h, h: w });
  const straight = edges.filter((edge) => edge.from !== edge.to && byId.has(edge.from) && byId.has(edge.to));
  const loops = edges.filter((edge) => edge.from === edge.to && byId.has(edge.from));
  const back = backEdges(order, straight);
  const chained = straight.map((edge) => ({
    edge,
    reversed: back.has(edge),
    from: back.has(edge) ? edge.to : edge.from,
    to: back.has(edge) ? edge.from : edge.to,
  }));
  const depth = new Map(order.map((id) => [id, 0]));

  for (let pass = 0; pass < order.length; pass++) {
    for (const { from, to } of chained) {
      depth.set(to, Math.max(depth.get(to) ?? 0, (depth.get(from) ?? 0) + 1));
    }
  }

  const items = new Map<string, Item>(nodes.map((node) => [node.id, { key: node.id, ...sizeOf(node) }] as const));
  const rankOf = new Map(depth);
  const chains = chained.map(({ from, to }, n) => {
    const keys = [from];

    for (let r = (depth.get(from) ?? 0) + 1; r < (depth.get(to) ?? 0); r++) {
      const key = `${n}:${r}`;

      items.set(key, { key, w: DUMMY, h: 0 });
      rankOf.set(key, r);
      keys.push(key);
    }

    return [...keys, to];
  });

  const count = Math.max(0, ...rankOf.values()) + 1;
  const ranks: string[][] = Array.from({ length: count }, () => []);

  for (const id of order) {
    ranks[rankOf.get(id) ?? 0]!.push(id);
  }

  for (const chain of chains) {
    for (const key of chain.slice(1, -1)) {
      ranks[rankOf.get(key) ?? 0]!.push(key);
    }
  }

  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();

  for (const chain of chains) {
    for (const [i, key] of chain.slice(0, -1).entries()) {
      const next = chain[i + 1]!;

      down.set(key, [...(down.get(key) ?? []), next]);
      up.set(next, [...(up.get(next) ?? []), key]);
    }
  }

  const indexes = () => new Map(ranks.flatMap((rank) => rank.map((key, i) => [key, i] as const)));

  const crossings = (): number => {
    const at = indexes();
    let total = 0;

    for (const rank of ranks.slice(0, -1)) {
      const pairs = rank.flatMap((key) => (down.get(key) ?? []).map((to) => [at.get(key)!, at.get(to)!] as const));

      for (const [i, [a, b]] of pairs.entries()) {
        for (const [c, d] of pairs.slice(i + 1)) {
          total += (a - c) * (b - d) < 0 ? 1 : 0;
        }
      }
    }

    return total;
  };

  const settle = (rank: string[], neighbours: Map<string, string[]>) => {
    const at = indexes();
    const target = new Map(
      rank.map((key, i) => {
        const near = neighbours.get(key) ?? [];

        return [key, near.length === 0 ? i : average(near.map((other) => at.get(other)!))] as const;
      }),
    );

    rank.sort((a, b) => target.get(a)! - target.get(b)!);
  };

  let best = ranks.map((rank) => [...rank]);
  let fewest = crossings();

  for (let sweep = 0; sweep < SWEEPS && fewest > 0; sweep++) {
    if (sweep % 2 === 0) {
      ranks.slice(1).forEach((rank) => settle(rank, up));
    } else {
      ranks
        .slice(0, -1)
        .reverse()
        .forEach((rank) => settle(rank, down));
    }

    const now = crossings();

    if (now < fewest) {
      fewest = now;
      best = ranks.map((rank) => [...rank]);
    }
  }

  best.forEach((rank, r) => ranks.splice(r, 1, rank));

  const centre = new Map<string, number>();
  const room = (a: string, b: string) => (items.get(a)!.w + items.get(b)!.w) / 2 + gaps.sibling;

  for (const rank of ranks) {
    let x = 0;

    for (const [i, key] of rank.entries()) {
      x += i === 0 ? 0 : room(rank[i - 1]!, key);
      centre.set(key, x);
    }

    const middle = (centre.get(rank.at(-1) ?? "") ?? 0) / 2;

    rank.forEach((key) => centre.set(key, centre.get(key)! - middle));
  }

  // Each rank in turn is pulled toward the nodes it joins in the rank beside it, then pushed apart where they overlap:
  // the mean of a push from the left and a push from the right keeps every gap and stays close to the pull.
  const relax = (rank: string[], neighbours: Map<string, string[]>) => {
    const wanted = rank.map((key) => {
      const near = neighbours.get(key) ?? [];

      return near.length === 0 ? centre.get(key)! : average(near.map((other) => centre.get(other)!));
    });
    const forward = [...wanted];
    const backward = [...wanted];

    for (let i = 1; i < rank.length; i++) {
      forward[i] = Math.max(forward[i]!, forward[i - 1]! + room(rank[i - 1]!, rank[i]!));
    }

    for (let i = rank.length - 2; i >= 0; i--) {
      backward[i] = Math.min(backward[i]!, backward[i + 1]! - room(rank[i]!, rank[i + 1]!));
    }

    rank.forEach((key, i) => centre.set(key, (forward[i]! + backward[i]!) / 2));
  };

  for (let pass = 0; pass < RELAX; pass++) {
    ranks.slice(1).forEach((rank) => relax(rank, up));
    ranks
      .slice(0, -1)
      .reverse()
      .forEach((rank) => relax(rank, down));
  }

  const bands = ranks.map((rank) => Math.max(...rank.map((key) => items.get(key)!.h)));
  const top = bands.map((_, r) => bands.slice(0, r).reduce((sum, band) => sum + band + gaps.rank, 0));
  const middle = (key: string) => top[rankOf.get(key) ?? 0]! + bands[rankOf.get(key) ?? 0]! / 2;
  const toFinal = (x: number, y: number): Point => (isDown ? { x, y } : { x: y, y: x });
  const placed = order.map((id): Placed => {
    const node = byId.get(id)!;
    const at = toFinal(centre.get(id)!, middle(id));

    return { ...node, x: at.x - node.w / 2, y: at.y - node.h / 2 };
  });
  const place = new Map(placed.map((node) => [node.id, node]));
  // Edges that meet one side of a node leave it side by side, in the order of the nodes they go to.
  const spread = (ends: Map<string, { chain: number; toward: number }[]>) => {
    const offsets = new Map<number, number>();

    for (const [key, list] of ends) {
      const step =
        list.length < 2 ? 0 : Math.max(0, Math.min(PORT_STEP, (items.get(key)!.w - 2 * PORT_PAD) / (list.length - 1)));

      list.sort((a, b) => a.toward - b.toward);
      list.forEach(({ chain }, i) => offsets.set(chain, (i - (list.length - 1) / 2) * step));
    }

    return offsets;
  };
  const leaving = new Map<string, { chain: number; toward: number }[]>();
  const arriving = new Map<string, { chain: number; toward: number }[]>();

  chains.forEach((chain, n) => {
    const [from, next] = chain;
    const to = chain.at(-1)!;
    const before = chain.at(-2)!;

    leaving.set(from!, [...(leaving.get(from!) ?? []), { chain: n, toward: centre.get(next!)! }]);
    arriving.set(to, [...(arriving.get(to) ?? []), { chain: n, toward: centre.get(before)! }]);
  });

  const exits = spread(leaving);
  const entries = spread(arriving);
  const routes: Route<E>[] = chains.map((chain, n) => {
    const { edge, reversed } = chained[n]!;
    const first = items.get(chain[0]!)!;
    const last = items.get(chain.at(-1)!)!;
    const points = [
      toFinal(centre.get(chain[0]!)! + (exits.get(n) ?? 0), middle(chain[0]!) + first.h / 2),
      ...chain.slice(1, -1).map((key) => toFinal(centre.get(key)!, middle(key))),
      toFinal(centre.get(chain.at(-1)!)! + (entries.get(n) ?? 0), middle(chain.at(-1)!) - last.h / 2),
    ];
    const along = isDown ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const dir = reversed ? { x: -along.x, y: -along.y } : along;

    if (reversed) {
      points.reverse();
    }

    const pair = Math.floor((points.length - 1) / 2);
    const a = points[pair]!;
    const b = points[pair + 1]!;

    return {
      edge,
      points,
      isLoop: false,
      isDown,
      startDir: dir,
      endDir: dir,
      label: labelBeside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, points, isDown),
    };
  });

  for (const edge of loops) {
    const at = place.get(edge.from)!;
    const reach = LOOP * 1.6;
    const points = isDown
      ? [
          { x: at.x + at.w, y: at.y + at.h * 0.3 },
          { x: at.x + at.w + reach, y: at.y + at.h * 0.05 },
          { x: at.x + at.w + reach, y: at.y + at.h * 0.95 },
          { x: at.x + at.w, y: at.y + at.h * 0.7 },
        ]
      : [
          { x: at.x + at.w * 0.7, y: at.y + at.h },
          { x: at.x + at.w * 0.95, y: at.y + at.h + reach },
          { x: at.x + at.w * 0.05, y: at.y + at.h + reach },
          { x: at.x + at.w * 0.3, y: at.y + at.h },
        ];

    routes.push({
      edge,
      points,
      isLoop: true,
      isDown,
      startDir: isDown ? { x: 1, y: 0 } : { x: 0, y: 1 },
      endDir: isDown ? { x: -1, y: 0 } : { x: 0, y: -1 },
      label: isDown
        ? { x: at.x + at.w + reach * 0.75 + 8, y: at.y + at.h / 2 - 4, anchor: "start" }
        : { x: at.x + at.w / 2, y: at.y + at.h + reach * 0.75 + 20, anchor: "middle" },
    });
  }

  // Labels count toward the size of the picture.
  const extents = routes.flatMap(({ edge, label }) => {
    const width = measure(edge.label ?? "", gaps.labelSize ?? 0);

    return edge.label === undefined || edge.label === ""
      ? []
      : [
          {
            x:
              label.anchor === "start"
                ? [label.x, label.x + width]
                : label.anchor === "end"
                  ? [label.x - width, label.x]
                  : [label.x - width / 2, label.x + width / 2],
            y: [label.y - (gaps.labelSize ?? 0), label.y + (gaps.labelSize ?? 0) * 0.3],
          },
        ];
  });
  const xs = [
    ...placed.flatMap(({ x, w }) => [x, x + w]),
    ...routes.flatMap(({ points }) => points.map((p) => p.x)),
    ...extents.flatMap(({ x }) => x),
  ];
  const ys = [
    ...placed.flatMap(({ y, h }) => [y, y + h]),
    ...routes.flatMap(({ points }) => points.map((p) => p.y)),
    ...extents.flatMap(({ y }) => y),
  ];
  const left = Math.min(...xs) - MARGIN;
  const above = Math.min(...ys) - MARGIN;
  const move = (p: Point): Point => ({ x: p.x - left, y: p.y - above });

  return {
    nodes: placed.map((node) => ({ ...node, ...move(node) })),
    routes: routes.map((route) => ({
      ...route,
      points: route.points.map(move),
      label: { ...route.label, ...move(route.label) },
    })),
    width: Math.max(...xs) + MARGIN - left,
    height: Math.max(...ys) + MARGIN - above,
  };
}

// Where an edge label sits: beside the middle of a vertical edge, on the half of the curve clear of the text, and above
// a horizontal one.
function labelBeside(mid: Point, points: readonly Point[], isDown: boolean): Label {
  if (!isDown) {
    return { x: mid.x, y: mid.y - 12, anchor: "middle" };
  }

  const leftward = points[points.length - 1]!.x < points[0]!.x - 1;

  return { x: mid.x + (leftward ? -12 : 12), y: mid.y - 4, anchor: leftward ? "end" : "start" };
}

const num = (value: number): number => Math.round(value * 10) / 10;

// The path of a route as one SVG path.
export function pathOf({ points, isLoop, isDown }: Route): string {
  const [first, ...rest] = points;

  if (isLoop) {
    const [, a, b, c] = points;

    return `M${num(first!.x)} ${num(first!.y)}C${num(a!.x)} ${num(a!.y)} ${num(b!.x)} ${num(b!.y)} ${num(c!.x)} ${num(c!.y)}`;
  }

  let path = `M${num(first!.x)} ${num(first!.y)}`;
  let from = first!;

  for (const to of rest) {
    const bend = isDown ? { x: 0, y: (to.y - from.y) / 2 } : { x: (to.x - from.x) / 2, y: 0 };

    path += `C${num(from.x + bend.x)} ${num(from.y + bend.y)} ${num(to.x - bend.x)} ${num(to.y - bend.y)} ${num(to.x)} ${num(to.y)}`;
    from = to;
  }

  return path;
}

// A route with its two ends drawn in by the given lengths, to leave room for a marker.
export function trimmed<E extends GraphEdge>(route: Route<E>, startLength: number, endLength: number): Route<E> {
  const points = route.points.map((p) => ({ ...p }));
  const first = points[0]!;
  const last = points[points.length - 1]!;

  first.x += route.startDir.x * startLength;
  first.y += route.startDir.y * startLength;
  last.x -= route.endDir.x * endLength;
  last.y -= route.endDir.y * endLength;

  return { ...route, points };
}

export const textSvg = (
  x: number,
  y: number,
  text: string,
  size: number,
  color: string,
  anchor: Label["anchor"] = "middle",
  extra = "",
): string =>
  `<text x="${num(x)}" y="${num(y)}" text-anchor="${anchor}" font-size="${size}" ${fill(color)}${extra}>${escapeXml(text)}</text>`;

// Text with its middle on `y` rather than its baseline.
export const centredText = (x: number, y: number, text: string, size: number, color: string, extra = ""): string =>
  textSvg(x, y + size * 0.35, text, size, color, "middle", extra);

// The same route walked from its other end.
export const reversed = <E extends GraphEdge>(route: Route<E>): Route<E> => ({
  ...route,
  points: [...route.points].reverse(),
  startDir: { x: -route.endDir.x, y: -route.endDir.y },
  endDir: { x: -route.startDir.x, y: -route.startDir.y },
});

// A short text beside an end of a route, `distance` out along it and on one side.
export function endText(point: Point, dir: Point, distance: number, text: string, size: number, color: string): string {
  const x = point.x + dir.x * distance - dir.y * 16;
  const y = point.y + dir.y * distance + dir.x * 16;

  return text === "" ? "" : textSvg(x, y + size * 0.35, text, size, color, dir.y === 0 ? "middle" : "start");
}

// The stroke attribute of a dotted line.
export const DASHED = ` stroke-dasharray="${EDGE_WIDTH * 3} ${EDGE_WIDTH * 3}"`;

// The direction a diagram runs, from the line that sets it.
export const directionOf = (line: string): Direction => (/\b(LR|RL)\b/.test(line) ? "right" : "down");

export const pathSvg = (d: string, color: string, width: number, extra = ""): string =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${extra}/>`;

export const strokeSvg = (route: Route, color: string, width: number, extra = ""): string =>
  pathSvg(pathOf(route), color, width, extra);

export const labelSvg = ({ label }: Route, text: string, size: number, color: string): string =>
  text === "" ? "" : textSvg(label.x, label.y, text, size, color, label.anchor);

export const rectSvg = (x: number, y: number, w: number, h: number, radius: number, paint: string): string =>
  `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${radius}" ${paint}/>`;

export const lineSvg = (a: Point, b: Point, stroke: string, width: number, extra = ""): string =>
  pathSvg(`M${num(a.x)} ${num(a.y)}L${num(b.x)} ${num(b.y)}`, stroke, width, extra);

// The fill and outline of a box in an accent colour.
export const boxPaint = (color: string, width: number, opacity = 0.14): string =>
  `${fill(color, opacity)} stroke="${color}" stroke-width="${width}"`;

// A diagram body as a sketch over whole cells, scaled down to fit `available` columns, or null where that would make it
// too small to read or taller than a picture may be.
export function finish(
  body: string,
  width: number,
  height: number,
  available: number,
  font: Font,
  alt: string,
): Sketch | null {
  const scale = Math.min(1, (available * CELL_WIDTH) / width);

  if (scale < MIN_SCALE) {
    return null;
  }

  const columns = Math.min(available, Math.ceil((width * scale) / CELL_WIDTH));
  const rows = rowsFor(height * scale, font.cellHeight);

  if (rows * font.cellHeight < height * scale - 1) {
    return null;
  }

  const content = scale === 1 ? body : `<g transform="scale(${num(scale * 1000) / 1000})">${body}</g>`;

  return { svg: svgDocument(columns, rows, font.cellHeight, font.family, content), columns, rows, alt };
}

export type MarkerKind = "arrow" | "open" | "triangle" | "diamond" | "diamondFilled";

const MARKERS: Record<MarkerKind, { length: number; height: number; box: string; shape: string }> = {
  arrow: { length: 16, height: 16, box: "0 0 10 10", shape: `<path d="M0 1L10 5L0 9z" fill="COLOR"/>` },
  open: {
    length: 16,
    height: 16,
    box: "0 0 10 10",
    shape: `<path d="M0 0.5L9.5 5L0 9.5" fill="none" stroke="COLOR" stroke-width="1.4"/>`,
  },
  triangle: {
    length: 24,
    height: 22,
    box: "0 0 10 10",
    shape: `<path d="M0.4 0.5L9.6 5L0.4 9.5z" fill="none" stroke="COLOR" stroke-width="0.9"/>`,
  },
  diamond: {
    length: 30,
    height: 15,
    box: "0 0 20 10",
    shape: `<path d="M0.5 5L10 0.6L19.5 5L10 9.4z" fill="none" stroke="COLOR" stroke-width="1"/>`,
  },
  diamondFilled: { length: 30, height: 15, box: "0 0 20 10", shape: `<path d="M0 5L10 0L20 5L10 10z" fill="COLOR"/>` },
};

// How far a route must stop short of a node for a marker of this kind to fit in the space.
export const markerLength = (kind: MarkerKind): number => MARKERS[kind].length;

// The definition of a marker whose tip lands on the end of a path that stops `markerLength` short of its node. A
// diagram that needs one marker in several colours gives each its own `id`.
export const markerDef = (kind: MarkerKind, color: string, id: string = kind): string => {
  const { length, height, box, shape } = MARKERS[kind];

  return `<marker id="${id}" viewBox="${box}" refX="0" refY="${Number(box.split(" ")[3]) / 2}" markerWidth="${length}" markerHeight="${height}" markerUnits="userSpaceOnUse" orient="auto">${shape.replaceAll("COLOR", color)}</marker>`;
};

export const markerAttribute = (kind: MarkerKind, id: string = kind): string => ` marker-end="url(#${id})"`;
