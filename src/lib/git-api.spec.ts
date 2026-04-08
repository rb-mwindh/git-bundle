import {describe, it, expect, beforeEach, jest} from '@jest/globals';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {type FetchResult } from 'simple-git';
import {DEFAULT_TRACKED_REFS, GitApi, GitClient} from './git-api.js';

function createGitMock() {
  return {
    checkIsRepo: jest.fn(),
    revparse: jest.fn(),
    fetch: jest.fn(),
    raw: jest.fn(),
    checkout: jest.fn(),
  } as unknown as jest.Mocked<GitClient>;
}

function createHarness() {
  const git = createGitMock();
  const api = new GitApi(git);
  return {git, api};
}

describe('GitApi', () => {
  let git: ReturnType<typeof createGitMock>;
  let api: GitApi;

  beforeEach(() => {
    ({git, api} = createHarness());
  });

  describe('checkIsRepo', () => {
    it('returns true when git reports repository context', async () => {
      git.checkIsRepo.mockResolvedValue(true);

      await expect(api.checkIsRepo()).resolves.toBe(true);
      expect(git.checkIsRepo).toHaveBeenCalledTimes(1);
    });

    it('returns false when git reports non-repository context', async () => {
      git.checkIsRepo.mockResolvedValue(false);

      await expect(api.checkIsRepo()).resolves.toBe(false);
    });
  });

  describe('isShallowRepository', () => {
    it('returns true when revparse reports true', async () => {
      git.revparse.mockResolvedValue('true\n');

      await expect(api.isShallowRepository()).resolves.toBe(true);
      expect(git.revparse).toHaveBeenCalledWith(['--is-shallow-repository']);
    });

    it('returns false when revparse reports false', async () => {
      git.revparse.mockResolvedValue('false');

      await expect(api.isShallowRepository()).resolves.toBe(false);
    });
  });

  describe('buildFetchRefSpecs', () => {
    it('builds force refspecs from provided refs', () => {
      expect(api.buildFetchRefSpecs(['refs/heads/*'])).toEqual(['+refs/heads/*:refs/heads/*']);
    });

    it('uses default tracked refs when omitted', () => {
      expect(api.buildFetchRefSpecs()).toEqual(DEFAULT_TRACKED_REFS.map(ref => `+${ref}:${ref}`));
    });

    it('returns empty array for empty input', () => {
      expect(api.buildFetchRefSpecs([])).toEqual([]);
    });
  });

  describe('fetch', () => {
    it('calls force fetch with origin and supplied refspecs', async () => {
      const fetchResult = {raw: 'ok'} as FetchResult;
      git.fetch.mockResolvedValue(fetchResult);

      await expect(api.fetch(['+refs/tags/*:refs/tags/*'])).resolves.toBe(fetchResult);
      expect(git.fetch).toHaveBeenCalledWith(['--force', 'origin', '+refs/tags/*:refs/tags/*']);
    });

    it('calls force fetch with origin when no refspecs are supplied', async () => {
      git.fetch.mockResolvedValue({raw: ''} as FetchResult);

      await api.fetch();
      expect(git.fetch).toHaveBeenCalledWith(['--force', 'origin']);
    });
  });

  describe('fetchUnshallow', () => {
    it('calls unshallow force fetch with supplied refspecs', async () => {
      git.fetch.mockResolvedValue({raw: ''} as FetchResult);

      await api.fetchUnshallow(['+refs/tags/*:refs/tags/*']);
      expect(git.fetch).toHaveBeenCalledWith(['--force', '--unshallow', 'origin', '+refs/tags/*:refs/tags/*']);
    });

    it('calls unshallow force fetch without refspecs', async () => {
      git.fetch.mockResolvedValue({raw: ''} as FetchResult);

      await api.fetchUnshallow();
      expect(git.fetch).toHaveBeenCalledWith(['--force', '--unshallow', 'origin']);
    });
  });

  describe('importBundle', () => {
    it('skips import when list-heads contains no fully qualified refs', async () => {
      git.raw.mockResolvedValue('123 HEAD\n');

      await expect(api.importBundle('/tmp/bundle', 'refs/heads/main')).resolves.toEqual({
        bundleRefs: [],
        skipped: true,
      });
      expect(git.fetch).not.toHaveBeenCalled();
      expect(git.checkout).not.toHaveBeenCalled();
    });

    it('imports only fully qualified refs and checks out resolved transport head', async () => {
      git.raw.mockResolvedValue('123 refs/heads/main\n123 HEAD\n999 refs/tags/v1.2.3\n');
      git.fetch.mockResolvedValue({raw: 'fetch-ok'} as FetchResult);
      git.revparse.mockResolvedValue('abc123\n');

      await expect(api.importBundle('/tmp/bundle', 'refs/heads/main')).resolves.toEqual({
        bundleRefs: ['refs/heads/main', 'refs/tags/v1.2.3'],
        skipped: false,
        fetchRaw: 'fetch-ok',
        transportedHead: 'abc123',
      });
      expect(git.fetch).toHaveBeenCalledWith(['/tmp/bundle', 'refs/heads/main', 'refs/tags/v1.2.3']);
      expect(git.checkout).toHaveBeenCalledWith(['--force', 'abc123']);
    });

    it('throws when transport ref cannot be resolved after import', async () => {
      git.raw.mockResolvedValue('123 refs/heads/main\n');
      git.fetch.mockResolvedValue({raw: 'ok'} as FetchResult);
      git.revparse.mockResolvedValue('   ');

      await expect(api.importBundle('/tmp/bundle', 'refs/heads/missing'))
        .rejects
        .toThrow('Required ref "refs/heads/missing" could not be resolved after bundle import.');
    });

    it('wraps bundle list errors with context', async () => {
      git.raw.mockRejectedValue(new Error('permission denied'));

      await expect(api.importBundle('/tmp/bundle', 'refs/heads/main'))
        .rejects
        .toThrow('Failed to list Git bundle refs. permission denied');
    });
  });

  describe('createSnapshot', () => {
    it('returns parsed refs from for-each-ref output', async () => {
      git.raw.mockResolvedValue('abc refs/tags/v1\n\ndef refs/notes/x\n');

      await expect(api.createSnapshot(['refs/tags/*', 'refs/notes/*'])).resolves.toEqual({
        'refs/tags/v1': 'abc',
        'refs/notes/x': 'def',
      });
      expect(git.raw).toHaveBeenCalledWith([
        'for-each-ref',
        '--format=%(objectname) %(refname)',
        'refs/tags/*',
        'refs/notes/*',
      ]);
    });

    it('uses default tracked refs when none are supplied', async () => {
      git.raw.mockResolvedValue('');

      await api.createSnapshot();
      expect(git.raw).toHaveBeenCalledWith([
        'for-each-ref',
        '--format=%(objectname) %(refname)',
        ...DEFAULT_TRACKED_REFS,
      ]);
    });

    it('ignores malformed lines', async () => {
      git.raw.mockResolvedValue('abc refs/tags/v1\nmalformed\n');

      await expect(api.createSnapshot()).resolves.toEqual({'refs/tags/v1': 'abc'});
    });

    it('returns empty snapshot when git command fails', async () => {
      git.raw.mockRejectedValue(new Error('namespace missing'));

      await expect(api.createSnapshot()).resolves.toEqual({});
    });
  });

  describe('getHeadSha', () => {
    it('returns trimmed HEAD sha', async () => {
      git.revparse.mockResolvedValue('deadbeef\n');

      await expect(api.getHeadSha()).resolves.toBe('deadbeef');
      expect(git.revparse).toHaveBeenCalledWith(['HEAD']);
    });
  });

  describe('updateRef', () => {
    it('updates ref using git raw', async () => {
      git.raw.mockResolvedValue('');

      await api.updateRef('refs/heads/main', 'abc123');
      expect(git.raw).toHaveBeenCalledWith(['update-ref', 'refs/heads/main', 'abc123']);
    });
  });

  describe('getCommitCountSince', () => {
    it('returns parsed commit count', async () => {
      git.raw.mockResolvedValue('42\n');

      await expect(api.getCommitCountSince('base', 'target')).resolves.toBe(42);
      expect(git.raw).toHaveBeenCalledWith(['rev-list', '--count', 'base..target']);
    });

    it.each(['', 'NaN', 'not-a-number'])('returns zero for non-numeric output (%s)', async (output) => {
      git.raw.mockResolvedValue(output);

      await expect(api.getCommitCountSince('base', 'target')).resolves.toBe(0);
    });

    it('returns zero when git command fails', async () => {
      git.raw.mockRejectedValue(new Error('bad revision'));

      await expect(api.getCommitCountSince('base', 'target')).resolves.toBe(0);
    });
  });

  describe('createBundle', () => {
    it('returns created=false when revision specs are empty', async () => {
      await expect(api.createBundle('/tmp/empty.bundle', [])).resolves.toEqual({
        created: false,
        bundlePath: '/tmp/empty.bundle',
      });
      expect(git.raw).not.toHaveBeenCalled();
    });

    it('returns created=true when bundle file has content', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'git-api-'));
      const bundlePath = join(tempDir, 'repo.bundle');
      await writeFile(bundlePath, 'data');

      git.raw.mockResolvedValue('');

      await expect(api.createBundle(bundlePath, ['refs/heads/main'])).resolves.toEqual({
        created: true,
        bundlePath,
      });
      expect(git.raw).toHaveBeenCalledWith(['bundle', 'create', bundlePath, 'refs/heads/main']);

      await rm(tempDir, {recursive: true, force: true});
    });

    it('returns created=false when bundle file is empty', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'git-api-'));
      const bundlePath = join(tempDir, 'repo.bundle');
      await writeFile(bundlePath, '');

      git.raw.mockResolvedValue('');

      await expect(api.createBundle(bundlePath, ['refs/heads/main'])).resolves.toEqual({
        created: false,
        bundlePath,
      });

      await rm(tempDir, {recursive: true, force: true});
    });

    it.each([
      'Refusing to create empty bundle',
      'no new commits',
      'no new revisions',
    ])('returns created=false for known empty bundle error: %s', async (message) => {
      git.raw.mockRejectedValue(new Error(message));

      await expect(api.createBundle('/tmp/repo.bundle', ['refs/heads/main'])).resolves.toEqual({
        created: false,
        bundlePath: '/tmp/repo.bundle',
      });
    });

    it('rethrows unknown errors', async () => {
      git.raw.mockRejectedValue(new Error('unexpected failure'));

      await expect(api.createBundle('/tmp/repo.bundle', ['refs/heads/main']))
        .rejects
        .toThrow('unexpected failure');
    });
  });
});
