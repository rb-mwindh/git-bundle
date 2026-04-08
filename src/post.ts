import * as core from '@actions/core';
import {GitBundleAction} from './lib/git-bundle-action.js';

new GitBundleAction().post().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
