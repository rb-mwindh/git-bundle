import fs from 'node:fs';
import {GithubApi} from './github-api.js';
import {
  DEFAULT_TRACKED_REFS,
  type FetchRefsResult,
  GitApi,
} from './git-api.js';
import {type FetchResult} from 'simple-git';
import {RepoSnapshot} from "./types.js";

export class GitBundleApi {
  readonly githubApi: GithubApi;
  private readonly gitApi: GitApi;

  constructor(repoPath: string, githubApi: GithubApi) {
    this.githubApi = githubApi;
    this.gitApi = new GitApi(repoPath);
  }

  async ensureGitRepository(): Promise<void> {
    this.githubApi.info('Checking if current working directory is a Git repository...');
    const isRepo = await this.gitApi.checkIsRepo();

    if (!isRepo) {
      throw new Error('Git repository not found. Run actions/checkout before git-bundle.');
    }

    this.githubApi.info('Git repository found.');
  }

  async fetchTrackedRefs(trackedRefs: string[] = DEFAULT_TRACKED_REFS): Promise<FetchRefsResult> {
    const fetchRefSpecs = this.gitApi.buildFetchRefSpecs(trackedRefs);
    const wasShallow = await this.gitApi.isShallowRepository();

    if (!wasShallow) {
      const fetchResult = await this.gitApi.fetch(fetchRefSpecs);
      return {wasShallow: false, fetchResult};
    }

    try {
      const fetchResult = await this.gitApi.fetchUnshallow(fetchRefSpecs);
      return {wasShallow: true, fetchResult};
    } catch (error) {
      const unshallowError = error instanceof Error ? error.message : String(error);
      const fetchResult = await this.gitApi.fetch(fetchRefSpecs);
      return {wasShallow: true, unshallowError, fetchResult};
    }
  }

  formatFetchResult(result: FetchResult): string {
    const rawOutput = result.raw?.trim();
    if (rawOutput) {
      return rawOutput;
    }

    const updatedCount = Array.isArray(result.updated) ? result.updated.length : 0;
    const deletedCount = Array.isArray(result.deleted) ? result.deleted.length : 0;
    return `(remote=${result.remote || 'unknown'}, updated=${updatedCount}, deleted=${deletedCount}).`;
  }

  getTransportRef(bundleName: string): string {
    return `refs/heads/${bundleName}`;
  }

  async importBundle(bundlePath: string, bundleName: string): Promise<void> {
    const transportRef = this.getTransportRef(bundleName);
    const contextRef = this.githubApi.getContextRef();

    const stats = fs.statSync(bundlePath, {throwIfNoEntry: false});
    this.githubApi.info(`Inspecting Git bundle at "${bundlePath}": isFile: ${stats?.isFile() || false}, size: ${stats?.size || 0} bytes.`)

    const bundleRefs = await this.gitApi.listBundleRefs(bundlePath);

    if (bundleRefs.length === 0) {
      this.githubApi.notice(`No valid refs found in artifact "${bundleName}". Import is skipped.`);
      return;
    }

    this.githubApi.info(`Importing refs from bundle "${bundlePath}: \n * ${bundleRefs.join('\n * ')}`);
    try {
      const fetchRefSpecs = this.gitApi.buildFetchRefSpecs(bundleRefs);
      const fetchResult = await this.gitApi.fetch(fetchRefSpecs, bundlePath);
      this.githubApi.info(`Git bundle "${bundlePath}" imported successfully.\n${this.formatFetchResult(fetchResult)}`);
    } catch (err) {
      throw new Error(`Failed to import Git bundle "${bundlePath}": ${String(err)}`);
    }

    this.githubApi.info('Printing all refs for debugging purposes...');
    this.githubApi.info(await this.gitApi.showRef());
    this.githubApi.info('Done.');

    const checkoutCandidates = [...new Set([contextRef, transportRef])].filter(Boolean);

    for (const candidate of checkoutCandidates) {
      const resolved = await this.gitApi.resolveRef(candidate);
      if (!resolved) {
        continue;
      }

      this.githubApi.info(`Checkout ref "${candidate}" resolved to SHA ${resolved}. Checking out...`);

      try {
        if (candidate.startsWith('refs/heads/')) {
          await this.gitApi.checkout(candidate.slice('refs/heads/'.length));
        } else if (candidate.startsWith('refs/tags/')) {
          await this.gitApi.checkout(candidate);
        } else {
          await this.gitApi.checkout(resolved);
        }
      } catch (err) {
        throw new Error(
          `Checkout candidate "${candidate}" could not be checked out after importing bundle "${bundlePath}".\n` +
          `${String(err)}`
        );
      }

      this.githubApi.info(`Checked out transport ref "${candidate}". Repository state is now based on the imported bundle.`);
      return;
    }

    throw new Error(
      `Neither context ref "${contextRef}" nor transport ref "${transportRef}" could be resolved after importing bundle "${bundlePath}". ` +
      `Bundle contains refs: [${bundleRefs.join(', ')}].`
    );
  }

  async createSnapshot(trackedRefs: string[]): Promise<RepoSnapshot> {
    return this.gitApi.createSnapshot(trackedRefs);
  }

  diffSnapshots(previousSnapshot: RepoSnapshot, currentSnapshot: RepoSnapshot): string[] {
    const changed = new Set<string>();

    for (const [ref, sha] of Object.entries(currentSnapshot)) {
      if (previousSnapshot[ref] !== sha) {
        changed.add(ref);
      }
    }

    return [...changed];
  }

  async getHeadSha(): Promise<string> {
    return this.gitApi.getHeadSha();
  }

  async updateRef(ref: string, sha: string): Promise<void> {
    this.githubApi.info(`Updating Git ref "${ref}" to point to SHA ${sha}...`);
    try {
      const result = await this.gitApi.updateRef(ref, sha);
      this.githubApi.info(result);
    } catch (error) {
      throw new Error(`Failed to update Git ref "${ref}" to SHA ${sha}. ${String(error)}`);
    }
  }

  async getCommitCountSince(baseSha: string, targetRef: string): Promise<number> {
    return this.gitApi.getCommitCountSince(baseSha, targetRef);
  }

  async buildRevisionSpecs(
    githubSha: string,
    transportRef: string,
    changedRefs: string[],
  ): Promise<string[]> {

    const commitCount = await this.gitApi.getCommitCountSince(githubSha, transportRef);

    if (commitCount === 0 && changedRefs.length === 0) {
      return [];
    }

    const specs: string[] = [];

    if (commitCount > 0) {
      specs.push(`${githubSha}..${transportRef}`);
    }

    specs.push(transportRef);
    specs.push(...changedRefs);

    return [...new Set(specs.filter(Boolean))];
  }

  async createBundle(bundlePath: string, revisionSpecs: string[]): Promise<boolean> {

    this.githubApi.info(`Creating Git bundle at "${bundlePath}" with revision specs: ${JSON.stringify(revisionSpecs)}`);

    if (revisionSpecs.length === 0) {
      return false;
    }

    try {
      const result = await this.gitApi.createBundle(bundlePath, revisionSpecs);
      this.githubApi.debug(JSON.stringify(result));

      const stat = fs.statSync(bundlePath, { throwIfNoEntry: false }) || ({ size: 0 });
      this.githubApi.info(`Git bundle size: ${stat.size} bytes`);

      return stat.size > 0;
    } catch (error) {
      this.githubApi.debug(String(error));
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('Refusing to create empty bundle') ||
        message.includes('no new commits') ||
        message.includes('no new revisions')
      ) {
        return false;
      }
      throw error;
    }
  }

  saveSnapshot(snapshot: RepoSnapshot): void {
    this.githubApi.saveState('git-bundle-snapshot', JSON.stringify(snapshot));
  }

  readSavedSnapshot(): RepoSnapshot {
    const raw = this.githubApi.getState('git-bundle-snapshot');
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw) as RepoSnapshot;
    } catch {
      this.githubApi.warning('Snapshot state is invalid JSON. Using empty baseline for diff.');
      return {};
    }
  }
}

