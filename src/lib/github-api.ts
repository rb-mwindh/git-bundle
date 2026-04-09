import artifactClient, {type Artifact, type FindOptions, type UploadArtifactOptions} from '@actions/artifact';
import { context } from '@actions/github';
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

export class GithubApi {
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

  async listArtifacts() {
    return artifactClient.listArtifacts({latest: true});
  }

  async getArtifact(name: string): Promise<Artifact | null> {
    const result = await this.listArtifacts();
    return result.artifacts.find(artifact => artifact.name === name) ?? null;
  }

  async downloadArtifact(artifact: Artifact, targetDir: string): Promise<string> {
    const result = await artifactClient.downloadArtifact(artifact.id, {path: targetDir});

    if (!result?.downloadPath) {
      throw new Error(`Artifact download returned no path for "${artifact.name}".`);
    }

    // The artifact is downloaded and extracted to downloadPath.
    // When uploaded via uploadArtifact(name, files, rootDir), each file is placed at the artifact root.
    // For a bundle file at rootDir/bundleName, the downloaded path is downloadPath/bundleName.
    const bundlePath = join(result.downloadPath, artifact.name);
    this.debug(`Artifact extraction path: ${result.downloadPath}, bundle file path: ${bundlePath}`);
    return bundlePath;
  }

  async uploadArtifact(name: string, files: string[], rootDirectory: string, options?: UploadArtifactOptions) {
    return artifactClient.uploadArtifact(name, files, rootDirectory, options);
  }

  async deleteArtifact(artifactName: string, options?: FindOptions) {
    return artifactClient.deleteArtifact(artifactName, options);
  }
}


