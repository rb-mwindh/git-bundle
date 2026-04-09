import {jest} from '@jest/globals';
import {GitBundleApi} from '../src/lib/git-bundle-api.js';

export function createGitBundleApiHarness() {
  const ensureGitRepository = jest.spyOn(GitBundleApi.prototype, 'ensureGitRepository').mockResolvedValue(undefined);
  const fetchTrackedRefs = jest.spyOn(GitBundleApi.prototype, 'fetchTrackedRefs').mockResolvedValue({
    wasShallow: false,
    fetchResult: {raw: 'Already up to date.'} as never,
  });
  const formatFetchResult = jest.spyOn(GitBundleApi.prototype, 'formatFetchResult').mockReturnValue('Already up to date.');
  const importBundle = jest.spyOn(GitBundleApi.prototype, 'importBundle').mockResolvedValue(undefined);
  const createSnapshot = jest.spyOn(GitBundleApi.prototype, 'createSnapshot').mockResolvedValue({'refs/tags/v1.0.0': 'new-sha'});
  const saveSnapshot = jest.spyOn(GitBundleApi.prototype, 'saveSnapshot').mockImplementation(() => undefined);
  const readSavedSnapshot = jest.spyOn(GitBundleApi.prototype, 'readSavedSnapshot').mockReturnValue({'refs/tags/v1.0.0': 'old-sha'});
  const diffSnapshots = jest.spyOn(GitBundleApi.prototype, 'diffSnapshots').mockReturnValue(['refs/tags/v1.0.0']);
  const getHeadSha = jest.spyOn(GitBundleApi.prototype, 'getHeadSha').mockResolvedValue('head-sha');
  const updateRef = jest.spyOn(GitBundleApi.prototype, 'updateRef').mockResolvedValue(undefined);
  const getCommitCountSince = jest.spyOn(GitBundleApi.prototype, 'getCommitCountSince').mockResolvedValue(1);
  const buildRevisionSpecs = jest.spyOn(GitBundleApi.prototype, 'buildRevisionSpecs').mockReturnValue(['spec']);
  const createBundle = jest.spyOn(GitBundleApi.prototype, 'createBundle').mockResolvedValue({created: false, bundlePath: '/tmp/release'});

  return {
    ensureGitRepository,
    fetchTrackedRefs,
    formatFetchResult,
    importBundle,
    createSnapshot,
    saveSnapshot,
    readSavedSnapshot,
    diffSnapshots,
    getHeadSha,
    updateRef,
    getCommitCountSince,
    buildRevisionSpecs,
    createBundle,
  };
}
