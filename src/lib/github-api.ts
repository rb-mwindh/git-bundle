import artifact, { type UploadOptions } from '@actions/artifact';
import { context } from '@actions/github';
import * as os from 'node:os';
import {join} from 'node:path';
import {
  type AnnotationProperties,
  debug,
  getInput,
  getState,
  info,
  type InputOptions,
  notice,
  saveState,
  setFailed,
  setOutput,
  warning
} from "@actions/core";

/**
 * Compatibility shape for @actions/artifact v4 expected by GitBundleAction.
 * @actions/artifact v1 does not provide these fields through public APIs,
 * so best-effort values are used.
 */
export interface Artifact {
  id: number;
  name: string;
  size: number;
  createdAt?: Date;
  digest?: string;
}

export class GithubApi {
  private readonly artifactClient = artifact.create();
  private readonly artifactCache = new Map<string, {path: string; artifact: Artifact}>();

  getInput(name: string, options?: InputOptions): string {
    return getInput(name, options);
  }

  getState(name: string): string {
    return getState(name);
  }

  saveState(name: string, value: any): void {
    saveState(name, value);
  }

  setOutput(name: string, value: any): void {
    setOutput(name, value);
  }

  setFailed(message: string | Error): void {
    setFailed(message);
  }

  debug(message: string): void {
    debug(message);
  }

  info(message: string): void {
    info(message);
  }

  notice(message: string | Error, properties?: AnnotationProperties): void {
    notice(message, properties);
  }

  warning(message: string | Error, properties?: AnnotationProperties): void {
    warning(message, properties);
  }

  getContextSha(): string {
    return context.sha;
  }

  getContextRef(): string {
    return context.ref || '';
  }

  /**
   * Emulates listArtifacts for backward compatibility.
   * @actions/artifact@^1 provides no public listing API, so this always returns empty.
   */
  async listArtifacts() {
    this.debug('listArtifacts unsupported by @actions/artifact@^1; returning empty.');
    return {artifacts: [] as Artifact[]};
  }

  /**
   * Probes for artifact existence by attempting download.
   * Returns a compatibility artifact descriptor if found, null if missing.
   */
  async getArtifact(name: string): Promise<Artifact | null> {
    const cached = this.artifactCache.get(name);
    if (cached) return cached.artifact;

    const probeDir = process.env['RUNNER_TEMP']?.trim() || os.tmpdir();
    try {
      const result = await this.artifactClient.downloadArtifact(name, probeDir);
      if (result?.downloadPath) {
        const bundlePath = join(result.downloadPath, name);
        const compat: Artifact = {id: 0, name, size: 0, digest: 'unknown'};
        this.artifactCache.set(name, {path: bundlePath, artifact: compat});
        return compat;
      }
    } catch (error) {
      if (this.isArtifactMissingError(error, name)) return null;
      throw error;
    }
    return null;
  }

  /**
   * Downloads artifact by descriptor, using cache if probed via getArtifact.
   */
  async downloadArtifact(artifact: Artifact, targetDir: string): Promise<string> {
    const cached = this.artifactCache.get(artifact.name);
    if (cached) {
      this.debug(`Using cached path for "${artifact.name}".`);
      return cached.path;
    }

    let result;
    try {
      result = await this.artifactClient.downloadArtifact(artifact.name, targetDir);
    } catch (error) {
      if (this.isArtifactMissingError(error, artifact.name)) {
        throw new Error(`Artifact "${artifact.name}" not found.`);
      }
      throw error;
    }

    if (!result?.downloadPath) {
      throw new Error(`Artifact download returned no path for "${artifact.name}".`);
    }

    const bundlePath = join(result.downloadPath, artifact.name);
    this.debug(`Artifact extraction path: ${result.downloadPath}, bundle file path: ${bundlePath}`);
    return bundlePath;
  }

  async uploadArtifact(
    name: string,
    files: string[],
    rootDirectory: string,
    options?: UploadOptions,
  ) {
    const response = await this.artifactClient.uploadArtifact(name, files, rootDirectory, options as UploadOptions);
    return {
      id: response.artifactName,
      size: response.size,
      digest: 'unknown',
    }
  }

  /**
   * Deletes artifact by name.
   * @actions/artifact@^1 provides no public delete API, so this is a no-op for GHES compatibility.
   */
  async deleteArtifact(_name: string): Promise<void> {
    this.debug('deleteArtifact unsupported by @actions/artifact@^1; skipping.');
  }

  private isArtifactMissingError(error: unknown, name: string): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return msg.includes('Unable to find any artifacts') || msg.includes(`Unable to find an artifact with the name: ${name}`);
  }
}
