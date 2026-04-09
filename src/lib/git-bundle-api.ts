import {GithubApi} from './github-api.js';
import {
  DEFAULT_TRACKED_REFS,
  type FetchRefsResult,
  GitApi,
  type ImportBundleResult,
  type CreateBundleResult,
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
    this.githubApi.info('Fetching Git bundle refs...');

    const transportRef = this.getTransportRef(bundleName);
    const bundleRefs = await this.gitApi.listBundleRefs(bundlePath);

    if (bundleRefs.length === 0) {
      this.githubApi.notice(`No valid refs found in artifact "${bundleName}". Import is skipped.`);
      return;
    }

    this.githubApi.debug(`Importing refs from bundle "${bundlePath}: \n * ${bundleRefs.join('\n * ')}`);
    try {
      const fetchResult = await this.gitApi.fetch([bundlePath, ...bundleRefs]);
      this.githubApi.info(`Git bundle "${bundlePath}" imported successfully.\n${this.formatFetchResult(fetchResult)}`);
    } catch (err) {
      throw new Error(`Failed to import Git bundle "${bundlePath}": ${String(err)}`);
    }

    this.githubApi.info(`Resolving transport ref "${transportRef}"...`);
    const transportedHead = await this.gitApi.resolveRef(transportRef);

    if (!transportedHead) {
      throw new Error(
        `Required ref "${transportRef}" could not be resolved after importing bundle "${bundlePath}". ` +
        `Bundle contains refs: [${bundleRefs.join(', ')}]. ` +
        `Ensure the bundle was created with the transport ref included in the revision specs.`
      );
    }

    this.githubApi.info(`Transport ref "${transportRef}" resolved to SHA ${transportedHead}. Checking out...`);
    try {
      await this.gitApi.checkout(transportedHead);
    } catch (error) {
      throw new Error(`Transport ref "${transportRef}" could not be checked out after importing bundle "${bundlePath}". ${String(error)}`);
    }

    this.githubApi.info(`Checked out transport ref "${transportRef}". Repository state is now based on the imported bundle.`);
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
    await this.gitApi.updateRef(ref, sha);
  }

  async getCommitCountSince(baseSha: string, targetRef: string): Promise<number> {
    return this.gitApi.getCommitCountSince(baseSha, targetRef);
  }

  buildRevisionSpecs(input: {
    githubSha: string;
    transportRef: string;
    changedRefs: string[];
    commitCount: number;
  }): string[] {
    if (input.commitCount === 0 && input.changedRefs.length === 0) {
      return [];
    }

    const specs: string[] = [];

    if (input.commitCount > 0) {
      specs.push(`${input.githubSha}..${input.transportRef}`);
    }

    specs.push(input.transportRef);
    specs.push(...input.changedRefs);

    return [...new Set(specs.filter(Boolean))];
  }

  async createBundle(bundlePath: string, revisionSpecs: string[]): Promise<CreateBundleResult> {
    return this.gitApi.createBundle(bundlePath, revisionSpecs);
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

