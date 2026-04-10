import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {GitBundleApi} from './git-bundle-api.js';
import {GitApi} from './git-api.js';
import {DEFAULT_TRACKED_REFS} from './git-api.js';
import {createGithubApiHarness} from '../../test/github-api.harness.js';

function createHarness() {
  const {githubApi} = createGithubApiHarness();

  return {
    api: new GitBundleApi(process.cwd(), githubApi),
    githubApi,
  };
}

describe('GitBundleApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('ensureGitRepository throws for non-repo directories', async () => {
    const {api} = createHarness();
    jest.spyOn(GitApi.prototype, 'checkIsRepo').mockResolvedValue(false);

    await expect(api.ensureGitRepository()).rejects.toThrow(
      'Git repository not found. Run actions/checkout before git-bundle.'
    );
  });

  it('fetchTrackedRefs performs regular fetch on non-shallow repositories', async () => {
    const {api} = createHarness();
    const buildFetchRefSpecs = jest
      .spyOn(GitApi.prototype, 'buildFetchRefSpecs')
      .mockReturnValue(['+refs/tags/*:refs/tags/*']);
    const isShallowRepository = jest
      .spyOn(GitApi.prototype, 'isShallowRepository')
      .mockResolvedValue(false);
    const fetch = jest
      .spyOn(GitApi.prototype, 'fetch')
      .mockResolvedValue({raw: 'Already up to date.'} as never);

    const result = await api.fetchTrackedRefs(['refs/tags/*']);

    expect(buildFetchRefSpecs).toHaveBeenCalledWith(['refs/tags/*']);
    expect(isShallowRepository).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(['+refs/tags/*:refs/tags/*']);
    expect(result.wasShallow).toBe(false);
  });

  it('fetchTrackedRefs falls back to regular fetch when unshallow fails', async () => {
    const {api} = createHarness();
    jest.spyOn(GitApi.prototype, 'buildFetchRefSpecs').mockReturnValue(['+refs/tags/*:refs/tags/*']);
    jest.spyOn(GitApi.prototype, 'isShallowRepository').mockResolvedValue(true);
    const fetchUnshallow = jest
      .spyOn(GitApi.prototype, 'fetchUnshallow')
      .mockRejectedValue(new Error('unshallow failed'));
    const fetch = jest
      .spyOn(GitApi.prototype, 'fetch')
      .mockResolvedValue({raw: 'fallback'} as never);

    const result = await api.fetchTrackedRefs(['refs/tags/*']);

    expect(fetchUnshallow).toHaveBeenCalledWith(['+refs/tags/*:refs/tags/*']);
    expect(fetch).toHaveBeenCalledWith(['+refs/tags/*:refs/tags/*']);
    expect(result.wasShallow).toBe(true);
    expect(result.unshallowError).toBe('unshallow failed');
  });

  it('uses default tracked refs when none are provided', async () => {
    const {api} = createHarness();
    const buildFetchRefSpecs = jest
      .spyOn(GitApi.prototype, 'buildFetchRefSpecs')
      .mockReturnValue([]);
    jest.spyOn(GitApi.prototype, 'isShallowRepository').mockResolvedValue(false);
    jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'ok'} as never);

    await api.fetchTrackedRefs();

    expect(buildFetchRefSpecs).toHaveBeenCalledWith(DEFAULT_TRACKED_REFS);
  });

  it('readSavedSnapshot warns and returns empty snapshot for invalid state JSON', () => {
    const {api, githubApi} = createHarness();
    githubApi.getState.mockReturnValue('not-json');

    const snapshot = api.readSavedSnapshot();

    expect(snapshot).toEqual({});
    expect(githubApi.warning).toHaveBeenCalledWith(
      'Snapshot state is invalid JSON. Using empty baseline for diff.'
    );
  });

  it('saveSnapshot stores state using githubApi', () => {
    const {api, githubApi} = createHarness();

    api.saveSnapshot({'refs/tags/v1.0.0': 'abc123'});

    expect(githubApi.saveState).toHaveBeenCalledWith(
      'git-bundle-snapshot',
      JSON.stringify({'refs/tags/v1.0.0': 'abc123'})
    );
  });

  it('buildRevisionSpecs returns empty list when no commits and no changed refs exist', async() => {
    const {api} = createHarness();

    const specs = await api.buildRevisionSpecs('base', 'refs/heads/release', []);

    expect(specs).toEqual([]);
  });

  it('getTransportRef and diffSnapshots provide bundle-level helper behavior', () => {
    const {api} = createHarness();

    expect(api.getTransportRef('release')).toBe('refs/heads/release');
    expect(api.diffSnapshots({'refs/tags/v1': 'a'}, {'refs/tags/v1': 'b'})).toEqual(['refs/tags/v1']);
  });

  describe('importBundle', () => {
    it('skips and logs notice when bundle has no valid refs', async () => {
      const {api, githubApi} = createHarness();
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue([]);

      await api.importBundle('/tmp/release', 'release');

      expect(githubApi.notice).toHaveBeenCalledWith(
        'No valid refs found in artifact "release". Import is skipped.'
      );
    });

    it('fetches refs and checks out resolved transport ref', async () => {
      const {api, githubApi} = createHarness();
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/release', 'refs/tags/v1']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'fetch-ok'} as never);
      jest.spyOn(GitApi.prototype, 'resolveRef').mockResolvedValue('abc123');
      const checkout = jest.spyOn(GitApi.prototype, 'checkout').mockResolvedValue(undefined as never);

      await api.importBundle('/tmp/release', 'release');

      expect(githubApi.info).toHaveBeenCalledWith(expect.stringContaining('refs/heads/release'));
      expect(checkout).toHaveBeenCalledWith('abc123');
    });

    it('throws when transport ref cannot be resolved after import', async () => {
      const {api} = createHarness();
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/release']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'ok'} as never);
      jest.spyOn(GitApi.prototype, 'resolveRef').mockResolvedValue(null);

      await expect(api.importBundle('/tmp/release', 'release'))
        .rejects
        .toThrow('Required ref "refs/heads/release" could not be resolved after importing bundle "/tmp/release".');
    });

    it('wraps fetch errors with context', async () => {
      const {api} = createHarness();
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/release']);
      jest.spyOn(GitApi.prototype, 'fetch').mockRejectedValue(new Error('network error'));

      await expect(api.importBundle('/tmp/release', 'release'))
        .rejects
        .toThrow('Failed to import Git bundle "/tmp/release": Error: network error');
    });

    it('wraps checkout errors with context', async () => {
      const {api} = createHarness();
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/release']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'ok'} as never);
      jest.spyOn(GitApi.prototype, 'resolveRef').mockResolvedValue('abc123');
      jest.spyOn(GitApi.prototype, 'checkout').mockRejectedValue(new Error('checkout failed'));

      await expect(api.importBundle('/tmp/release', 'release'))
        .rejects
        .toThrow('Transport ref "refs/heads/release" could not be checked out after importing bundle "/tmp/release".');
    });
  });
});
