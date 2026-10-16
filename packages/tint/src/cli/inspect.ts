import { CLIError, ENGINE_NOT_READY } from "./shared.js";
import type { IO } from "./ui.js";

export interface InspectFlags {
  config?: string | undefined;
  palette?: string | undefined;
  theme?: string | undefined;
  json?: boolean | undefined;
}

/** Flag parsing still works. Generation waits on the v5 engine. */
export async function inspect(_io: IO, _flags: InspectFlags): Promise<number> {
  throw new CLIError(ENGINE_NOT_READY);
}
