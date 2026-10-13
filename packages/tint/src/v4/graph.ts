/**
 * Backdrop graph (docs/v4-spec.md §4, §6.2, §6.3).
 *
 * Links each state token to its rest (or compound prefix), generates a
 * missing rest internally, expands `on` into a backdrop set, and orders the
 * tokens so every backdrop and rest is solved first. Cycles, self-targets,
 * and unknown targets are issues in the T4 shape. Nothing here throws.
 */

import type { ConfigFix, ConfigIssue } from "./errors.js";
import { joinPath, suggestName } from "./levels.js";
import { DISABLED_STATE, type CanonicalState } from "./states.js";
import type { Kind } from "./types.js";
import type { NormalizedToken } from "./normalize.js";

/**
 * Theme page. Used when a surface omits `on`, and when no base surface exists.
 * Token ids are `group.token`, so this sentinel does not collide with one.
 */
export const PAGE = "page";

/** `on`: one group, or one group.token (§6.2). Same rule as validation. */
const ON_RE = /^[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)?$/;

/** One authored token, already normalized and tuned. */
export interface AuthoredToken {
  group: string;
  name: string;
  value: NormalizedToken;
  /** Dotted path of the `on` that won, for issues. */
  onPath: string;
}

/** A token in the solve graph, authored or generated. */
export interface ResolvedToken {
  /** `group.token`. */
  readonly id: string;
  readonly group: string;
  readonly name: string;
  /** True when the engine invented this rest or compound prefix (§4). */
  readonly generated: boolean;
  readonly value: NormalizedToken;
  /**
   * Backdrop members in config order.
   * {@link PAGE} is the theme page. Disabled tokens point at one member.
   */
  readonly backdrop: readonly string[];
  /**
   * Immediate rest link (§4, §6.3).
   * `selected-hover` points at `selected`; `selected` points at the rest token.
   */
  readonly derivesFrom?: string;
}

/** A generated rest or prefix, named so a diagnostic can quote it. */
export interface GraphDiagnostic {
  readonly path: string;
  readonly message: string;
  /** Id of the generated token. */
  readonly id: string;
}

export interface TokenGraph {
  /** Authored tokens in config order. This is the output order (§6.3). */
  readonly tokens: readonly ResolvedToken[];
  /** Internal rests, in the order they were generated. */
  readonly generated: readonly ResolvedToken[];
  /**
   * Solve order. Prerequisites come first. Ties keep config order.
   * Tokens that sit in a cycle are appended in config order.
   */
  readonly order: readonly string[];
  /** Base surface token id, or {@link PAGE}. */
  readonly baseSurface: string;
  readonly issues: readonly ConfigIssue[];
  readonly diagnostics: readonly GraphDiagnostic[];
}

interface Node {
  id: string;
  group: string;
  name: string;
  generated: boolean;
  value: NormalizedToken;
  onPath: string;
  /** Position used to break topological ties. Authored tokens keep config order. */
  seq: number;
  derivesFrom?: string;
  backdrop: string[];
}

/**
 * Build the backdrop graph for one theme × palette expansion.
 * `input` is config order.
 */
export function buildTokenGraph(input: readonly AuthoredToken[]): TokenGraph {
  const linked = linkRestTokens(input);
  const baseSurface = findBaseSurface(linked.nodes);
  const issues: ConfigIssue[] = [];
  for (const node of linked.nodes) {
    node.backdrop = backdropOf(node, baseSurface, linked.nodes, issues);
  }
  const tokens = linked.nodes.filter((node) => !node.generated).map(freeze);
  const generated = linked.nodes.filter((node) => node.generated).map(freeze);
  const order = topologicalOrder(linked.nodes);
  issues.push(...cycleIssues(linked.nodes));
  return {
    tokens,
    generated,
    order,
    baseSurface,
    issues,
    diagnostics: linked.diagnostics,
  };
}

function linkRestTokens(input: readonly AuthoredToken[]): {
  nodes: Node[];
  diagnostics: GraphDiagnostic[];
} {
  const nodes: Node[] = input.map((token, seq) => ({
    id: tokenId(token.group, token.name),
    group: token.group,
    name: token.name,
    generated: false,
    value: token.value,
    onPath: token.onPath,
    seq,
    backdrop: [],
  }));
  const diagnostics: GraphDiagnostic[] = [];
  const authored = nodes.filter((node) => !node.generated);

  const ensure = (spec: RestSpec, dependent: Node): Node => {
    const found = findRest(nodes, spec);
    if (found !== undefined) return found;
    const name = generatedName(spec);
    const node: Node = {
      id: tokenId(spec.group, name),
      group: spec.group,
      name,
      generated: true,
      value: withStates(dependent.value, spec.states),
      onPath: joinPath(joinPath(joinPath("tokens", spec.group), name), "on"),
      seq: nodes.length,
      backdrop: [],
    };
    nodes.push(node);
    const role = spec.states.length === 0 ? "rest token" : "prefix token";
    diagnostics.push({
      path: joinPath(joinPath("tokens", dependent.group), dependent.name),
      id: node.id,
      message: `Generated ${role} "${node.id}" for "${dependent.id}".`,
    });
    if (spec.states.length > 0) {
      const parent = ensure({ ...spec, states: spec.states.slice(0, -1) }, node);
      node.derivesFrom = parent.id;
    }
    return node;
  };

  for (const node of authored) {
    if (node.value.states.length === 0) continue;
    const parent = ensure(
      {
        group: node.group,
        kind: node.value.kind,
        scale: node.value.scale,
        states: node.value.states.slice(0, -1),
      },
      node,
    );
    node.derivesFrom = parent.id;
  }

  return { nodes, diagnostics };
}

interface RestSpec {
  group: string;
  kind: Kind;
  scale: number;
  states: CanonicalState[];
}

/**
 * Rest match (§4): same group, kind, and level, and exactly the prefix states.
 * An empty prefix prefers `DEFAULT` over another rest written earlier.
 */
function findRest(nodes: readonly Node[], spec: RestSpec): Node | undefined {
  const matches = nodes.filter(
    (node) =>
      node.group === spec.group &&
      node.value.kind === spec.kind &&
      node.value.scale === spec.scale &&
      sameStates(node.value.states, spec.states),
  );
  if (spec.states.length === 0) {
    const fallback = matches.find((node) => node.name === "DEFAULT" && !node.generated);
    if (fallback !== undefined) return fallback;
  }
  return matches[0];
}

function generatedName(spec: RestSpec): string {
  const stem = spec.states.length === 0 ? "rest" : spec.states.join("-");
  return `__${stem}_${spec.kind}_${spec.scale}`;
}

/**
 * Base surface.
 *
 * The first surface group's `DEFAULT` wins when that token is a surface.
 * Otherwise the surface whose scale is closest to 0 (the page). Otherwise
 * the page itself.
 */
function findBaseSurface(nodes: readonly Node[]): string {
  let firstSurfaceGroup: string | undefined;
  for (const node of nodes) {
    if (node.generated || node.value.kind !== "surface") continue;
    firstSurfaceGroup = node.group;
    break;
  }
  if (firstSurfaceGroup !== undefined) {
    const fallback = nodes.find(
      (node) =>
        !node.generated && node.group === firstSurfaceGroup && node.name === "DEFAULT",
    );
    if (fallback !== undefined && fallback.value.kind === "surface") {
      return fallback.id;
    }
  }
  let closest: Node | undefined;
  for (const node of nodes) {
    if (node.generated || node.value.kind !== "surface") continue;
    if (
      closest === undefined ||
      Math.abs(node.value.scale) < Math.abs(closest.value.scale)
    ) {
      closest = node;
    }
  }
  return closest?.id ?? PAGE;
}

function backdropOf(
  node: Node,
  baseSurface: string,
  nodes: readonly Node[],
  issues: ConfigIssue[],
): string[] {
  const target = resolveTarget(node, baseSurface, nodes, issues);
  if (target === undefined) return [];
  // A disabled token sits on the disabled state of its target when one exists.
  // Otherwise it keeps the target's ordinary set (§6.2).
  if (isDisabled(node.value.states) && target.kind === "token") {
    const disabled = disabledCounterpart(target.id, nodes);
    if (disabled !== undefined) return disabled;
  }
  if (target.kind === "page") return [PAGE];
  // Omitted `on` is one token (the base surface). Explicit `on` expands.
  if (!target.expand) return [target.id];
  return expandBackdrop(target.id, nodes);
}

type Target = { kind: "page" } | { kind: "token"; id: string; expand: boolean };

function resolveTarget(
  node: Node,
  baseSurface: string,
  nodes: readonly Node[],
  issues: ConfigIssue[],
): Target | undefined {
  const raw = node.value.on;
  if (raw === undefined) {
    if (node.value.kind === "surface") return { kind: "page" };
    if (baseSurface === PAGE) return { kind: "page" };
    return { kind: "token", id: baseSurface, expand: false };
  }

  if (!ON_RE.test(raw)) {
    const suggestion = suggestTarget(raw, nodes);
    issues.push(
      issue({
        path: node.onPath,
        message: `on ${JSON.stringify(raw)} must be a group or a group.token path.`,
        expected: '"group" or "group.token"',
        ...(suggestion === undefined
          ? { hint: "One backdrop string. A list is not allowed." }
          : {
              didYouMean: suggestion,
              hint: `Did you mean "${suggestion}"?`,
              fix: { path: node.onPath, replace: suggestion },
            }),
      }),
    );
    return undefined;
  }

  const dot = raw.indexOf(".");
  if (dot === -1) {
    if (!nodes.some((entry) => !entry.generated && entry.group === raw)) {
      issues.push(unknownBackdrop(node.onPath, raw, nodes));
      return undefined;
    }
    const fallback = nodes.find(
      (entry) => !entry.generated && entry.group === raw && entry.name === "DEFAULT",
    );
    if (fallback === undefined) {
      issues.push(
        issue({
          path: node.onPath,
          message: `on "${raw}" needs ${raw}.DEFAULT, and that token does not exist.`,
          expected: `${raw}.DEFAULT, or a group.token path`,
          hint: `Add a DEFAULT token in "${raw}", or point at a specific token.`,
        }),
      );
      return undefined;
    }
    if (fallback.id === node.id) issues.push(selfIssue(node));
    return { kind: "token", id: fallback.id, expand: true };
  }

  const group = raw.slice(0, dot);
  const name = raw.slice(dot + 1);
  const found = nodes.find(
    (entry) => !entry.generated && entry.group === group && entry.name === name,
  );
  if (found === undefined) {
    issues.push(unknownBackdrop(node.onPath, raw, nodes));
    return undefined;
  }
  if (found.id === node.id) issues.push(selfIssue(node));
  // A specific token is only itself. `on: "action"` (no dot) is what expands
  // to the other fills in the group.
  return { kind: "token", id: found.id, expand: false };
}

/**
 * `on: "group"` expands to every token in the group with the host's kind,
 * except tokens named `disabled` / `*-disabled`. Those stay a separate
 * backdrop (`on: "action.disabled"`). There is no implicit state link.
 */
function expandBackdrop(targetId: string, nodes: readonly Node[]): string[] {
  const host = nodes.find((node) => node.id === targetId);
  if (host === undefined) return [];
  const members: string[] = [];
  for (const node of nodes) {
    if (node.generated) continue;
    if (node.group !== host.group || node.value.kind !== host.value.kind) continue;
    if (
      node.id !== host.id &&
      (node.value.disabled === true ||
        isDisabled(node.value.states) ||
        isDisabledName(node.name))
    ) {
      continue;
    }
    members.push(node.id);
  }
  return members;
}

function disabledCounterpart(
  targetId: string,
  nodes: readonly Node[],
): string[] | undefined {
  const host = nodes.find((node) => node.id === targetId);
  if (host === undefined || isDisabled(host.value.states)) return undefined;
  const want = [...host.value.states, DISABLED_STATE];
  const found = nodes.find(
    (node) =>
      !node.generated &&
      node.group === host.group &&
      node.value.kind === host.value.kind &&
      node.value.scale === host.value.scale &&
      sameStates(node.value.states, want),
  );
  return found === undefined ? undefined : [found.id];
}

function isStateOf(candidate: Node, host: Node): boolean {
  if (candidate.group !== host.group) return false;
  if (candidate.value.kind !== host.value.kind) return false;
  if (candidate.value.scale !== host.value.scale) return false;
  const prefix = host.value.states;
  const states = candidate.value.states;
  if (states.length <= prefix.length) return false;
  return prefix.every((state, index) => states[index] === state);
}

/** Kahn, ties broken by config order (§6.3). */
function topologicalOrder(nodes: readonly Node[]): string[] {
  const seq = new Map(nodes.map((node) => [node.id, node.seq]));
  const deps = new Map(nodes.map((node) => [node.id, edgeIds(node, seq)]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const dependents = new Map<string, string[]>();
  for (const node of nodes) dependents.set(node.id, []);

  for (const node of nodes) {
    for (const dep of deps.get(node.id) ?? []) {
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      const list = dependents.get(dep);
      if (list !== undefined) list.push(node.id);
    }
  }

  const available: string[] = [];
  for (const node of nodes) {
    if ((indegree.get(node.id) ?? 0) === 0) available.push(node.id);
  }

  const order: string[] = [];
  while (available.length > 0) {
    let best = 0;
    for (let index = 1; index < available.length; index += 1) {
      const candidate = available[index];
      const winner = available[best];
      if (candidate === undefined || winner === undefined) continue;
      if ((seq.get(candidate) ?? 0) < (seq.get(winner) ?? 0)) best = index;
    }
    const next = available.splice(best, 1)[0];
    if (next === undefined) break;
    order.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const left = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, left);
      if (left === 0) available.push(dependent);
    }
  }

  for (const node of nodes) {
    if (!order.includes(node.id)) order.push(node.id);
  }
  return order;
}

/** Backdrop tokens first (config order), then the rest link. */
function edgeIds(node: Node, seq: ReadonlyMap<string, number>): string[] {
  const backdrop: string[] = [];
  for (const member of node.backdrop) {
    if (member === PAGE || member === node.id) continue;
    if (!seq.has(member)) continue;
    backdrop.push(member);
  }
  backdrop.sort((a, b) => (seq.get(a) ?? 0) - (seq.get(b) ?? 0));
  if (
    node.derivesFrom !== undefined &&
    node.derivesFrom !== node.id &&
    seq.has(node.derivesFrom) &&
    !backdrop.includes(node.derivesFrom)
  ) {
    backdrop.push(node.derivesFrom);
  }
  return backdrop;
}

function cycleIssues(nodes: readonly Node[]): ConfigIssue[] {
  const seq = new Map(nodes.map((node) => [node.id, node.seq]));
  const deps = new Map(nodes.map((node) => [node.id, edgeIds(node, seq)]));
  const color = new Map<string, "visiting" | "done">();
  const issues: ConfigIssue[] = [];
  const reported = new Set<string>();

  const visit = (id: string, stack: string[]): void => {
    const mark = color.get(id);
    if (mark === "done") return;
    if (mark === "visiting") {
      const start = stack.indexOf(id);
      if (start === -1) return;
      const cycle = [...stack.slice(start), id];
      const key = [...cycle.slice(0, -1)].sort().join("|");
      if (reported.has(key)) return;
      reported.add(key);
      const origin = nodes.find((node) => node.id === id);
      issues.push(
        issue({
          path: origin?.onPath ?? id,
          message: `Backdrop cycle: ${cycle.join(" → ")}.`,
          expected: "on edges that do not form a cycle",
          hint: "Point each on at a backdrop that does not come back to this token.",
        }),
      );
      return;
    }
    color.set(id, "visiting");
    for (const next of deps.get(id) ?? []) visit(next, [...stack, id]);
    color.set(id, "done");
  };

  for (const node of nodes) {
    if (!color.has(node.id)) visit(node.id, []);
  }
  return issues;
}

function unknownBackdrop(path: string, raw: string, nodes: readonly Node[]): ConfigIssue {
  const suggestion = suggestTarget(raw, nodes);
  return issue({
    path,
    message: `Unknown backdrop "${raw}".`,
    expected: 'a group or "group.token" in tokens',
    ...(suggestion === undefined
      ? { hint: "Backdrop targets are group names or group.token paths in this config." }
      : {
          didYouMean: suggestion,
          hint: `Did you mean "${suggestion}"?`,
          fix: { path, replace: suggestion },
        }),
  });
}

function selfIssue(node: Node): ConfigIssue {
  return issue({
    path: node.onPath,
    message: `Token "${node.id}" cannot use itself as a backdrop.`,
    expected: "a different group or group.token",
    hint: "Point on at the backdrop this token sits on, not at the token itself.",
  });
}

function suggestTarget(raw: string, nodes: readonly Node[]): string | undefined {
  const authored = nodes.filter((node) => !node.generated);
  const groups: string[] = [];
  for (const node of authored) {
    if (!groups.includes(node.group)) groups.push(node.group);
  }
  const dot = raw.indexOf(".");
  if (dot === -1) return suggestName(raw, groups);
  const group = raw.slice(0, dot);
  const name = raw.slice(dot + 1);
  const inGroup = authored.filter((node) => node.group === group);
  if (inGroup.length > 0) {
    const suggested = suggestName(
      name,
      inGroup.map((node) => node.name),
    );
    return suggested === undefined ? undefined : `${group}.${suggested}`;
  }
  const candidates: string[] = [];
  for (const groupName of groups) {
    candidates.push(groupName);
    for (const node of authored) {
      if (node.group === groupName) candidates.push(node.id);
    }
  }
  return suggestName(raw, candidates);
}

function withStates(
  source: NormalizedToken,
  states: readonly CanonicalState[],
): NormalizedToken {
  const token: NormalizedToken = {
    kind: source.kind,
    scale: source.scale,
    states: [...states],
  };
  copyOptions(token, source);
  return token;
}

function copyOptions(target: NormalizedToken, source: NormalizedToken): void {
  if (source.on !== undefined) target.on = source.on;
  if (source.chroma !== undefined) target.chroma = source.chroma;
  if (source.hue !== undefined) target.hue = source.hue;
  if (source.lc !== undefined) target.lc = source.lc;
  if (source.ratio !== undefined) target.ratio = source.ratio;
  if (source.nudge !== undefined) target.nudge = source.nudge;
}

function freeze(node: Node): ResolvedToken {
  const token: ResolvedToken = {
    id: node.id,
    group: node.group,
    name: node.name,
    generated: node.generated,
    value: node.value,
    backdrop: [...node.backdrop],
  };
  if (node.derivesFrom !== undefined) return { ...token, derivesFrom: node.derivesFrom };
  return token;
}

function tokenId(group: string, name: string): string {
  return `${group}.${name}`;
}

function sameStates(a: readonly CanonicalState[], b: readonly CanonicalState[]): boolean {
  return a.length === b.length && a.every((state, index) => state === b[index]);
}

function isDisabled(states: readonly CanonicalState[]): boolean {
  return states.includes(DISABLED_STATE);
}

function isDisabledName(name: string): boolean {
  return name === "disabled" || name.endsWith("-disabled");
}

function issue(fields: {
  path: string;
  message: string;
  expected?: string;
  hint?: string;
  didYouMean?: string;
  fix?: ConfigFix;
}): ConfigIssue {
  const result: ConfigIssue = { path: fields.path, message: fields.message };
  if (fields.expected !== undefined) result.expected = fields.expected;
  if (fields.hint !== undefined) result.hint = fields.hint;
  if (fields.didYouMean !== undefined) result.didYouMean = fields.didYouMean;
  if (fields.fix !== undefined) result.fix = fields.fix;
  return result;
}
