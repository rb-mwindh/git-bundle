import * as core from '@actions/core';
import {repo} from './lib/repo.js';

(async () => {
  const bundleName = core.getInput('bundle', {required: false}) || 'release';
  await repo.main(bundleName);
})().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
