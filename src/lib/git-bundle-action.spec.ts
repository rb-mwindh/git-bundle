import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {type Artifact} from './github-api.js';
import {GitBundleAction} from './git-bundle-action.js';
import {createGitBundleApiHarness} from '../../test/git-bundle-api.harness.js';
import {createGithubApiHarness} from '../../test/github-api.harness.js';
import {GitBundleApi} from './git-bundle-api.js';

function createHarness() {
  const {githubApi, inputs} = createGithubApiHarness();
  const apiHarness = createGitBundleApiHarness();

  return {
    action: new GitBundleAction(githubApi),
    githubApi,
    inputs,
    ...apiHarness,
  };
}

describe('GitBundleAction.main', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('throws when repository validation fails', async () => {
    const {action, ensureGitRepository} = createHarness();
    ensureGitRepository.mockRejectedValue(new Error('Git repository not found. Run actions/checkout before git-bundle.'));

    await expect(action.main()).rejects.toThrow(
      'Git repository not found. Run actions/checkout before git-bundle.'
    );
  });

  it('saves a snapshot when no previous artifact exists', async () => {
    const {action, fetchTrackedRefs, githubApi, saveSnapshot} = createHarness();

    await action.main();

    expect(fetchTrackedRefs).toHaveBeenCalledWith(['refs/tags/*', 'refs/notes/*', 'refs/heads/main']);
    expect(githubApi.getArtifact).toHaveBeenCalledWith('release');
    expect(githubApi.notice).toHaveBeenCalledWith(
      'No previous artifact named "release" found. This is expected in the first job.'
    );
    expect(saveSnapshot).toHaveBeenCalledWith({'refs/tags/v1.0.0': 'new-sha'});
  });

  it('includes contextRef tag in trackedRefs when it starts with refs/tags/', async () => {
    const {githubApi, inputs} = createGithubApiHarness({contextRef: 'refs/tags/v1.2.3'});
    const apiHarness = createGitBundleApiHarness();
    const action = new GitBundleAction(githubApi);

    await action.main();

    expect(apiHarness.fetchTrackedRefs).toHaveBeenCalledWith(
      expect.arrayContaining(['refs/tags/v1.2.3'])
    );
  });

  it('does not add contextRef to trackedRefs when it is not a branch or tag', async () => {
    const {githubApi} = createGithubApiHarness({contextRef: 'refs/pull/42/head'});
    const apiHarness = createGitBundleApiHarness();
    const action = new GitBundleAction(githubApi);

    await action.main();

    expect(apiHarness.fetchTrackedRefs).not.toHaveBeenCalledWith(
      expect.arrayContaining(['refs/pull/42/head'])
    );
  });

  it('downloads and imports an existing bundle artifact', async () => {
    const {action, importBundle, githubApi, inputs} = createHarness();
    const artifact = {
      id: 0,
      name: 'release',
      size: 0,
      digest: 'unknown'
    } as Artifact;
    githubApi.getArtifact.mockResolvedValue(artifact);
    githubApi.downloadArtifact.mockResolvedValue('/tmp/release');

    await action.main();

    expect(githubApi.getArtifact).toHaveBeenCalledWith('release');
    expect(githubApi.downloadArtifact).toHaveBeenCalledWith(artifact, inputs['tempDir']!);
    expect(importBundle).toHaveBeenCalledWith('/tmp/release', 'release');
  });
});

describe('GitBundleAction.post', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('skips upload when no bundle is created', async () => {
    const {action, updateRef, githubApi} = createHarness();
    jest.spyOn(GitBundleApi.prototype, 'createBundle').mockResolvedValue(false);

    await action.post();

    expect(updateRef).toHaveBeenCalledWith('refs/heads/release', 'head-sha');
    expect(githubApi.notice).toHaveBeenCalledWith(
      'No new bundle content for "release". Artifact upload is skipped by design.'
    );
    expect(githubApi.uploadArtifact).not.toHaveBeenCalled();
  });

  it('uploads bundle when createBundle returns created=true', async () => {
    jest.spyOn(GitBundleApi.prototype, 'createBundle').mockResolvedValue(true);
    const {action, createBundle, githubApi, inputs} = createHarness();
    createBundle.mockResolvedValue(true);
    githubApi.uploadArtifact.mockResolvedValue({id: 'release', size: 0, digest: 'unknown' });

    await action.post();

    expect(githubApi.deleteArtifact).toHaveBeenCalledWith('release');
    expect(githubApi.uploadArtifact).toHaveBeenCalledWith('release', ['C:\\temp\\release'], inputs['tempDir']!);
  });
});
