/**
 * Repair-style config errors (docs/v4-spec.md §7.1).
 *
 * Every issue has a dotted `path` and a `message`. `expected`, `hint`, and
 * `didYouMean` are set when the repair is known. `fix` is a machine-readable
 * edit, present only when the replacement is obvious.
 */

/** A single obvious edit. `replace` is the new value at `path`. */
export interface ConfigFix {
  path: string;
  replace?: unknown;
}

/**
 * One problem found while validating a v4 config.
 *
 * `code` is stable for issues the spec names (`name-conflict`) and for a
 * v3-shaped key (`v3-config`). Other issues leave it unset.
 */
export interface ConfigIssue {
  /** Dotted location, e.g. `tokens.row.selected`. Empty at the config root. */
  path: string;
  message: string;
  /** What the value should have been, when that is a shape or a list. */
  expected?: string;
  /** How to repair it. */
  hint?: string;
  /** Closest legal spelling. */
  didYouMean?: string;
  /** Machine-readable edit, when the repair is obvious. */
  fix?: ConfigFix;
  code?: "name-conflict" | "v3-config";
}

/**
 * Pretty-print issues in the §7.1 shape.
 *
 * A state confused with a level prints as:
 *
 * ```
 * ✖ tokens.row.selected: level "selcted" is not a surface level.
 *     Did you mean "selected"? That's a state: surface({ state: 'selected' })
 *     Valid levels: sunken, flat, base, raised, floating (or 1–5)
 *     fix: { "path": "tokens.row.selected", "replace": { "kind": "surface", "state": "selected" } }
 * ```
 */
export function formatConfigIssues(issues: readonly ConfigIssue[]): string {
  return issues.map(formatConfigIssue).join("\n");
}

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[], prefix?: string) {
    const body = formatConfigIssues(issues);
    super(prefix === undefined ? body : `${prefix}\n${body}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

function formatConfigIssue(issue: ConfigIssue): string {
  const head =
    issue.path === "" ? `✖ ${issue.message}` : `✖ ${issue.path}: ${issue.message}`;
  const lines = [head];
  if (issue.hint !== undefined) lines.push(`    ${issue.hint}`);
  else if (
    issue.didYouMean !== undefined &&
    !issue.message.includes(`"${issue.didYouMean}"`)
  ) {
    lines.push(`    Did you mean "${issue.didYouMean}"?`);
  }
  if (issue.expected !== undefined) lines.push(`    ${issue.expected}`);
  if (issue.fix !== undefined) lines.push(`    fix: ${formatFix(issue.fix)}`);
  return lines.join("\n");
}

/**
 * One-line JSON with a space after `{`, `:`, and `,`, and before `}`.
 * That is the §7.1 fix line.
 */
function formatFix(fix: ConfigFix): string {
  return JSON.stringify(fix)
    .replaceAll('":', '": ')
    .replaceAll(',"', ', "')
    .replaceAll("{", "{ ")
    .replaceAll("}", " }");
}
