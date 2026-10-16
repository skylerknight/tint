/**
 * v5 engine entry.
 *
 * The solver is not implemented yet. Later tasks replace this placeholder.
 * See docs/v5-milestone-1.md.
 *
 * Sibling modules in this folder (`generate.ts`, `types.ts`, `diagnostics.ts`)
 * are the v3 solver. The CSS and Tailwind emitters still read those types.
 */

/** Placeholder result until the v5 solver exists. */
export interface EngineResult {
  readonly version: 5;
}

/**
 * Placeholder generator. Returns an empty v5 result and does not solve colors.
 */
export function generate(): EngineResult {
  return { version: 5 };
}
