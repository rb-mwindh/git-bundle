import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {GitBundleApi} from './git-bundle-api.js';
import {GitApi} from './git-api.js';
import {DEFAULT_TRACKED_REFS} from './git-api.js';
import {createGithubApiHarness} from '../../test/github-api.harness.js';

function createHarness(contextRef = 'refs/heads/main') {
  const {githubApi} = createGithubApiHarness({contextRef});

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

    const specs = await api.buildRevisionSpecs('base', 'refs/git-bundle/transport', []);

    expect(specs).toEqual([]);
  });

  it('getTransportRef and diffSnapshots provide bundle-level helper behavior', () => {
    const {api} = createHarness();

    expect(api.getTransportRef()).toBe('refs/git-bundle/transport');
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

    it('detaches HEAD before import when current head ref is included in bundle refs', async () => {
      const {api} = createHarness('refs/heads/feature-x');
      jest.spyOn(GitApi.prototype, 'getHeadRef').mockResolvedValue('refs/heads/feature-x');
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/feature-x', 'refs/heads/release']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'ok'} as never);
      jest.spyOn(GitApi.prototype, 'showRef').mockResolvedValue('');
      jest.spyOn(GitApi.prototype, 'resolveRef').mockResolvedValue('abc123');
      const checkout = jest.spyOn(GitApi.prototype, 'checkout').mockResolvedValue(undefined as never);

      await api.importBundle('/tmp/release', 'release');

      expect(checkout).toHaveBeenNthCalledWith(1, 'HEAD', {detach: true});
    });

    it('does not detach HEAD when current head ref is not included in bundle refs', async () => {
      const {api} = createHarness('refs/heads/feature-x');
      jest.spyOn(GitApi.prototype, 'getHeadRef').mockResolvedValue('refs/heads/other');
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/feature-x', 'refs/heads/release']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'ok'} as never);
      jest.spyOn(GitApi.prototype, 'showRef').mockResolvedValue('');
      jest.spyOn(GitApi.prototype, 'resolveRef').mockResolvedValue('abc123');
      const checkout = jest.spyOn(GitApi.prototype, 'checkout').mockResolvedValue(undefined as never);

      await api.importBundle('/tmp/release', 'release');

      expect(checkout).toHaveBeenNthCalledWith(1, 'feature-x');
      const headCheckoutCalls = checkout.mock.calls.filter(([ref]) => ref === 'HEAD');
      expect(headCheckoutCalls).toHaveLength(0);
    });

    it('checks out contextRef branch by short name when it resolves first', async () => {
      const {api} = createHarness('refs/heads/feature-x');
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/release', 'refs/tags/v1']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'fetch-ok'} as never);
      jest.spyOn(GitApi.prototype, 'showRef').mockResolvedValue('');
      jest.spyOn(GitApi.prototype, 'resolveRef').mockResolvedValue('abc123');
      const checkout = jest.spyOn(GitApi.prototype, 'checkout').mockResolvedValue(undefined as never);

      await api.importBundle('/tmp/release', 'release');

      // contextRef is refs/heads/feature-x, so checkout should use the short branch name
      expect(checkout).toHaveBeenCalledWith('feature-x');
    });

    it('checks out transport ref by resolved SHA when contextRef does not resolve', async () => {
      const {api} = createHarness('refs/heads/main');
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/release']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'ok'} as never);
      jest.spyOn(GitApi.prototype, 'showRef').mockResolvedValue('');
      jest.spyOn(GitApi.prototype, 'resolveRef')
        .mockResolvedValueOnce(null)       // contextRef (refs/heads/main) not resolved
        .mockResolvedValueOnce('def456');  // transportRef (refs/git-bundle/transport) resolved
      const checkout = jest.spyOn(GitApi.prototype, 'checkout').mockResolvedValue(undefined as never);

      await api.importBundle('/tmp/release', 'release');

      expect(checkout).toHaveBeenCalledWith('def456');
    });

    it('checks out tag ref by full ref name', async () => {
      const {api} = createHarness('refs/tags/v1.2.3');
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/tags/v1.2.3']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'ok'} as never);
      jest.spyOn(GitApi.prototype, 'showRef').mockResolvedValue('');
      jest.spyOn(GitApi.prototype, 'resolveRef').mockResolvedValue('tagsha');
      const checkout = jest.spyOn(GitApi.prototype, 'checkout').mockResolvedValue(undefined as never);

      await api.importBundle('/tmp/release', 'release');

      expect(checkout).toHaveBeenCalledWith('refs/tags/v1.2.3');
    });

    it('checks out by SHA when candidate ref is not heads or tags', async () => {
      const {api} = createHarness('refs/pull/42/head');
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/release']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'ok'} as never);
      jest.spyOn(GitApi.prototype, 'showRef').mockResolvedValue('');
      jest.spyOn(GitApi.prototype, 'resolveRef')
        .mockResolvedValueOnce('prsha')   // contextRef resolved to SHA
        .mockResolvedValueOnce('def456'); // transportRef (not reached)
      const checkout = jest.spyOn(GitApi.prototype, 'checkout').mockResolvedValue(undefined as never);

      await api.importBundle('/tmp/release', 'release');

      expect(checkout).toHaveBeenCalledWith('prsha');
    });

    it('throws when neither contextRef nor transportRef can be resolved after import', async () => {
      const {api} = createHarness('refs/heads/main');
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/release']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'ok'} as never);
      jest.spyOn(GitApi.prototype, 'showRef').mockResolvedValue('');
      jest.spyOn(GitApi.prototype, 'resolveRef').mockResolvedValue(null);

      await expect(api.importBundle('/tmp/release', 'release'))
        .rejects
        .toThrow('Neither context ref "refs/heads/main" nor transport ref "refs/git-bundle/transport" could be resolved');
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
      const {api} = createHarness('refs/heads/main');
      jest.spyOn(GitApi.prototype, 'listBundleRefs').mockResolvedValue(['refs/heads/release']);
      jest.spyOn(GitApi.prototype, 'fetch').mockResolvedValue({raw: 'ok'} as never);
      jest.spyOn(GitApi.prototype, 'showRef').mockResolvedValue('');
      jest.spyOn(GitApi.prototype, 'resolveRef').mockResolvedValue('abc123');
      jest.spyOn(GitApi.prototype, 'checkout').mockRejectedValue(new Error('checkout failed'));

      await expect(api.importBundle('/tmp/release', 'release'))
        .rejects
        .toThrow('Checkout candidate "refs/heads/main" could not be checked out after importing bundle "/tmp/release".');
    });
  });
});
