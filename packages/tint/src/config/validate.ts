import type { Config } from "./types.js";

export interface Issue {
  /** Dotted location, e.g. `tokens.text.heading.$on`. */
  path: string;
  message: string;
  hint?: string;
}

export class ConfigError extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[], prefix = "Invalid tint config") {
    const lines = issues.map(
      (i) =>
        `  - ${i.path ? `${i.path}: ` : ""}${i.message}${i.hint ? ` (${i.hint})` : ""}`,
    );
    super(`${prefix}:\n${lines.join("\n")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

export type ValidationResult =
  { ok: true; config: Config } | { ok: false; issues: Issue[] };

export function validateConfig(input: unknown): ValidationResult {
  void input;
  throw new Error("not implemented");
}

export function assertConfig(input: unknown): Config {
  const result = validateConfig(input);
  if (!result.ok) throw new ConfigError(result.issues);
  return result.config;
}
