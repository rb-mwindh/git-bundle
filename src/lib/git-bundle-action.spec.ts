import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {type Artifact} from '@actions/artifact';
import {GitBundleAction} from './git-bundle-action.js';
import {createGitBundleApiHarness} from '../../test/git-bundle-api.harness.js';
import {createGithubApiHarness} from '../../test/github-api.harness.js';

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

    expect(fetchTrackedRefs).toHaveBeenCalledWith(['refs/tags/*', 'refs/notes/*']);
    expect(githubApi.getArtifact).toHaveBeenCalledWith('release');
    expect(githubApi.notice).toHaveBeenCalledWith(
      'No previous artifact named "release" found. This is expected in the first job.'
    );
    expect(saveSnapshot).toHaveBeenCalledWith({'refs/tags/v1.0.0': 'new-sha'});
  });

  it('downloads and imports an existing bundle artifact', async () => {
    const {action, importBundle, githubApi, inputs} = createHarness();
    const artifact = {
      id: 1,
      name: 'release',
      size: 1,
      createdAt: new Date('2026-04-07'),
      digest: 'sha256:test',
    } as Artifact;
    githubApi.getArtifact.mockResolvedValue(artifact);

    await action.main();

    expect(githubApi.downloadArtifact).toHaveBeenCalledWith(artifact, inputs['tempDir']!);
    expect(importBundle).toHaveBeenCalledWith('/tmp/release', 'release');
    expect(githubApi.debug).toHaveBeenCalledWith('--TEST--');
  });
});

describe('GitBundleAction.post', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('skips upload when no bundle is created', async () => {
    const {action, updateRef, githubApi} = createHarness();

    await action.post();

    expect(updateRef).toHaveBeenCalledWith('refs/heads/release', 'head-sha');
    expect(githubApi.notice).toHaveBeenCalledWith(
      'No new bundle content for "release". Artifact upload is skipped by design.'
    );
    expect(githubApi.uploadArtifact).not.toHaveBeenCalled();
  });

  it('uploads bundle when createBundle returns created=true', async () => {
    const {action, createBundle, githubApi, inputs} = createHarness();
    createBundle.mockResolvedValue({created: true, bundlePath: '/tmp/release'});

    await action.post();

    expect(githubApi.deleteArtifact).toHaveBeenCalledWith('release');
    expect(githubApi.uploadArtifact).toHaveBeenCalledWith('release', ['/tmp/release'], inputs['tempDir']!);
  });
});
