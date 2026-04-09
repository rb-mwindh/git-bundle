import * as os from 'node:os';
import * as path from 'node:path';
import {formatDate} from './format-date.js';
import {formatFileSize} from './format-file-size.js';
import {GithubApi} from './github-api.js';
import {DEFAULT_TRACKED_REFS} from './git-api.js';
import {GitBundleApi} from './git-bundle-api.js';
import {GitAction} from "./types.js";

export class GitBundleAction implements GitAction {
  constructor(private readonly githubApi: GithubApi = new GithubApi()) {}

  async pre(): Promise<void> {
    // No operation required.
  }

  async main(): Promise<void> {
    const {bundleName, trackedRefs, repoPath, tempDir} = this.readContext();
    const bundleApi = new GitBundleApi(repoPath, this.githubApi);
    await bundleApi.ensureGitRepository();

    this.githubApi.info('Checking if the Git repository has complete history...');
    const fetchRefsResult = await bundleApi.fetchTrackedRefs(trackedRefs);

    if (fetchRefsResult.wasShallow) {
      if (fetchRefsResult.unshallowError) {
        this.githubApi.warning(
          `Full history fetch failed: ${fetchRefsResult.unshallowError}. Repository may remain shallow.`
        );
      } else {
        this.githubApi.info('Repository is shallow - fetching full history and tags...');
      }
      this.githubApi.info(
        `Fetched full history and refs: ${bundleApi.formatFetchResult(fetchRefsResult.fetchResult)}`
      );
    } else {
      this.githubApi.info('Repository is already fully fetched.');
      this.githubApi.info('Fetching all tags to ensure tag refs are up to date.');
      this.githubApi.info(
        `Fetched tag refs: ${bundleApi.formatFetchResult(fetchRefsResult.fetchResult)}`
      );
    }

    this.githubApi.info(`Checking for existing artifact bundle "${bundleName}"...`);
    const artifact = await this.githubApi.getArtifact(bundleName);

    if (!artifact) {
      this.githubApi.notice(
        `No previous artifact named "${bundleName}" found. This is expected in the first job.`
      );
    } else {
      const createdAt = artifact.createdAt ? formatDate(artifact.createdAt) : 'unknown';

      this.githubApi.info(
        `Artifact "${artifact.name}" found ` +
        `(id=${artifact.id},` +
        ` size=${formatFileSize(artifact.size)},` +
        ` createdAt=${createdAt},` +
        ` digest=${artifact.digest}).` +
        ` Downloading...`
      );

      const bundlePath = await this.githubApi.downloadArtifact(artifact, tempDir);
      this.githubApi.info(`Downloaded artifact to ${bundlePath}.`);

      await bundleApi.importBundle(bundlePath, bundleName);
    }

    const snapshot = await bundleApi.createSnapshot(trackedRefs);
    bundleApi.saveSnapshot(snapshot);
  }

  async post(): Promise<void> {
    const {bundleName, trackedRefs, repoPath, tempDir} = this.readContext();
    const bundleApi = new GitBundleApi(repoPath, this.githubApi);
    await bundleApi.ensureGitRepository();

    const githubSha = this.githubApi.getContextSha();
    const previousSnapshot = bundleApi.readSavedSnapshot();
    const currentSnapshot = await bundleApi.createSnapshot(trackedRefs);
    const changedRefs = bundleApi.diffSnapshots(previousSnapshot, currentSnapshot);

    const headSha = await bundleApi.getHeadSha();
    const transportRef = bundleApi.getTransportRef(bundleName);
    await bundleApi.updateRef(transportRef, headSha);
    const commitCount = await bundleApi.getCommitCountSince(githubSha, transportRef);

    const revisionSpecs = bundleApi.buildRevisionSpecs({
      githubSha,
      transportRef,
      changedRefs,
      commitCount,
    });

    this.githubApi.debug(
      `Bundle revision specs (count=${revisionSpecs.length}): ${revisionSpecs.join(', ') || '(empty)'}`
    );

    const bundlePath = path.join(tempDir, bundleName);
    const bundleResult = await bundleApi.createBundle(bundlePath, revisionSpecs);

    if (!bundleResult.created) {
      this.githubApi.notice(
        `No new bundle content for "${bundleName}". Artifact upload is skipped by design.`
      );
      return;
    }

    try {
      await this.githubApi.deleteArtifact(bundleName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('not found')) {
        this.githubApi.warning(
          `Upload step: failed to delete existing artifact "${bundleName}": ${message}`
        );
      }
    }

    await this.githubApi.uploadArtifact(bundleName, [bundleResult.bundlePath], tempDir);
  }

  private readContext() {
    const bundleName = this.githubApi.getInput('bundle', {required: false}) || 'release';
    const repoPathInput = this.githubApi.getInput('path', {required: false});
    const tempDirInput = this.githubApi.getInput('tempDir', {required: false});
    const trackedRefsInput = this.githubApi.getInput('refs', {required: false});

    const trackedRefs = trackedRefsInput
      .split(',')
      .map(ref => ref.trim())
      .filter(Boolean);

    const repoPath = repoPathInput || process.env['GITHUB_WORKSPACE']?.trim() || process.cwd();
    const tempDir = tempDirInput || process.env['RUNNER_TEMP']?.trim() || os.tmpdir();

    return {
      bundleName,
      repoPath,
      tempDir,
      trackedRefs: trackedRefs.length > 0 ? trackedRefs : DEFAULT_TRACKED_REFS,
    };
  }
}
