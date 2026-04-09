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
