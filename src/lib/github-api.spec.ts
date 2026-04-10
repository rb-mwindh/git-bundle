import {afterEach, describe, expect, it, jest} from '@jest/globals';
import artifactClient, {type Artifact} from '@actions/artifact';
import {GithubApi} from './github-api.js';

describe('GithubApi', () => {
  const api = new GithubApi();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an artifact when found', async () => {
    const artifact = {
      id: 123,
      name: 'release',
      size: 1024,
      createdAt: new Date('2026-04-07'),
      digest: 'sha256:abc',
    } as Artifact;

    jest.spyOn(artifactClient, 'listArtifacts').mockResolvedValue({
      artifacts: [artifact],
    } as never);

    const result = await api.getArtifact('release');

    expect(result).toEqual(artifact);
    expect(artifactClient.listArtifacts).toHaveBeenCalledWith({latest: true});
  });

  it('returns null when no artifact matches', async () => {
    jest.spyOn(artifactClient, 'listArtifacts').mockResolvedValue({
      artifacts: [],
    } as never);

    const result = await api.getArtifact('missing');

    expect(result).toBeNull();
  });

  it('downloads an artifact and returns the extracted path', async () => {
    const artifact = {
      id: 123,
      name: 'my-bundle',
      size: 1024,
      createdAt: new Date('2026-04-07'),
      digest: 'sha256:abc',
    } as Artifact;

    jest.spyOn(artifactClient, 'downloadArtifact').mockResolvedValue({
      downloadPath: '/tmp/artifacts',
    } as never);

    const result = await api.downloadArtifact(artifact, '/download');

    expect(result).toMatch(/my-bundle$/);
    expect(artifactClient.downloadArtifact).toHaveBeenCalledWith(123, {path: '/download'});
  });

  it('throws when artifact download returns no path', async () => {
    const artifact = {
      id: 456,
      name: 'broken',
      size: 100,
      createdAt: new Date('2026-04-07'),
      digest: 'sha256:xyz',
    } as Artifact;

    jest.spyOn(artifactClient, 'downloadArtifact').mockResolvedValue({
      downloadPath: undefined,
    } as never);

    await expect(api.downloadArtifact(artifact, '/tmp')).rejects.toThrow(
      'Artifact download returned no path for "broken".'
    );
  });
});



