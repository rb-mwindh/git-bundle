# [2.2.0-rc.2](https://github.com/rb-mwindh/git-bundle/compare/v2.2.0-rc.1...v2.2.0-rc.2) (2026-04-16)


### Features

* **git-api:** add logger-based outputHandler integration ([9b4eb11](https://github.com/rb-mwindh/git-bundle/commit/9b4eb11e4372f5af7ad1f454e8235369df563757))
* **git-bundle-api:** detach HEAD when importing tracked head refs ([a5c32e9](https://github.com/rb-mwindh/git-bundle/commit/a5c32e94d24690a8b23f405b9aeaa37fd54a3f7e))

# [2.2.0-rc.1](https://github.com/rb-mwindh/git-bundle/compare/v2.1.0...v2.2.0-rc.1) (2026-04-15)


### Features

* **git-bundle:** enhance trackedRefs to include contextRef when applicable ([54c2469](https://github.com/rb-mwindh/git-bundle/commit/54c2469ab59d8917d1fbd502c533aaab3ca12b1e))

# [2.1.0](https://github.com/rb-mwindh/git-bundle/compare/v2.0.2...v2.1.0) (2026-04-15)


### Bug Fixes

* **tsconfig:** remove exactOptionalPropertyTypes to allow undefined in optional properties ([7c37921](https://github.com/rb-mwindh/git-bundle/commit/7c37921d2b6982e226bd240cb27a70652f7859c2))


### Features

* **git-bundle:** prioritize contextRef checkout and auto-track branch/tag refs ([255b8e5](https://github.com/rb-mwindh/git-bundle/commit/255b8e5e698499f409c514f2cbc89e950e727b0c))
* **github-api:** add getContextRef() to expose github.context.ref ([37dc27a](https://github.com/rb-mwindh/git-bundle/commit/37dc27a8c3b0d4e03ac27664603dd936cf1bbb05))

# [2.1.0-rc.1](https://github.com/rb-mwindh/git-bundle/compare/v2.0.2...v2.1.0-rc.1) (2026-04-15)


### Bug Fixes

* **tsconfig:** remove exactOptionalPropertyTypes to allow undefined in optional properties ([7c37921](https://github.com/rb-mwindh/git-bundle/commit/7c37921d2b6982e226bd240cb27a70652f7859c2))


### Features

* **git-bundle:** prioritize contextRef checkout and auto-track branch/tag refs ([255b8e5](https://github.com/rb-mwindh/git-bundle/commit/255b8e5e698499f409c514f2cbc89e950e727b0c))
* **github-api:** add getContextRef() to expose github.context.ref ([37dc27a](https://github.com/rb-mwindh/git-bundle/commit/37dc27a8c3b0d4e03ac27664603dd936cf1bbb05))

## [2.0.2](https://github.com/rb-mwindh/git-bundle/compare/v2.0.1...v2.0.2) (2026-04-13)


### Bug Fixes

* **github-api:** adapt `github-api` to `@actions/artifact@^1` API ([e17afa8](https://github.com/rb-mwindh/git-bundle/commit/e17afa80f1372a673061949bd55e2fdcf5335a2d))

## [2.0.2-rc.1](https://github.com/rb-mwindh/git-bundle/compare/v2.0.1...v2.0.2-rc.1) (2026-04-13)


### Bug Fixes

* **github-api:** adapt `github-api` to `@actions/artifact@^1` API ([e17afa8](https://github.com/rb-mwindh/git-bundle/commit/e17afa80f1372a673061949bd55e2fdcf5335a2d))

## [2.0.1](https://github.com/rb-mwindh/git-bundle/compare/v2.0.0...v2.0.1) (2026-04-13)


### Bug Fixes

* **deps:** downgrade `@actions/artifact` to v1 for GHES compatibility ([98a9d3b](https://github.com/rb-mwindh/git-bundle/commit/98a9d3b384e57c7272daaa5906fd2584833641e3))

# [2.0.0](https://github.com/rb-mwindh/git-bundle/compare/v1.0.0...v2.0.0) (2026-04-10)


* feat(git)!: return structured bundle creation result and handle upload failures ([10d48d0](https://github.com/rb-mwindh/git-bundle/commit/10d48d06572cc911da8f0744173d44ab7b22fcd9))
* refactor(git)!: move bundle import flow into GitBundleApi ([f112e90](https://github.com/rb-mwindh/git-bundle/commit/f112e909005181c9e51b9055b8a461154ea65c20))


### Bug Fixes

* **git-bundle:** validate and convert bundle refs to fetch refspecs ([25952d9](https://github.com/rb-mwindh/git-bundle/commit/25952d9dfab4d5163688a74236c16fa304bf8a9b))
* **github-api:** add diagnostic logging for artifact download path ([c5b5061](https://github.com/rb-mwindh/git-bundle/commit/c5b5061ebad501d8fcf31e4db76f79d257948313))


### Features

* **action:** rework implementation layers ([bd24fa0](https://github.com/rb-mwindh/git-bundle/commit/bd24fa096a205872bce6051af2ac975cfbfa8e1c))
* **action:** use `main` instead of `pre` ([c626206](https://github.com/rb-mwindh/git-bundle/commit/c626206137cdf3b9c24da4a2c644321210b77ab7))
* **git-api:** allow fetch origin override for bundle imports ([5d93e9a](https://github.com/rb-mwindh/git-bundle/commit/5d93e9addcdf14e4f09c7ed115edf095cf70a2dc))
* **git-bundle-api:** print all refs for debugging purposes ([ade8385](https://github.com/rb-mwindh/git-bundle/commit/ade8385eaa36d0dfb88dc21f08a9dac907695bca))
* **git-bundle:** reimplement bundle workflow with layered action and API classes ([b54e1dc](https://github.com/rb-mwindh/git-bundle/commit/b54e1dc6dc1c91cba968839b3282e797af8fa04d))
* **inputs:** make bundle name optional with default value ([9e80a29](https://github.com/rb-mwindh/git-bundle/commit/9e80a29c0e4b28a0a36baa825579648721356996))
* **inputs:** make bundle name optional with default value ([8ff5515](https://github.com/rb-mwindh/git-bundle/commit/8ff551524e74d26bf6d250bb0f1b858986af9228))


### BREAKING CHANGES

* `GitApi.createBundle()` now returns an object with either result or error instead of the raw git output (`{ result: string } | { error: Error }`).
* `GitBundleApi.importBundle()` now returns `Promise<void>`
instead of `Promise<ImportBundleResult>`, and `GitApi.importBundle()` has been
removed in favor of `fetch()`, `resolveRef()`, `checkout()`, and `listBundleRefs()`.
* **git-bundle:** Just want to bump the major version

# [1.0.0-rc.8](https://github.com/rb-mwindh/git-bundle/compare/v1.0.0-rc.7...v1.0.0-rc.8) (2026-04-10)


### Bug Fixes

* **git-bundle:** validate and convert bundle refs to fetch refspecs ([25952d9](https://github.com/rb-mwindh/git-bundle/commit/25952d9dfab4d5163688a74236c16fa304bf8a9b))

# [1.0.0-rc.7](https://github.com/rb-mwindh/git-bundle/compare/v1.0.0-rc.6...v1.0.0-rc.7) (2026-04-10)


* feat(git)!: return structured bundle creation result and handle upload failures ([10d48d0](https://github.com/rb-mwindh/git-bundle/commit/10d48d06572cc911da8f0744173d44ab7b22fcd9))


### Features

* **git-api:** allow fetch origin override for bundle imports ([5d93e9a](https://github.com/rb-mwindh/git-bundle/commit/5d93e9addcdf14e4f09c7ed115edf095cf70a2dc))
* **git-bundle-api:** print all refs for debugging purposes ([ade8385](https://github.com/rb-mwindh/git-bundle/commit/ade8385eaa36d0dfb88dc21f08a9dac907695bca))


### Reverts

* Revert "feat(git-api): add `fetchBundle` function" ([e67c6a2](https://github.com/rb-mwindh/git-bundle/commit/e67c6a2bc281d8876c6f00d3a00ef76e02a03870))


### BREAKING CHANGES

* `GitApi.createBundle()` now returns an object with either result or error instead of the raw git output (`{ result: string } | { error: Error }`).

# [1.0.0-rc.6](https://github.com/rb-mwindh/git-bundle/compare/v1.0.0-rc.5...v1.0.0-rc.6) (2026-04-09)


### Features

* **git-api:** add `fetchBundle` function ([fc9cbc8](https://github.com/rb-mwindh/git-bundle/commit/fc9cbc8a511255e47cd582253e8bb86621845736))

# [1.0.0-rc.5](https://github.com/rb-mwindh/git-bundle/compare/v1.0.0-rc.4...v1.0.0-rc.5) (2026-04-09)


### Features

* **action:** rework implementation layers ([bd24fa0](https://github.com/rb-mwindh/git-bundle/commit/bd24fa096a205872bce6051af2ac975cfbfa8e1c))

# [1.0.0-rc.4](https://github.com/rb-mwindh/git-bundle/compare/v1.0.0-rc.3...v1.0.0-rc.4) (2026-04-09)


* refactor(git)!: move bundle import flow into GitBundleApi ([f112e90](https://github.com/rb-mwindh/git-bundle/commit/f112e909005181c9e51b9055b8a461154ea65c20))


### Bug Fixes

* **github-api:** add diagnostic logging for artifact download path ([c5b5061](https://github.com/rb-mwindh/git-bundle/commit/c5b5061ebad501d8fcf31e4db76f79d257948313))


### BREAKING CHANGES

* `GitBundleApi.importBundle()` now returns `Promise<void>`
instead of `Promise<ImportBundleResult>`, and `GitApi.importBundle()` has been
removed in favor of `fetch()`, `resolveRef()`, `checkout()`, and `listBundleRefs()`.

# [1.0.0-rc.3](https://github.com/rb-mwindh/git-bundle/compare/v1.0.0-rc.2...v1.0.0-rc.3) (2026-04-08)


### Features

* **git-bundle:** reimplement bundle workflow with layered action and API classes ([b54e1dc](https://github.com/rb-mwindh/git-bundle/commit/b54e1dc6dc1c91cba968839b3282e797af8fa04d))


### BREAKING CHANGES

* **git-bundle:** Just want to bump the major version

# [1.0.0-rc.2](https://github.com/rb-mwindh/git-bundle/compare/v1.0.0-rc.1...v1.0.0-rc.2) (2026-04-03)


### Features

* **action:** use `main` instead of `pre` ([c626206](https://github.com/rb-mwindh/git-bundle/commit/c626206137cdf3b9c24da4a2c644321210b77ab7))

# 1.0.0-rc.1 (2026-04-03)


### Features

* **inputs:** make bundle name optional with default value ([9e80a29](https://github.com/rb-mwindh/git-bundle/commit/9e80a29c0e4b28a0a36baa825579648721356996))
* **inputs:** make bundle name optional with default value ([8ff5515](https://github.com/rb-mwindh/git-bundle/commit/8ff551524e74d26bf6d250bb0f1b858986af9228))
* **repo:** implement repository management and artifact handling ([ce4c514](https://github.com/rb-mwindh/git-bundle/commit/ce4c51477207480984e31ee2e306247a4f0207e9))
