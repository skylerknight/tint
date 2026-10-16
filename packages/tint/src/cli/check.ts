import { CLIError, ENGINE_NOT_READY } from "./shared.js";
import type { IO } from "./ui.js";

export interface CheckFlags {
  config?: string | undefined;
  strict?: boolean | undefined;
}

/** Flag parsing still works. Generation waits on the v5 engine. */
export async function check(_io: IO, _flags: CheckFlags): Promise<number> {
  throw new CLIError(ENGINE_NOT_READY);
}
