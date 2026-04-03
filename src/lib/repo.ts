import * as core from '@actions/core';
import artifact from '@actions/artifact';
import * as github from '@actions/github';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {simpleGit, type SimpleGit} from 'simple-git';

type RefMap = Record<string, string>;

interface RepoSnapshot {
  tags: RefMap;
  notes: RefMap;
}

export class Repo {
  private readonly git: SimpleGit;
  private readonly cwd: string;
  private readonly runnerTempDir: string;

  private readonly stateKeys = {
    githubSha: 'git-bundle-github-sha',
    snapshot: 'git-bundle-snapshot',
  } as const;

  constructor(workspaceDir = Repo.resolveWorkspaceDir(), runnerTempDir = Repo.resolveRunnerTempDir()) {
    this.cwd = workspaceDir;
    this.runnerTempDir = runnerTempDir;
    this.git = simpleGit(this.cwd);
  }

  private static resolveWorkspaceDir(): string {
    const githubWorkspace = process.env['GITHUB_WORKSPACE']?.trim();
    if (githubWorkspace) {
      return path.resolve(githubWorkspace);
    }

    return process.cwd();
  }

  private static resolveRunnerTempDir(): string {
    const runnerTemp = process.env['RUNNER_TEMP']?.trim();
    if (runnerTemp) {
      return path.resolve(runnerTemp);
    }

    return os.tmpdir();
  }

  async pre(bundleName: string): Promise<void> {
    await this.ensureRepository();
    await this.ensureDeepFetched();
    await this.downloadAndImportBundleIfPresent(bundleName);

    const snapshot = await this.createSnapshot();
    core.saveState(this.stateKeys.snapshot, JSON.stringify(snapshot));
    core.saveState(this.stateKeys.githubSha, github.context.sha);

    core.info(
      `Saved PRE snapshot with ${Object.keys(snapshot.tags).length} tag refs and ${Object.keys(snapshot.notes).length} note refs.`
    );
  }

  async noop(bundleName: string): Promise<void> {
    core.debug(`Main phase is a no-op for bundle "${bundleName}".`);
  }

  async post(bundleName: string): Promise<void> {
    await this.ensureRepository();

    const githubSha = core.getState(this.stateKeys.githubSha) || github.context.sha;
    const previousSnapshot = this.readSavedSnapshot();
    const currentSnapshot = await this.createSnapshot();
    const changedRefs = this.diffSnapshots(previousSnapshot, currentSnapshot);
    const headSha = await this.getHeadSha();
    const transportRef = this.getTransportRef(bundleName);

    await this.updateRef(transportRef, headSha);

    const commitCount = await this.getCommitCountSince(githubSha, transportRef);
    const outputDir = this.runnerTempDir;
    const bundlePath = path.join(outputDir, `${bundleName}.bundle`);

    const revisionSpecs = this.buildRevisionSpecs({
      githubSha,
      transportRef,
      changedRefs,
      commitCount,
    });

    const bundleCreated = await this.tryCreateBundle(bundlePath, revisionSpecs);

    if (bundleCreated) {
      await this.uploadArtifact(bundleName, [bundlePath], outputDir);
    } else {
      core.notice(`No new bundle content for "${bundleName}". Artifact upload is skipped.`);
    }

    core.info(
      `POST completed. commitsSinceContextSha=${commitCount}, changedRefs=${changedRefs.length}, bundleCreated=${bundleCreated}`
    );
  }

  private async ensureRepository(): Promise<void> {
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      throw new Error('Git repository not found. Run actions/checkout before git-bundle.');
    }
  }

  private async ensureDeepFetched(): Promise<void> {
    const isShallow = (await this.git.revparse(['--is-shallow-repository'])).trim() === 'true';

    if (!isShallow) {
      await this.git.fetch(['--tags']);
      return;
    }

    core.info('Repository is shallow. Fetching complete history...');
    try {
      await this.git.fetch(['--unshallow', '--tags']);
      return;
    } catch (error) {
      core.warning(
        `--unshallow failed: ${error instanceof Error ? error.message : String(error)}. Repository may remain shallow.`
      );
    }
  }

  private async downloadAndImportBundleIfPresent(bundleName: string): Promise<void> {
    try {
      const artifactResult = await artifact.getArtifact(bundleName);
      const downloadResult = await artifact.downloadArtifact(artifactResult.artifact.id, {
        path: this.runnerTempDir,
      });

      const bundlePath = path.join(downloadResult.downloadPath ?? this.runnerTempDir, `${bundleName}.bundle`);

      const bundleRefs = await this.listBundleRefs(bundlePath);

      if (bundleRefs.length === 0) {
        core.notice(`No valid bundle found in artifact "${bundleName}". Import is skipped.`);
        return;
      }

      for (const ref of bundleRefs) {
        await this.fetchBundleRef(bundlePath, ref);
      }

      const transportedHead = await this.resolveRef(this.getTransportRef(bundleName));
      if (transportedHead) {
        await this.git.checkout(['--force', transportedHead]);
        core.info(`Checked out transported HEAD ${transportedHead.slice(0, 7)}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('not found')) {
        core.notice(`No previous artifact named "${bundleName}" was found.`);
        return;
      }

      core.warning(`Previous bundle import skipped: ${message}`);
    }
  }

  private async createSnapshot(): Promise<RepoSnapshot> {
    return {
      tags: await this.listRefs('refs/tags'),
      notes: await this.listRefs('refs/notes'),
    };
  }

  private readSavedSnapshot(): RepoSnapshot {
    const raw = core.getState(this.stateKeys.snapshot);
    if (!raw) {
      return {tags: {}, notes: {}};
    }

    try {
      return JSON.parse(raw) as RepoSnapshot;
    } catch {
      return {tags: {}, notes: {}};
    }
  }

  private async listRefs(prefix: string): Promise<RefMap> {
    const refs: RefMap = {};

    try {
      const output = await this.git.raw(['for-each-ref', '--format=%(objectname) %(refname)', prefix]);
      const lines = output.split('\n').map(line => line.trim()).filter(Boolean);

      for (const line of lines) {
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

  private diffSnapshots(previousSnapshot: RepoSnapshot, currentSnapshot: RepoSnapshot): string[] {
    const changed = new Set<string>();

    for (const [ref, sha] of Object.entries(currentSnapshot.tags)) {
      if (previousSnapshot.tags[ref] !== sha) {
        changed.add(ref);
      }
    }

    for (const [ref, sha] of Object.entries(currentSnapshot.notes)) {
      if (previousSnapshot.notes[ref] !== sha) {
        changed.add(ref);
      }
    }

    return [...changed];
  }

  private buildRevisionSpecs(input: {
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

  private async tryCreateBundle(bundlePath: string, revisionSpecs: string[]): Promise<boolean> {
    if (revisionSpecs.length === 0) {
      return false;
    }

    try {
      await this.git.raw(['bundle', 'create', bundlePath, ...revisionSpecs]);
      const stat = await fs.stat(bundlePath);
      return stat.size > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('Refusing to create empty bundle') ||
        message.includes('no new commits') ||
        message.includes('no new revisions')
      ) {
        core.notice('No bundle content needs to be created for this job.');
        return false;
      }

      throw error;
    }
  }

  private async uploadArtifact(bundleName: string, files: string[], rootDir: string): Promise<void> {
    await this.deleteArtifactIfExists(bundleName);
    await artifact.uploadArtifact(bundleName, files, rootDir);
  }

  private async deleteArtifactIfExists(bundleName: string): Promise<void> {
    try {
      await artifact.deleteArtifact(bundleName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('not found')) {
        core.warning(`Failed to delete existing artifact "${bundleName}": ${message}`);
      }
    }
  }

  private async listBundleRefs(bundlePath: string): Promise<string[]> {
    if (!(await this.fileExists(bundlePath))) {
      return [];
    }

    try {
      const output = await this.git.raw(['bundle', 'list-heads', bundlePath]);
      return output
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .flatMap(line => {
          const ref = line.split(/\s+/)[1];
          return ref && ref.startsWith('refs/') ? [ref] : [];
        });
    } catch {
      return [];
    }
  }

  private async fetchBundleRef(bundlePath: string, ref: string): Promise<void> {
    try {
      await this.git.fetch([bundlePath, `+${ref}:${ref}`]);
    } catch (error) {
      core.debug(`Failed to import ref ${ref}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getHeadSha(): Promise<string> {
    return (await this.git.revparse(['HEAD'])).trim();
  }

  private async resolveRef(ref: string): Promise<string | null> {
    try {
      return (await this.git.revparse(['--verify', ref])).trim();
    } catch {
      return null;
    }
  }

  private async updateRef(ref: string, sha: string): Promise<void> {
    await this.git.raw(['update-ref', ref, sha]);
  }

  private async getCommitCountSince(baseSha: string, targetRef: string): Promise<number> {
    try {
      const output = await this.git.raw(['rev-list', '--count', `${baseSha}..${targetRef}`]);
      return Number.parseInt(output.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }


  private getTransportRef(bundleName: string): string {
    return `refs/head/${bundleName}`;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export const repo = new Repo();