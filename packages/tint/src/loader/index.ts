import type { Config } from "../config/types.js";

export interface LoadOptions {
  /** Directory config paths resolve against (default `process.cwd()`). */
  root?: string;
  configPath: string;
}

export interface LoadedConfig {
  configs: Config[];
  /** Absolute path of the config file. */
  path: string;
  /** Absolute paths of every file bundled into the config (including itself). */
  dependencies: string[];
}

export async function loadConfig(options: LoadOptions): Promise<LoadedConfig> {
  void options;
  throw new Error("not implemented");
}
