/*! @rb-mwindh/git-bundle v2.2.0-rc.3 | MIT */

// src/post.ts
import * as core from "@actions/core";

// src/lib/git-bundle-action.ts
import * as os2 from "node:os";
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
import artifact from "@actions/artifact";
import { context } from "@actions/github";
import * as os from "node:os";
import { join } from "node:path";
import {
  debug,
  error,
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
  artifactClient = artifact.create();
  artifactCache = /* @__PURE__ */ new Map();
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
  notice(message) {
    notice(message);
  }
  warning(message) {
    warning(message);
  }
  error(message) {
    error(message);
  }
  getContextSha() {
    return context.sha;
  }
  getContextRef() {
    return context.ref || "";
  }
  /**
   * Emulates listArtifacts for backward compatibility.
   * @actions/artifact@^1 provides no public listing API, so this always returns empty.
   */
  async listArtifacts() {
    this.debug("listArtifacts unsupported by @actions/artifact@^1; returning empty.");
    return { artifacts: [] };
  }
  /**
   * Probes for artifact existence by attempting download.
   * Returns a compatibility artifact descriptor if found, null if missing.
   */
  async getArtifact(name) {
    const cached = this.artifactCache.get(name);
    if (cached) return cached.artifact;
    const probeDir = process.env["RUNNER_TEMP"]?.trim() || os.tmpdir();
    try {
      const result = await this.artifactClient.downloadArtifact(name, probeDir);
      if (result?.downloadPath) {
        const bundlePath = join(result.downloadPath, name);
        const compat = { id: 0, name, size: 0, digest: "unknown" };
        this.artifactCache.set(name, { path: bundlePath, artifact: compat });
        return compat;
      }
    } catch (error2) {
      if (this.isArtifactMissingError(error2, name)) return null;
      throw error2;
    }
    return null;
  }
  /**
   * Downloads artifact by descriptor, using cache if probed via getArtifact.
   */
  async downloadArtifact(artifact2, targetDir) {
    const cached = this.artifactCache.get(artifact2.name);
    if (cached) {
      this.debug(`Using cached path for "${artifact2.name}".`);
      return cached.path;
    }
    let result;
    try {
      result = await this.artifactClient.downloadArtifact(artifact2.name, targetDir);
    } catch (error2) {
      if (this.isArtifactMissingError(error2, artifact2.name)) {
        throw new Error(`Artifact "${artifact2.name}" not found.`);
      }
      throw error2;
    }
    if (!result?.downloadPath) {
      throw new Error(`Artifact download returned no path for "${artifact2.name}".`);
    }
    const bundlePath = join(result.downloadPath, artifact2.name);
    this.debug(`Artifact extraction path: ${result.downloadPath}, bundle file path: ${bundlePath}`);
    return bundlePath;
  }
  async uploadArtifact(name, files, rootDirectory, options) {
    const response = await this.artifactClient.uploadArtifact(name, files, rootDirectory, options);
    return {
      id: response.artifactName,
      size: response.size,
      digest: "unknown"
    };
  }
  /**
   * Deletes artifact by name.
   * @actions/artifact@^1 provides no public delete API, so this is a no-op for GHES compatibility.
   */
  async deleteArtifact(_name) {
    this.debug("deleteArtifact unsupported by @actions/artifact@^1; skipping.");
  }
  isArtifactMissingError(error2, name) {
    const msg = error2 instanceof Error ? error2.message : String(error2);
    return msg.includes("Unable to find any artifacts") || msg.includes(`Unable to find an artifact with the name: ${name}`);
  }
};

// src/lib/git-bundle-api.ts
import fs from "node:fs";

// src/lib/git-api.ts
import { simpleGit } from "simple-git";

// src/lib/fetch-ref-specs.ts
var RE_GITREF = /^refs\/[^:\s]+$/;
var RE_FETCH_REFSPEC = /^\+?refs\/[^:\s]+:refs\/[^:\s]+$/;
function isGitRef(arg) {
  return typeof arg === "string" && RE_GITREF.test(arg);
}
function isFetchRefSpec(arg) {
  return typeof arg === "string" && RE_FETCH_REFSPEC.test(arg);
}
function toFetchRefSpec(ref) {
  return isFetchRefSpec(ref) ? ref : isGitRef(ref) ? `+${ref}:${ref}` : void 0;
}

// src/lib/git-api.ts
var DEFAULT_TRACKED_REFS = ["refs/tags/*", "refs/notes/*"];
var GitApi = class {
  git;
  constructor(repoPathOrClient, logger) {
    this.git = typeof repoPathOrClient === "string" ? simpleGit(repoPathOrClient) : repoPathOrClient;
    if (logger) {
      this.git.outputHandler((command, stdout, stderr) => {
        logger.debug(command);
        stdout.on("data", (data) => logger.debug(String(data)));
        stderr.on("data", (data) => logger.debug(String(data)));
      });
    }
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
    return trackedRefs.map(toFetchRefSpec).filter((arg) => Boolean(arg));
  }
  /**
   * Performs a regular force-fetch from origin.
   */
  async fetch(refSpecs = [], origin = "origin") {
    return this.git.fetch(["--force", origin, ...refSpecs]);
  }
  /**
   * Performs an unshallow force-fetch from origin.
   */
  async fetchUnshallow(fetchRefSpecs = []) {
    return this.git.fetch(["--force", "--unshallow", "origin", ...fetchRefSpecs]);
  }
  async checkout(sha, options) {
    const args = [];
    if (options?.force !== false) {
      args.push("--force");
    }
    if (options?.detach === true) {
      args.push("--detach");
    }
    args.push(sha);
    await this.git.checkout(args);
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
  async showRef() {
    return this.git.raw(["show-ref"]);
  }
  /**
   * Returns the SHA of the current HEAD commit.
   */
  async getHeadSha() {
    return (await this.git.revparse(["HEAD"])).trim();
  }
  async getHeadRef() {
    try {
      return (await this.git.raw(["symbolic-ref", "--quiet", "HEAD"])).trim();
    } catch {
      return null;
    }
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
    try {
      const result = await this.git.raw(["bundle", "create", bundlePath, ...revisionSpecs]);
      return { result };
    } catch (error2) {
      return { error: error2 };
    }
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
  /**
   * Deletes a Git ref.
   */
  async deleteRef(ref) {
    await this.git.raw(["update-ref", "-d", ref]);
  }
};

// src/lib/git-bundle-api.ts
var GitBundleApi = class {
  githubApi;
  gitApi;
  constructor(repoPath, githubApi) {
    this.githubApi = githubApi;
    this.gitApi = new GitApi(repoPath, githubApi);
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
    } catch (error2) {
      const unshallowError = error2 instanceof Error ? error2.message : String(error2);
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
  getTransportRef() {
    return "refs/git-bundle/transport";
  }
  async tryRestoreRef(ref) {
    if (!ref) {
      return false;
    }
    const resolvedSha = await this.gitApi.resolveRef(ref);
    if (!resolvedSha) {
      this.githubApi.debug(`Ref "${ref}" could not be resolved.`);
      return false;
    }
    this.githubApi.info(`Restoring ref "${ref}" at ${resolvedSha}...`);
    if (ref.startsWith("refs/heads/")) {
      await this.gitApi.checkout(ref.slice("refs/heads/".length));
      this.githubApi.info(`Checked out branch "${ref}".`);
    } else if (ref.startsWith("refs/tags/")) {
      await this.gitApi.checkout(ref);
      this.githubApi.info(`Checked out tag "${ref}".`);
    } else {
      await this.gitApi.checkout(resolvedSha, { detach: true });
      this.githubApi.info(`Checked out detached SHA "${resolvedSha}" from "${ref}".`);
    }
    return true;
  }
  async importBundle(bundlePath, bundleName) {
    const transportRef = this.getTransportRef();
    const contextRef = this.githubApi.getContextRef();
    const stats = fs.statSync(bundlePath, { throwIfNoEntry: false });
    this.githubApi.info(`Inspecting Git bundle at "${bundlePath}": isFile: ${stats?.isFile() || false}, size: ${stats?.size || 0} bytes.`);
    const currentHeadRef = await this.gitApi.getHeadRef();
    const bundleRefs = await this.gitApi.listBundleRefs(bundlePath);
    const shouldDetach = currentHeadRef !== null && bundleRefs.includes(currentHeadRef);
    if (shouldDetach) {
      this.githubApi.info(
        `Current HEAD is attached to "${currentHeadRef}", which will be updated by bundle import. Detaching HEAD temporarily...`
      );
      await this.gitApi.checkout("HEAD", { detach: true });
    }
    if (bundleRefs.length === 0) {
      this.githubApi.notice(`No valid refs found in artifact "${bundleName}". Import is skipped.`);
      return;
    }
    this.githubApi.info(`Importing refs from bundle "${bundlePath}: 
 * ${bundleRefs.join("\n * ")}`);
    try {
      const fetchRefSpecs = this.gitApi.buildFetchRefSpecs(bundleRefs);
      const fetchResult = await this.gitApi.fetch(fetchRefSpecs, bundlePath);
      this.githubApi.info(`Git bundle "${bundlePath}" imported successfully.
${this.formatFetchResult(fetchResult)}`);
    } catch (err) {
      throw new Error(`Failed to import Git bundle "${bundlePath}": ${String(err)}`);
    }
    if (!await this.tryRestoreRef(contextRef)) {
      if (!await this.tryRestoreRef(transportRef)) {
        throw new Error(
          `Neither context ref "${contextRef}" nor transport ref "${transportRef}" could be restored after importing bundle "${bundlePath}". Bundle contains refs: [${bundleRefs.join(", ")}].`
        );
      }
    }
    try {
      await this.gitApi.deleteRef(transportRef);
      this.githubApi.info(`Removed transport ref "${transportRef}" after import.`);
    } catch (err) {
      this.githubApi.warning(`Failed to remove transport ref "${transportRef}" after import: ${String(err)}`);
    }
    this.githubApi.info("Repository state is now based on the imported bundle.");
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
    } catch (error2) {
      throw new Error(`Failed to update Git ref "${ref}" to SHA ${sha}. ${String(error2)}`);
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
      this.githubApi.debug(JSON.stringify(result));
      const stat = fs.statSync(bundlePath, { throwIfNoEntry: false }) || { size: 0 };
      this.githubApi.info(`Git bundle size: ${stat.size} bytes`);
      return stat.size > 0;
    } catch (error2) {
      this.githubApi.debug(String(error2));
      const message = error2 instanceof Error ? error2.message : String(error2);
      if (message.includes("Refusing to create empty bundle") || message.includes("no new commits") || message.includes("no new revisions")) {
        return false;
      }
      throw error2;
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
    const artifact2 = await this.githubApi.getArtifact(bundleName);
    if (!artifact2) {
      this.githubApi.notice(
        `No previous artifact named "${bundleName}" found. This is expected in the first job.`
      );
    } else {
      const createdAt = artifact2.createdAt ? formatDate(artifact2.createdAt) : "unknown";
      this.githubApi.info(
        `Artifact "${artifact2.name}" found (id=${artifact2.id}, size=${formatFileSize(artifact2.size)}, createdAt=${createdAt}, digest=${artifact2.digest}). Downloading...`
      );
      const bundlePath = await this.githubApi.downloadArtifact(artifact2, tempDir);
      this.githubApi.info(`Downloaded artifact to ${bundlePath}.`);
      this.githubApi.info("Fetching Git bundle refs...");
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
    const contextRef = this.githubApi.getContextRef();
    const effectiveTrackedRefs = [...trackedRefs];
    if (contextRef.startsWith("refs/heads/") || contextRef.startsWith("refs/tags/")) {
      effectiveTrackedRefs.push(contextRef);
    }
    const previousSnapshot = bundleApi.readSavedSnapshot();
    this.githubApi.info(`previousSnapshot: ${JSON.stringify(previousSnapshot)}`);
    const currentSnapshot = await bundleApi.createSnapshot(effectiveTrackedRefs);
    this.githubApi.info(`currentSnapshot: ${JSON.stringify(currentSnapshot)}`);
    const changedRefs = bundleApi.diffSnapshots(previousSnapshot, currentSnapshot);
    this.githubApi.info(`changedRefs: ${JSON.stringify(changedRefs)}`);
    const headSha = await bundleApi.getHeadSha();
    const transportRef = bundleApi.getTransportRef();
    await bundleApi.updateRef(transportRef, headSha);
    const revisionSpecs = await bundleApi.buildRevisionSpecs(githubSha, transportRef, changedRefs);
    this.githubApi.info(
      `Bundle revision specs (count=${revisionSpecs.length}): ${JSON.stringify(revisionSpecs)}`
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
    } catch (error2) {
      const message = error2 instanceof Error ? error2.message : String(error2);
      if (!message.toLowerCase().includes("not found")) {
        this.githubApi.warning(
          `Upload step: failed to delete existing artifact "${bundleName}": ${message}`
        );
      }
    }
    const uploadResult = await this.githubApi.uploadArtifact(bundleName, [bundlePath], tempDir);
    if (uploadResult) {
      const { id, size, digest } = uploadResult;
      this.githubApi.info(`Successfully uploaded Git bundle artifact with id "${id}" (size: ${size} bytes, digest: ${digest})`);
    } else {
      this.githubApi.info("Failed to upload Git bundle artifact.");
    }
  }
  readContext() {
    const bundleName = this.githubApi.getInput("bundle", { required: false }) || "release";
    const repoPathInput = this.githubApi.getInput("path", { required: false });
    const tempDirInput = this.githubApi.getInput("tempDir", { required: false });
    const trackedRefsInput = this.githubApi.getInput("refs", { required: false });
    const trackedRefs = trackedRefsInput.split(",").map((ref) => ref.trim()).filter(Boolean);
    const repoPath = repoPathInput || process.env["GITHUB_WORKSPACE"]?.trim() || process.cwd();
    const tempDir = tempDirInput || process.env["RUNNER_TEMP"]?.trim() || os2.tmpdir();
    return {
      bundleName,
      repoPath,
      tempDir,
      trackedRefs
    };
  }
};

// src/post.ts
new GitBundleAction().post().catch((error2) => {
  const message = error2 instanceof Error ? error2.message : String(error2);
  core.setFailed(message);
});
