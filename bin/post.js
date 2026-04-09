/*! @rb-mwindh/git-bundle v1.0.0-rc.4 | MIT */

// src/post.ts
import * as core from "@actions/core";

// src/lib/git-bundle-action.ts
import * as os from "node:os";
import * as path from "node:path";

// src/lib/format-date.ts
function formatDate(d) {
  if (!d) {
    return "unknown";
  }
  return new Date(d).toLocaleString("en-US", { dateStyle: "long" });
}

// src/lib/format-file-size.ts
function formatFileSize(sizeInBytes, fractionDigits = 1) {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes < 0) {
    throw new Error("sizeInBytes must be a non-negative finite number");
  }
  if (sizeInBytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = sizeInBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const digits = unitIndex === 0 ? 0 : fractionDigits;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

// src/lib/github-api.ts
import artifactClient from "@actions/artifact";
import { context } from "@actions/github";
import { join } from "node:path";
import {
  debug,
  getInput,
  getState,
  info,
  notice,
  saveState,
  setFailed,
  setOutput,
  warning
} from "@actions/core";
var GithubApi = class {
  getInput(name, options) {
    return getInput(name, options);
  }
  getState(name) {
    return getState(name);
  }
  saveState(name, value) {
    saveState(name, value);
  }
  setOutput(name, value) {
    setOutput(name, value);
  }
  setFailed(message) {
    setFailed(message);
  }
  debug(message) {
    debug(message);
  }
  info(message) {
    info(message);
  }
  notice(message, properties) {
    notice(message, properties);
  }
  warning(message, properties) {
    warning(message, properties);
  }
  getContextSha() {
    return context.sha;
  }
  async listArtifacts() {
    return artifactClient.listArtifacts({ latest: true });
  }
  async getArtifact(name) {
    const result = await this.listArtifacts();
    return result.artifacts.find((artifact) => artifact.name === name) ?? null;
  }
  async downloadArtifact(artifact, targetDir) {
    const result = await artifactClient.downloadArtifact(artifact.id, { path: targetDir });
    if (!result?.downloadPath) {
      throw new Error(`Artifact download returned no path for "${artifact.name}".`);
    }
    const bundlePath = join(result.downloadPath, artifact.name);
    this.debug(`Artifact extraction path: ${result.downloadPath}, bundle file path: ${bundlePath}`);
    return bundlePath;
  }
  async uploadArtifact(name, files, rootDirectory, options) {
    return artifactClient.uploadArtifact(name, files, rootDirectory, options);
  }
  async deleteArtifact(artifactName, options) {
    return artifactClient.deleteArtifact(artifactName, options);
  }
};

// src/lib/git-api.ts
import { simpleGit } from "simple-git";
var DEFAULT_TRACKED_REFS = ["refs/tags/*", "refs/notes/*"];
var GitApi = class {
  git;
  constructor(repoPathOrClient) {
    this.git = typeof repoPathOrClient === "string" ? simpleGit(repoPathOrClient) : repoPathOrClient;
  }
  /**
   * Returns true if the working directory is inside a Git repository.
   */
  async checkIsRepo() {
    return this.git.checkIsRepo();
  }
  /**
   * Returns true when the repository is shallow.
   */
  async isShallowRepository() {
    const shallowValue = (await this.git.revparse(["--is-shallow-repository"])).trim();
    return shallowValue === "true";
  }
  /**
   * Converts tracked refs into force-fetch refspecs.
   */
  buildFetchRefSpecs(trackedRefs = DEFAULT_TRACKED_REFS) {
    return trackedRefs.map((ref) => `+${ref}:${ref}`);
  }
  /**
   * Performs a regular force-fetch from origin.
   */
  async fetch(fetchRefSpecs = []) {
    return this.git.fetch(["--force", "origin", ...fetchRefSpecs]);
  }
  /**
   * Performs an unshallow force-fetch from origin.
   */
  async fetchUnshallow(fetchRefSpecs = []) {
    return this.git.fetch(["--force", "--unshallow", "origin", ...fetchRefSpecs]);
  }
  async checkout(sha) {
    return this.git.checkout(["--force", sha]);
  }
  /**
   * Creates a snapshot of all current refs matching the given prefixes as a flat ref→sha map.
   */
  async createSnapshot(trackedRefs = DEFAULT_TRACKED_REFS) {
    const refs = {};
    try {
      const output = await this.git.raw([
        "for-each-ref",
        "--format=%(objectname) %(refname)",
        ...trackedRefs
      ]);
      for (const line of output.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const [sha, ref] = line.split(/\s+/, 2);
        if (sha && ref) {
          refs[ref] = sha;
        }
      }
    } catch {
    }
    return refs;
  }
  /**
   * Returns the SHA of the current HEAD commit.
   */
  async getHeadSha() {
    return (await this.git.revparse(["HEAD"])).trim();
  }
  /**
   * Updates a Git ref to point to the given commit SHA.
   */
  async updateRef(ref, sha) {
    return this.git.raw(["update-ref", ref, sha]);
  }
  /**
   * Returns the number of commits reachable from targetRef but not from baseSha.
   * Returns 0 if the range cannot be computed.
   */
  async getCommitCountSince(baseSha, targetRef) {
    try {
      const output = await this.git.raw(["rev-list", "--count", `${baseSha}..${targetRef}`]);
      return Number.parseInt(output.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }
  /**
   * Creates a Git bundle at the given path from the provided revision specs.
   * Returns created=false if specs are empty or git reports no new content.
   */
  async createBundle(bundlePath, revisionSpecs) {
    return this.git.raw(["bundle", "create", bundlePath, ...revisionSpecs]);
  }
  /**
   * Lists all refs contained in a Git bundle file.
   */
  async listBundleRefs(bundlePath) {
    try {
      const output = await this.git.raw(["bundle", "list-heads", bundlePath]);
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
  parseBundleRefs(output) {
    return output.split("\n").map((line) => line.trim()).filter(Boolean).flatMap((line) => {
      const ref = line.split(/\s+/)[1];
      return ref && ref.startsWith("refs/") ? [ref] : [];
    });
  }
  /**
   * Resolves a ref to its commit SHA, returning null if the ref cannot be resolved.
   */
  async resolveRef(ref) {
    try {
      return (await this.git.revparse(["--verify", ref])).trim();
    } catch {
      return null;
    }
  }
};

// src/lib/git-bundle-api.ts
import fs from "node:fs";
var GitBundleApi = class {
  githubApi;
  gitApi;
  constructor(repoPath, githubApi) {
    this.githubApi = githubApi;
    this.gitApi = new GitApi(repoPath);
  }
  async ensureGitRepository() {
    this.githubApi.info("Checking if current working directory is a Git repository...");
    const isRepo = await this.gitApi.checkIsRepo();
    if (!isRepo) {
      throw new Error("Git repository not found. Run actions/checkout before git-bundle.");
    }
    this.githubApi.info("Git repository found.");
  }
  async fetchTrackedRefs(trackedRefs = DEFAULT_TRACKED_REFS) {
    const fetchRefSpecs = this.gitApi.buildFetchRefSpecs(trackedRefs);
    const wasShallow = await this.gitApi.isShallowRepository();
    if (!wasShallow) {
      const fetchResult = await this.gitApi.fetch(fetchRefSpecs);
      return { wasShallow: false, fetchResult };
    }
    try {
      const fetchResult = await this.gitApi.fetchUnshallow(fetchRefSpecs);
      return { wasShallow: true, fetchResult };
    } catch (error) {
      const unshallowError = error instanceof Error ? error.message : String(error);
      const fetchResult = await this.gitApi.fetch(fetchRefSpecs);
      return { wasShallow: true, unshallowError, fetchResult };
    }
  }
  formatFetchResult(result) {
    const rawOutput = result.raw?.trim();
    if (rawOutput) {
      return rawOutput;
    }
    const updatedCount = Array.isArray(result.updated) ? result.updated.length : 0;
    const deletedCount = Array.isArray(result.deleted) ? result.deleted.length : 0;
    return `(remote=${result.remote || "unknown"}, updated=${updatedCount}, deleted=${deletedCount}).`;
  }
  getTransportRef(bundleName) {
    return `refs/heads/${bundleName}`;
  }
  async importBundle(bundlePath, bundleName) {
    this.githubApi.info("Fetching Git bundle refs...");
    const transportRef = this.getTransportRef(bundleName);
    const stats = fs.statSync(bundlePath);
    this.githubApi.debug(`Inspecting Git bundle at "${bundlePath}": isFile: ${stats.isFile()}, size: ${stats.size} bytes.`);
    const bundleRefs = await this.gitApi.listBundleRefs(bundlePath);
    if (bundleRefs.length === 0) {
      this.githubApi.notice(`No valid refs found in artifact "${bundleName}". Import is skipped.`);
      return;
    }
    this.githubApi.debug(`Importing refs from bundle "${bundlePath}: 
 * ${bundleRefs.join("\n * ")}`);
    try {
      const fetchResult = await this.gitApi.fetch([bundlePath, ...bundleRefs]);
      this.githubApi.info(`Git bundle "${bundlePath}" imported successfully.
${this.formatFetchResult(fetchResult)}`);
    } catch (err) {
      throw new Error(`Failed to import Git bundle "${bundlePath}": ${String(err)}`);
    }
    this.githubApi.info(`Resolving transport ref "${transportRef}"...`);
    const transportedHead = await this.gitApi.resolveRef(transportRef);
    if (!transportedHead) {
      throw new Error(
        `Required ref "${transportRef}" could not be resolved after importing bundle "${bundlePath}". Bundle contains refs: [${bundleRefs.join(", ")}]. Ensure the bundle was created with the transport ref included in the revision specs.`
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
  async createSnapshot(trackedRefs) {
    return this.gitApi.createSnapshot(trackedRefs);
  }
  diffSnapshots(previousSnapshot, currentSnapshot) {
    const changed = /* @__PURE__ */ new Set();
    for (const [ref, sha] of Object.entries(currentSnapshot)) {
      if (previousSnapshot[ref] !== sha) {
        changed.add(ref);
      }
    }
    return [...changed];
  }
  async getHeadSha() {
    return this.gitApi.getHeadSha();
  }
  async updateRef(ref, sha) {
    this.githubApi.info(`Updating Git ref "${ref}" to point to SHA ${sha}...`);
    try {
      const result = await this.gitApi.updateRef(ref, sha);
      this.githubApi.info(result);
    } catch (error) {
      throw new Error(`Failed to update Git ref "${ref}" to SHA ${sha}. ${String(error)}`);
    }
  }
  async getCommitCountSince(baseSha, targetRef) {
    return this.gitApi.getCommitCountSince(baseSha, targetRef);
  }
  async buildRevisionSpecs(githubSha, transportRef, changedRefs) {
    const commitCount = await this.gitApi.getCommitCountSince(githubSha, transportRef);
    if (commitCount === 0 && changedRefs.length === 0) {
      return [];
    }
    const specs = [];
    if (commitCount > 0) {
      specs.push(`${githubSha}..${transportRef}`);
    }
    specs.push(transportRef);
    specs.push(...changedRefs);
    return [...new Set(specs.filter(Boolean))];
  }
  async createBundle(bundlePath, revisionSpecs) {
    this.githubApi.info(`Creating Git bundle at "${bundlePath}" with revision specs: ${JSON.stringify(revisionSpecs)}`);
    if (revisionSpecs.length === 0) {
      return false;
    }
    try {
      const result = await this.gitApi.createBundle(bundlePath, revisionSpecs);
      this.githubApi.debug(result);
      const stat = fs.statSync(bundlePath);
      this.githubApi.info(`Git bundle size: ${stat.size} bytes`);
      return stat.size > 0;
    } catch (error) {
      this.githubApi.debug(String(error));
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Refusing to create empty bundle") || message.includes("no new commits") || message.includes("no new revisions")) {
        return false;
      }
      throw error;
    }
  }
  saveSnapshot(snapshot) {
    this.githubApi.saveState("git-bundle-snapshot", JSON.stringify(snapshot));
  }
  readSavedSnapshot() {
    const raw = this.githubApi.getState("git-bundle-snapshot");
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw);
    } catch {
      this.githubApi.warning("Snapshot state is invalid JSON. Using empty baseline for diff.");
      return {};
    }
  }
};

// src/lib/git-bundle-action.ts
var GitBundleAction = class {
  constructor(githubApi = new GithubApi()) {
    this.githubApi = githubApi;
  }
  githubApi;
  async pre() {
  }
  async main() {
    const { bundleName, trackedRefs, repoPath, tempDir } = this.readContext();
    const bundleApi = new GitBundleApi(repoPath, this.githubApi);
    await bundleApi.ensureGitRepository();
    this.githubApi.info("Checking if the Git repository has complete history...");
    const fetchRefsResult = await bundleApi.fetchTrackedRefs(trackedRefs);
    if (fetchRefsResult.wasShallow) {
      if (fetchRefsResult.unshallowError) {
        this.githubApi.warning(
          `Full history fetch failed: ${fetchRefsResult.unshallowError}. Repository may remain shallow.`
        );
      } else {
        this.githubApi.info("Repository is shallow - fetching full history and tags...");
      }
      this.githubApi.info(
        `Fetched full history and refs: ${bundleApi.formatFetchResult(fetchRefsResult.fetchResult)}`
      );
    } else {
      this.githubApi.info("Repository is already fully fetched.");
      this.githubApi.info("Fetching all tags to ensure tag refs are up to date.");
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
      const createdAt = artifact.createdAt ? formatDate(artifact.createdAt) : "unknown";
      this.githubApi.info(
        `Artifact "${artifact.name}" found (id=${artifact.id}, size=${formatFileSize(artifact.size)}, createdAt=${createdAt}, digest=${artifact.digest}). Downloading...`
      );
      const bundlePath = await this.githubApi.downloadArtifact(artifact, tempDir);
      this.githubApi.info(`Downloaded artifact to ${bundlePath}.`);
      await bundleApi.importBundle(bundlePath, bundleName);
    }
    const snapshot = await bundleApi.createSnapshot(trackedRefs);
    bundleApi.saveSnapshot(snapshot);
  }
  async post() {
    const { bundleName, trackedRefs, repoPath, tempDir } = this.readContext();
    const bundleApi = new GitBundleApi(repoPath, this.githubApi);
    await bundleApi.ensureGitRepository();
    const githubSha = this.githubApi.getContextSha();
    const previousSnapshot = bundleApi.readSavedSnapshot();
    const currentSnapshot = await bundleApi.createSnapshot(trackedRefs);
    const changedRefs = bundleApi.diffSnapshots(previousSnapshot, currentSnapshot);
    this.githubApi.info(`Compared repo snapshots: ${JSON.stringify(changedRefs)}`);
    const headSha = await bundleApi.getHeadSha();
    const transportRef = bundleApi.getTransportRef(bundleName);
    await bundleApi.updateRef(transportRef, headSha);
    const revisionSpecs = await bundleApi.buildRevisionSpecs(githubSha, transportRef, changedRefs);
    this.githubApi.info(
      `Bundle revision specs (count=${revisionSpecs.length}): ${revisionSpecs.join(", ") || "(empty)"}`
    );
    const bundlePath = path.join(tempDir, bundleName);
    const bundleCreated = await bundleApi.createBundle(bundlePath, revisionSpecs);
    if (!bundleCreated) {
      this.githubApi.notice(
        `No new bundle content for "${bundleName}". Artifact upload is skipped by design.`
      );
      return;
    }
    try {
      await this.githubApi.deleteArtifact(bundleName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("not found")) {
        this.githubApi.warning(
          `Upload step: failed to delete existing artifact "${bundleName}": ${message}`
        );
      }
    }
    const { id, size, digest } = await this.githubApi.uploadArtifact(bundleName, [bundlePath], tempDir);
    this.githubApi.info(`Successfully uploaded Git bundle artifact with id "${id}" (size: ${size} bytes, digest: ${digest})`);
  }
  readContext() {
    const bundleName = this.githubApi.getInput("bundle", { required: false }) || "release";
    const repoPathInput = this.githubApi.getInput("path", { required: false });
    const tempDirInput = this.githubApi.getInput("tempDir", { required: false });
    const trackedRefsInput = this.githubApi.getInput("refs", { required: false });
    const trackedRefs = trackedRefsInput.split(",").map((ref) => ref.trim()).filter(Boolean);
    const repoPath = repoPathInput || process.env["GITHUB_WORKSPACE"]?.trim() || process.cwd();
    const tempDir = tempDirInput || process.env["RUNNER_TEMP"]?.trim() || os.tmpdir();
    return {
      bundleName,
      repoPath,
      tempDir,
      trackedRefs: trackedRefs.length > 0 ? trackedRefs : DEFAULT_TRACKED_REFS
    };
  }
};

// src/post.ts
new GitBundleAction().post().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
