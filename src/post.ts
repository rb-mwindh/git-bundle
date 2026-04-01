import * as core from '@actions/core';
import {repo} from './lib/repo.js';

(async () => {
  const bundleName = core.getInput('bundle', {required: false}) || 'release';
  await repo.post(bundleName);
})().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.warning(`POST execution failed: ${message}`);
});