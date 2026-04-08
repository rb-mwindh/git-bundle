import {jest} from '@jest/globals';
import * as os from 'node:os';
import {GithubApi} from '../src/lib/github-api.js';

export interface GithubApiHarnessOptions {
  inputs?: Record<string, string>;
  state?: string;
  contextSha?: string;
}

export function createGithubApiMock(): jest.Mocked<GithubApi> {
  return {
    getInput: jest.fn<GithubApi['getInput']>(),
    getState: jest.fn<GithubApi['getState']>(),
    saveState: jest.fn<GithubApi['saveState']>(),
    setOutput: jest.fn<GithubApi['setOutput']>(),
    setFailed: jest.fn<GithubApi['setFailed']>(),
    debug: jest.fn<GithubApi['debug']>(),
    info: jest.fn<GithubApi['info']>(),
    notice: jest.fn<GithubApi['notice']>(),
    warning: jest.fn<GithubApi['warning']>(),
    getContextSha: jest.fn<GithubApi['getContextSha']>(),
    listArtifacts: jest.fn<GithubApi['listArtifacts']>(),
    getArtifact: jest.fn<GithubApi['getArtifact']>(),
    downloadArtifact: jest.fn<GithubApi['downloadArtifact']>(),
    uploadArtifact: jest.fn<GithubApi['uploadArtifact']>(),
    deleteArtifact: jest.fn<GithubApi['deleteArtifact']>(),
  } as unknown as jest.Mocked<GithubApi>;
}

export function createGithubApiHarness(options: GithubApiHarnessOptions = {}) {
  const githubApi = createGithubApiMock();
  const inputs: Record<string, string> = {
    bundle: 'release',
    refs: 'refs/tags/*,refs/notes/*',
    path: process.cwd(),
    tempDir: os.tmpdir(),
    ...options.inputs,
  };

  githubApi.getInput.mockImplementation((name: string) => inputs[name] ?? '');
  githubApi.getState.mockReturnValue(options.state ?? JSON.stringify({'refs/tags/v1.0.0': 'old-sha'}));
  githubApi.getContextSha.mockReturnValue(options.contextSha ?? 'context-sha');
  githubApi.getArtifact.mockResolvedValue(null);
  githubApi.downloadArtifact.mockResolvedValue('/tmp/release');
  githubApi.deleteArtifact.mockResolvedValue(undefined as never);
  githubApi.uploadArtifact.mockResolvedValue(undefined as never);

  return {githubApi, inputs};
}

export function setupLogging(api: jest.Mocked<GithubApi>) {
  api.info.mockImplementation(message => process.stdout.write(`${message}\n`));
  api.debug.mockImplementation(message => process.stdout.write(`${message}\n`));
  api.notice.mockImplementation(message => process.stdout.write(`${message}\n`));
  api.warning.mockImplementation(message => process.stdout.write(`${message}\n`));
}