import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tintCacheDir } from "../loader/index.js";

const INTELLISENSE_FILE = "intellisense.css";
const CACHE_DIR = "cache";

/** `<root>/node_modules/.tint/cache/<md5 of absolute config path>.css` */
export function cachePath(root: string, configPath: string): string {
  const hash = createHash("md5").update(configPath).digest("hex");
  return join(tintCacheDir(root), CACHE_DIR, `${hash}.css`);
}

/** `<root>/node_modules/.tint/intellisense.css` */
export function intellisensePath(root: string): string {
  return join(tintCacheDir(root), INTELLISENSE_FILE);
}

/** Write a file, creating parent directories; failures are swallowed. */
export function writeQuietly(path: string, contents: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  } catch {
    // Cache and IntelliSense files are best-effort (read-only FS, permissions…).
  }
}

/** Read a file as UTF-8, or null when it does not exist or cannot be read. */
export function readQuietly(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
