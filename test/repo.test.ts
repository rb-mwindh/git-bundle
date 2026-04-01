import {jest} from '@jest/globals';
import * as path from 'node:path';
const coreMock = {
  debug: jest.fn(),
  getState: jest.fn(),
  info: jest.fn(),
  notice: jest.fn(),
  saveState: jest.fn(),
  warning: jest.fn(),
};

const artifactMock = {
  deleteArtifact: jest.fn(),
  downloadArtifact: jest.fn(),
  getArtifact: jest.fn(),
  uploadArtifact: jest.fn(),
};

const githubMock = {
  context: {
    sha: 'context-sha',
  },
};

function createGitMock() {
  return {
    checkIsRepo: jest.fn<(...args: any[]) => Promise<any>>(),
    checkout: jest.fn<(...args: any[]) => Promise<any>>(),
    fetch: jest.fn<(...args: any[]) => Promise<any>>(),
    raw: jest.fn<(...args: any[]) => Promise<any>>(),
    revparse: jest.fn<(...args: any[]) => Promise<any>>(),
  };
}

let gitMock = createGitMock();
const simpleGitMock = jest.fn(() => gitMock);
const originalGithubWorkspace = process.env.GITHUB_WORKSPACE;
const originalRunnerTemp = process.env.RUNNER_TEMP;

jest.unstable_mockModule('@actions/core', () => coreMock);
jest.unstable_mockModule('@actions/artifact', () => ({default: artifactMock}));
jest.unstable_mockModule('@actions/github', () => githubMock);
jest.unstable_mockModule('simple-git', () => ({simpleGit: simpleGitMock}));

const {Repo} = await import('../src/lib/repo.js');

describe('Repo', () => {
  beforeEach(() => {
    gitMock = createGitMock();
    simpleGitMock.mockReset();
    simpleGitMock.mockImplementation(() => gitMock);
    process.env.GITHUB_WORKSPACE = originalGithubWorkspace;
    process.env.RUNNER_TEMP = originalRunnerTemp;

    for (const mock of Object.values(coreMock)) {
      mock.mockReset();
    }

    for (const mock of Object.values(artifactMock)) {
      mock.mockReset();
    }

    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.GITHUB_WORKSPACE = originalGithubWorkspace;
    process.env.RUNNER_TEMP = originalRunnerTemp;
  });

  it('prefers GITHUB_WORKSPACE when creating the git client', () => {
    process.env.GITHUB_WORKSPACE = 'C:/actions/workspace';

    new Repo();

    expect(simpleGitMock).toHaveBeenCalledWith(path.resolve('C:/actions/workspace'));
  });

  it('falls back to process.cwd when GITHUB_WORKSPACE is not set', () => {
    delete process.env.GITHUB_WORKSPACE;

    new Repo();

    expect(simpleGitMock).toHaveBeenCalledWith(process.cwd());
  });

  it('returns an empty revision list when there are no commits or changed refs', () => {
    const repo = new Repo() as unknown as {
      buildRevisionSpecs: (input: {
        githubSha: string;
        transportRef: string;
        changedRefs: string[];
        commitCount: number;
      }) => string[];
    };

    expect(
      repo.buildRevisionSpecs({
        githubSha: 'base',
        transportRef: 'refs/head/release',
        changedRefs: [],
        commitCount: 0,
      })
    ).toEqual([]);
  });

  it('builds deduplicated revision specs when commits and refs changed', () => {
    const repo = new Repo() as unknown as {
      buildRevisionSpecs: (input: {
        githubSha: string;
        transportRef: string;
        changedRefs: string[];
        commitCount: number;
      }) => string[];
    };

    expect(
      repo.buildRevisionSpecs({
        githubSha: 'base',
        transportRef: 'refs/head/release',
        changedRefs: ['refs/tags/v1.0.0', 'refs/head/release', 'refs/notes/ci'],
        commitCount: 3,
      })
    ).toEqual([
      'base..refs/head/release',
      'refs/head/release',
      'refs/tags/v1.0.0',
      'refs/notes/ci',
    ]);
  });

  it('fetches tags normally when the repository is already deep', async () => {
    gitMock.revparse.mockResolvedValue('false\n');
    gitMock.fetch.mockResolvedValue(undefined);

    const repo = new Repo() as unknown as {ensureDeepFetched: () => Promise<void>};
    await repo.ensureDeepFetched();

    expect(gitMock.fetch).toHaveBeenCalledWith(['--tags']);
    expect(coreMock.info).not.toHaveBeenCalled();
  });

  it('warns when --unshallow fails', async () => {
    gitMock.revparse.mockResolvedValue('true\n');
    gitMock.fetch.mockRejectedValueOnce(new Error('server does not support --unshallow'));

    const repo = new Repo() as unknown as {ensureDeepFetched: () => Promise<void>};
    await repo.ensureDeepFetched();

    expect(coreMock.info).toHaveBeenCalledWith('Repository is shallow. Fetching complete history...');
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining('Repository may remain shallow.')
    );
    expect(gitMock.fetch).toHaveBeenNthCalledWith(1, ['--unshallow', '--tags']);
    expect(gitMock.fetch).toHaveBeenCalledTimes(1);
  });

  it('filters bundle heads down to fully qualified refs only', async () => {
    gitMock.raw.mockResolvedValue([
      '1234567890 refs/head/release',
      '1234567890 HEAD',
      'abcdef1234 refs/tags/v1.0.0',
      '',
    ].join('\n'));

    const repo = new Repo() as unknown as {
      fileExists: (filePath: string) => Promise<boolean>;
      listBundleRefs: (bundlePath: string) => Promise<string[]>;
    };
    jest.spyOn(repo, 'fileExists').mockResolvedValue(true);

    await expect(repo.listBundleRefs('C:/tmp/release.bundle')).resolves.toEqual([
      'refs/head/release',
      'refs/tags/v1.0.0',
    ]);
  });

  it('treats empty-bundle git errors as a no-op', async () => {
    gitMock.raw.mockRejectedValue(new Error('Refusing to create empty bundle'));

    const repo = new Repo() as unknown as {
      tryCreateBundle: (bundlePath: string, revisionSpecs: string[]) => Promise<boolean>;
    };

    await expect(repo.tryCreateBundle('C:/tmp/release.bundle', ['refs/head/release'])).resolves.toBe(false);
    expect(coreMock.notice).toHaveBeenCalledWith('No bundle content needs to be created for this job.');
  });

  it('skips artifact upload when no bundle content was created', async () => {
    const repo = new Repo() as unknown as {
      post: (bundleName: string) => Promise<void>;
      createSnapshot: () => Promise<{tags: Record<string, string>; notes: Record<string, string>}>;
      ensureRepository: () => Promise<void>;
      getCommitCountSince: (baseSha: string, targetRef: string) => Promise<number>;
      getHeadSha: () => Promise<string>;
      getTransportRef: (bundleName: string) => string;
      readSavedSnapshot: () => {tags: Record<string, string>; notes: Record<string, string>};
      tryCreateBundle: (bundlePath: string, revisionSpecs: string[]) => Promise<boolean>;
      updateRef: (ref: string, sha: string) => Promise<void>;
      uploadArtifact: (bundleName: string, files: string[], rootDir: string) => Promise<void>;
    };

    coreMock.getState.mockReturnValue('saved-sha');
    jest.spyOn(repo, 'ensureRepository').mockResolvedValue(undefined);
    jest.spyOn(repo, 'readSavedSnapshot').mockReturnValue({tags: {}, notes: {}});
    jest.spyOn(repo, 'createSnapshot').mockResolvedValue({tags: {}, notes: {}});
    jest.spyOn(repo, 'getHeadSha').mockResolvedValue('head-sha');
    jest.spyOn(repo, 'getTransportRef').mockReturnValue('refs/head/release');
    jest.spyOn(repo, 'updateRef').mockResolvedValue(undefined);
    jest.spyOn(repo, 'getCommitCountSince').mockResolvedValue(0);
    jest.spyOn(repo, 'tryCreateBundle').mockResolvedValue(false);
    const uploadArtifactSpy = jest.spyOn(repo, 'uploadArtifact').mockResolvedValue(undefined);

    await repo.post('release');

    expect(uploadArtifactSpy).not.toHaveBeenCalled();
    expect(coreMock.notice).toHaveBeenCalledWith('No new bundle content for "release". Artifact upload is skipped.');
  });
});





