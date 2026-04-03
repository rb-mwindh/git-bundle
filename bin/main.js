/*! @rb-mwindh/git-bundle v1.0.0-rc.1 | MIT */

// src/main.ts
import * as core2 from "@actions/core";

// src/lib/repo.ts
import * as core from "@actions/core";
import artifact from "@actions/artifact";
import * as github from "@actions/github";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { simpleGit } from "simple-git";
var Repo = class _Repo {
  git;
  cwd;
  runnerTempDir;
  stateKeys = {
    githubSha: "git-bundle-github-sha",
    snapshot: "git-bundle-snapshot"
  };
  constructor(workspaceDir = _Repo.resolveWorkspaceDir(), runnerTempDir = _Repo.resolveRunnerTempDir()) {
    this.cwd = workspaceDir;
    this.runnerTempDir = runnerTempDir;
    this.git = simpleGit(this.cwd);
  }
  static resolveWorkspaceDir() {
    const githubWorkspace = process.env["GITHUB_WORKSPACE"]?.trim();
    if (githubWorkspace) {
      return path.resolve(githubWorkspace);
    }
    return process.cwd();
  }
  static resolveRunnerTempDir() {
    const runnerTemp = process.env["RUNNER_TEMP"]?.trim();
    if (runnerTemp) {
      return path.resolve(runnerTemp);
    }
    return os.tmpdir();
  }
  async pre(bundleName) {
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
  async noop(bundleName) {
    core.debug(`Main phase is a no-op for bundle "${bundleName}".`);
  }
  async post(bundleName) {
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
      commitCount
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
  async ensureRepository() {
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      throw new Error("Git repository not found. Run actions/checkout before git-bundle.");
    }
  }
  async ensureDeepFetched() {
    const isShallow = (await this.git.revparse(["--is-shallow-repository"])).trim() === "true";
    if (!isShallow) {
      await this.git.fetch(["--tags"]);
      return;
    }
    core.info("Repository is shallow. Fetching complete history...");
    try {
      await this.git.fetch(["--unshallow", "--tags"]);
      return;
    } catch (error) {
      core.warning(
        `--unshallow failed: ${error instanceof Error ? error.message : String(error)}. Repository may remain shallow.`
      );
    }
  }
  async downloadAndImportBundleIfPresent(bundleName) {
    try {
      const artifactResult = await artifact.getArtifact(bundleName);
      const downloadResult = await artifact.downloadArtifact(artifactResult.artifact.id, {
        path: this.runnerTempDir
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
        await this.git.checkout(["--force", transportedHead]);
        core.info(`Checked out transported HEAD ${transportedHead.slice(0, 7)}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("not found")) {
        core.notice(`No previous artifact named "${bundleName}" was found.`);
        return;
      }
      core.warning(`Previous bundle import skipped: ${message}`);
    }
  }
  async createSnapshot() {
    return {
      tags: await this.listRefs("refs/tags"),
      notes: await this.listRefs("refs/notes")
    };
  }
  readSavedSnapshot() {
    const raw = core.getState(this.stateKeys.snapshot);
    if (!raw) {
      return { tags: {}, notes: {} };
    }
    try {
      return JSON.parse(raw);
    } catch {
      return { tags: {}, notes: {} };
    }
  }
  async listRefs(prefix) {
    const refs = {};
    try {
      const output = await this.git.raw(["for-each-ref", "--format=%(objectname) %(refname)", prefix]);
      const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        const [sha, ref] = line.split(/\s+/, 2);
        if (sha && ref) {
          refs[ref] = sha;
        }
      }
    } catch {
    }
    return refs;
  }
  diffSnapshots(previousSnapshot, currentSnapshot) {
    const changed = /* @__PURE__ */ new Set();
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
  buildRevisionSpecs(input) {
    if (input.commitCount === 0 && input.changedRefs.length === 0) {
      return [];
    }
    const specs = [];
    if (input.commitCount > 0) {
      specs.push(`${input.githubSha}..${input.transportRef}`);
    }
    specs.push(input.transportRef);
    specs.push(...input.changedRefs);
    return [...new Set(specs.filter(Boolean))];
  }
  async tryCreateBundle(bundlePath, revisionSpecs) {
    if (revisionSpecs.length === 0) {
      return false;
    }
    try {
      await this.git.raw(["bundle", "create", bundlePath, ...revisionSpecs]);
      const stat2 = await fs.stat(bundlePath);
      return stat2.size > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Refusing to create empty bundle") || message.includes("no new commits") || message.includes("no new revisions")) {
        core.notice("No bundle content needs to be created for this job.");
        return false;
      }
      throw error;
    }
  }
  async uploadArtifact(bundleName, files, rootDir) {
    await this.deleteArtifactIfExists(bundleName);
    await artifact.uploadArtifact(bundleName, files, rootDir);
  }
  async deleteArtifactIfExists(bundleName) {
    try {
      await artifact.deleteArtifact(bundleName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("not found")) {
        core.warning(`Failed to delete existing artifact "${bundleName}": ${message}`);
      }
    }
  }
  async listBundleRefs(bundlePath) {
    if (!await this.fileExists(bundlePath)) {
      return [];
    }
    try {
      const output = await this.git.raw(["bundle", "list-heads", bundlePath]);
      return output.split("\n").map((line) => line.trim()).filter(Boolean).flatMap((line) => {
        const ref = line.split(/\s+/)[1];
        return ref && ref.startsWith("refs/") ? [ref] : [];
      });
    } catch {
      return [];
    }
  }
  async fetchBundleRef(bundlePath, ref) {
    try {
      await this.git.fetch([bundlePath, `+${ref}:${ref}`]);
    } catch (error) {
      core.debug(`Failed to import ref ${ref}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async getHeadSha() {
    return (await this.git.revparse(["HEAD"])).trim();
  }
  async resolveRef(ref) {
    try {
      return (await this.git.revparse(["--verify", ref])).trim();
    } catch {
      return null;
    }
  }
  async updateRef(ref, sha) {
    await this.git.raw(["update-ref", ref, sha]);
  }
  async getCommitCountSince(baseSha, targetRef) {
    try {
      const output = await this.git.raw(["rev-list", "--count", `${baseSha}..${targetRef}`]);
      return Number.parseInt(output.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }
  getTransportRef(bundleName) {
    return `refs/head/${bundleName}`;
  }
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
};
var repo = new Repo();

// src/main.ts
(async () => {
  const bundleName = core2.getInput("bundle", { required: false }) || "release";
  await repo.pre(bundleName);
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  core2.setFailed(message);
});
