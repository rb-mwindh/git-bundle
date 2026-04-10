import {type FetchResult, type SimpleGit, simpleGit} from 'simple-git';
import * as fs from 'node:fs/promises';
import {RepoSnapshot} from "./types.js";

export const DEFAULT_TRACKED_REFS = ['refs/tags/*', 'refs/notes/*'];

export interface FetchRefsResult {
  wasShallow: boolean;
  // unshallowFailed: boolean;
  unshallowError?: string;
  fetchResult: FetchResult;
}

export interface ImportBundleResult {
  bundleRefs: string[];
  skipped: boolean;
  fetchRaw?: string;
  transportedHead?: string;
}

export interface CreateBundleResult {
  created: boolean;
  bundlePath: string;
}

export type GitClient = Pick<SimpleGit,
  | 'checkIsRepo'
  | 'revparse'
  | 'fetch'
  | 'raw'
  | 'checkout'
>;

/**
 * Encapsulates all Git API operations with internal SimpleGit instance management.
 * Constructor accepts either a repository path (string) or a SimpleGit-compatible client.
 */
export class GitApi {
  private readonly git: GitClient;

  constructor(repoPathOrClient: string | GitClient) {
    this.git = typeof repoPathOrClient === 'string'
      ? simpleGit(repoPathOrClient)
      : repoPathOrClient;
  }

  /**
   * Returns true if the working directory is inside a Git repository.
   */
  async checkIsRepo(): Promise<boolean> {
    return this.git.checkIsRepo();
  }

  /**
   * Returns true when the repository is shallow.
   */
  async isShallowRepository(): Promise<boolean> {
    const shallowValue = (await this.git.revparse(['--is-shallow-repository'])).trim();
    return shallowValue === 'true';
  }

  /**
   * Converts tracked refs into force-fetch refspecs.
   */
  buildFetchRefSpecs(trackedRefs: string[] = DEFAULT_TRACKED_REFS): string[] {
    return trackedRefs.map(ref => `+${ref}:${ref}`);
  }

  /**
   * Performs a regular force-fetch from origin.
   */
  async fetch(fetchRefSpecs: string[] = [], origin = 'origin'): Promise<FetchResult> {
    return this.git.fetch(['--force', origin, ...fetchRefSpecs]);
  }

  /**
   * Performs an unshallow force-fetch from origin.
   */
  async fetchUnshallow(fetchRefSpecs: string[] = []): Promise<FetchResult> {
    return this.git.fetch(['--force', '--unshallow', 'origin', ...fetchRefSpecs]);
  }


  async checkout(sha: string) {
    return this.git.checkout(['--force', sha]);
  }

  /**
   * Creates a snapshot of all current refs matching the given prefixes as a flat ref→sha map.
   */
  async createSnapshot(trackedRefs: string[] = DEFAULT_TRACKED_REFS): Promise<RepoSnapshot> {
    const refs: Record<string, string> = {};

    try {
      const output = await this.git.raw([
        'for-each-ref',
        '--format=%(objectname) %(refname)',
        ...trackedRefs,
      ]);

      for (const line of output.split('\n').map(l => l.trim()).filter(Boolean)) {
        const [sha, ref] = line.split(/\s+/, 2);
        if (sha && ref) {
          refs[ref] = sha;
        }
      }
    } catch {
      // Missing namespaces are fine.
    }

    return refs;
  }

  /**
   * Returns the SHA of the current HEAD commit.
   */
  async getHeadSha(): Promise<string> {
    return (await this.git.revparse(['HEAD'])).trim();
  }

  /**
   * Updates a Git ref to point to the given commit SHA.
   */
  async updateRef(ref: string, sha: string) {
    return this.git.raw(['update-ref', ref, sha]);
  }

  /**
   * Returns the number of commits reachable from targetRef but not from baseSha.
   * Returns 0 if the range cannot be computed.
   */
  async getCommitCountSince(baseSha: string, targetRef: string): Promise<number> {
    try {
      const output = await this.git.raw(['rev-list', '--count', `${baseSha}..${targetRef}`]);
      return Number.parseInt(output.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Creates a Git bundle at the given path from the provided revision specs.
   * Returns created=false if specs are empty or git reports no new content.
   */
  async createBundle(bundlePath: string, revisionSpecs: string[]) {
    try {
      const result = await this.git.raw(['bundle', 'create', bundlePath, ...revisionSpecs]);
      return { result };
    } catch (error) {
      return { error }
    }
  }

  /**
   * Lists all refs contained in a Git bundle file.
   */
  async listBundleRefs(bundlePath: string): Promise<string[]> {
    try {
      const output = await this.git.raw(['bundle', 'list-heads', bundlePath]);
      const refs = this.parseBundleRefs(output);
      return refs;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to list refs in bundle "${bundlePath}". ${message}`);
    }
  }

  /**
   * Extracts fully qualified refs (refs/**) from git bundle list-heads output.
   * Filters out short refs like HEAD that don't start with 'refs/'.
   */
  private parseBundleRefs(output: string): string[] {
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .flatMap(line => {
        const ref = line.split(/\s+/)[1];
        return ref && ref.startsWith('refs/') ? [ref] : [];
      });
  }

  /**
   * Resolves a ref to its commit SHA, returning null if the ref cannot be resolved.
   */
  async resolveRef(ref: string): Promise<string | null> {
    try {
      return (await this.git.revparse(['--verify', ref])).trim();
    } catch {
      return null;
    }
  }
}

