/** A user-facing failure: printed as a single friendly message, never a stack trace. */
export class CLIError extends Error {
  override readonly name = "CLIError";
}

export function toCLIError(error: unknown): CLIError {
  if (error instanceof CLIError) return error;
  if (error instanceof Error) return new CLIError(error.message);
  return new CLIError(String(error));
}

/** Shown by commands that need the v5 solver, which is not implemented yet. */
export const ENGINE_NOT_READY =
  "tint cannot generate tokens yet. The v5 engine is in progress; see docs/v5-milestone-1.md.";
