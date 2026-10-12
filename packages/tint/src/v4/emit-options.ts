/**
 * Apply `config.output` to the CSS and Tailwind formatters.
 *
 * An explicit `format` or `prefix` already on `options` wins. DTCG and flat
 * names ignore `prefix`; callers that write those files should not pass it.
 */

import type { TailwindOptions } from "./output/tailwind.js";
import type { OutputOptions } from "./types.js";

export function withConfigOutput(
  options: TailwindOptions,
  output: OutputOptions | undefined,
): TailwindOptions {
  if (output === undefined) return options;
  let next = options;
  if (next.format === undefined && output.format !== undefined) {
    next = { ...next, format: output.format };
  }
  if (blank(next.prefix) && output.prefix !== undefined && output.prefix !== "") {
    next = { ...next, prefix: output.prefix };
  }
  return next;
}

function blank(prefix: string | undefined): boolean {
  return prefix === undefined || prefix === "";
}
