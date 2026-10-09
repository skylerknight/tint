import { countTokens, loadAndGenerate, printDiagnostics } from "./shared.js";
import { paint, plural, type IO } from "./ui.js";

export interface CheckFlags {
  config?: string | undefined;
  strict?: boolean | undefined;
}

export async function check(io: IO, flags: CheckFlags): Promise<number> {
  const { results } = await loadAndGenerate(io, flags.config);
  const warnings = printDiagnostics(io, results);
  const counts = `${plural(results.length, "theme")}, ${plural(countTokens(results), "token")}`;

  if (warnings === 0) {
    io.out(`${paint.green(io.color)("✓")} ${counts}, no warnings`);
    return 0;
  }

  io.out(`${paint.yellow(io.color)("⚠")} ${counts}, ${plural(warnings, "warning")}`);
  if (flags.strict) {
    io.err(`Failing because --strict was given and there are warnings.`);
    return 1;
  }
  return 0;
}
