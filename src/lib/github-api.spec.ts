import {afterEach, describe, expect, it, jest} from '@jest/globals';
import artifact, {type ArtifactClient} from '@actions/artifact';
import {GithubApi} from './github-api.js';

describe('GithubApi', () => {
  function createApi() {
    const client: jest.Mocked<ArtifactClient> = {
      uploadArtifact: jest.fn(),
      downloadArtifact: jest.fn(),
      downloadAllArtifacts: jest.fn(),
    };
    jest.spyOn(artifact, 'create').mockReturnValue(client);
    return {api: new GithubApi(), client};
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an artifact when found', async () => {
    const {api, client} = createApi();
    client.downloadArtifact.mockResolvedValue({
      artifactName: 'release',
      downloadPath: '/tmp/artifacts',
    });

    const result = await api.getArtifact('release');

    expect(result).toEqual({id: 0, name: 'release', size: 0, createdAt: undefined, digest: 'unknown'});
    expect(client.downloadArtifact).toHaveBeenCalledWith('release', expect.any(String));
  });

  it('returns null when no artifact matches', async () => {
    const {api, client} = createApi();
    client.downloadArtifact.mockRejectedValue(
      new Error('Unable to find an artifact with the name: missing')
    );

    const result = await api.getArtifact('missing');

    expect(result).toBeNull();
  });

  it('downloads an artifact and returns the extracted path', async () => {
    const {api, client} = createApi();
    client.downloadArtifact.mockResolvedValue({
      artifactName: 'my-bundle',
      downloadPath: '/tmp/artifacts',
    });

    const artifact = {id: 0, name: 'my-bundle', size: 0, createdAt: undefined, digest: 'unknown'};
    const result = await api.downloadArtifact(artifact, '/download');

    expect(result).toMatch(/my-bundle$/);
    expect(client.downloadArtifact).toHaveBeenCalledWith('my-bundle', '/download');
  });

  it('throws when artifact download returns no path', async () => {
    const {api, client} = createApi();
    client.downloadArtifact.mockResolvedValue({
      artifactName: 'broken',
      downloadPath: undefined,
    } as never);

    const artifact = {id: 0, name: 'broken', size: 0, createdAt: undefined, digest: 'unknown'};
    await expect(api.downloadArtifact(artifact, '/tmp')).rejects.toThrow(
      'Artifact download returned no path for "broken".'
    );
  });
});



