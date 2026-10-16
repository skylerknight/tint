import { CLIError, ENGINE_NOT_READY } from "./shared.js";
import type { IO } from "./ui.js";

export interface BuildFlags {
  config?: string | undefined;
  out?: string | undefined;
  formats?: string | undefined;
  tailwindTint?: boolean | undefined;
  quiet?: boolean | undefined;
}

/** Flag parsing still works. Generation waits on the v5 engine. */
export async function build(_io: IO, _flags: BuildFlags): Promise<number> {
  throw new CLIError(ENGINE_NOT_READY);
}
