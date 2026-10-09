/** Token group names that collide with Tailwind utility prefixes. */
export const TAILWIND_UTILITY_PREFIXES: Record<string, string> = {
  text: "text",
  bg: "bg",
  background: "bg",
  border: "border",
  outline: "outline",
  ring: "ring",
  accent: "accent",
  caret: "caret",
  fill: "fill",
  stroke: "stroke",
  decoration: "decoration",
  divide: "divide",
  placeholder: "placeholder",
  shadow: "shadow",
};

/** `DEFAULT` becomes an empty segment; everything else is unchanged. */
export function variantSegment(name: string): string {
  return name === "DEFAULT" ? "" : name;
}

/** `--` + non-empty parts joined by `-`. */
export function cssVar(...parts: string[]): string {
  return "--" + parts.filter(Boolean).join("-");
}

export function tokenVarName(palette: string, group: string, variant: string): string {
  return cssVar(palette, group, variantSegment(variant));
}

export function simplifyTailwindParts(
  palette: string,
  group: string,
  variant: string,
): string[] {
  const segment = variantSegment(variant);
  const redundant = Object.hasOwn(TAILWIND_UTILITY_PREFIXES, group.toLowerCase());
  if (redundant && segment) return [palette, segment];
  if (redundant && !segment) return [palette, group];
  return [palette, group, segment].filter(Boolean);
}
