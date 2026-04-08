export interface GitAction {
  pre(): Promise<void>;

  main(): Promise<void>;

  post(): Promise<void>;
}

/**
 * A repository snapshot is a map of ref names to their commit SHAs.
 * Includes tags, notes, heads, and any other refs.
 */
export type RepoSnapshot = Record<string, string>;