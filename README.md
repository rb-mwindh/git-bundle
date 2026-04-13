# git-bundle

Transport Git changes across GitHub Actions jobs without pushing anything back to the remote repository. The action uses
Git bundles stored as workflow artifacts to move commits and selected refs between jobs in the same workflow run.

## Features

- **No remote pushes**: Changes stay local to the workflow unless you push them yourself.
- **Cross-job Git state transfer**: Restore commits and tracked refs in downstream jobs.
- **Automatic restore and persist flow**: The action restores state in the `main` hook and uploads a new bundle in the
  `post` hook.
- **Shallow checkout support**: Tries to unshallow the repository before working with tracked refs.
- **Configurable tracked refs**: Tracks tags and notes by default and can be customized.

## What gets transported

- **Commits** reachable from the transport ref `refs/heads/<bundle>`
- **Tracked refs** matching the configured ref patterns (defaults: `refs/tags/*`, `refs/notes/*`)
- **Current HEAD** through the transport ref `refs/heads/<bundle>`

## Usage

Run the action after `actions/checkout` in every job that should participate in the bundle chain:

```yaml
- uses: actions/checkout@v4

- uses: rb-mwindh/git-bundle@v1
  with:
    bundle: release-state

# ... your job logic (commits, tags, notes) ...

# The post hook runs automatically at the end of the job.
```

## Inputs

All inputs are optional.

| Name      | Default                    | Description                                                                                                                                                    |
|-----------|----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `bundle`  | `release`                  | Bundle identifier. Used as the artifact name, the bundle file name, and the transport ref suffix in `refs/heads/<bundle>`.                                     |
| `path`    | `${{ github.workspace }}`  | Path to the Git repository. At runtime the action falls back to the current working directory if the workspace value is unavailable.                           |
| `refs`    | `refs/tags/*,refs/notes/*` | Comma-separated list of tracked ref patterns. These refs are fetched, snapshotted, and included in bundle generation.                                          |
| `tempDir` | `${{ runner.temp }}`       | Temporary directory used for artifact download, bundle creation, and artifact upload. At runtime the action falls back to the system temp directory if needed. |

## Compatibility

The action is designed to run on **GHES (GitHub Enterprise Server)** with `@actions/artifact@^1` limitations:

- **Artifact listing is not supported**: The action probes for artifact existence by attempting download. If download fails with "artifact not found", the action continues with a fresh baseline.
- **Artifact deletion is not performed**: `@actions/artifact@^1` provides no delete API. New uploads will replace outdated artifacts on subsequent runs.
- **Artifact metadata is best-effort**: Fields like `id`, `size`, `digest`, and `createdAt` are populated with default/placeholder values since the v1 API does not expose comprehensive metadata.

## Lifecycle

The action metadata uses the GitHub Actions `main` and `post` hooks.

### `main` hook

When the step runs, the action:

1. Reads inputs and resolves runtime defaults.
2. Verifies that the configured repository path is a Git repository.
3. Fetches the tracked refs from `origin` and tries `--unshallow` first when the repository is shallow.
4. Looks for an existing artifact with the configured bundle name.
5. If an artifact exists, downloads it into `tempDir`, imports the bundle, and checks out the transported head.
6. Creates a snapshot of the currently tracked refs.
7. Saves that snapshot into GitHub Actions state for use in the `post` hook.

### `post` hook

At job teardown, the action:

1. Recreates the action context from inputs.
2. Verifies that the repository still exists.
3. Loads the saved tracked-ref snapshot.
4. Creates a fresh snapshot and determines which tracked refs changed.
5. Updates `refs/heads/<bundle>` to the current `HEAD`.
6. Computes bundle revision specs from:

- the commit range `github.context.sha..refs/heads/<bundle>` when new commits exist,
- the transport ref itself, and
- tracked refs whose current SHA changed.

7. Creates a bundle file at `<tempDir>/<bundle>`.
8. Replaces any existing artifact with the same name and uploads the new bundle when it contains content.

If there is nothing new to bundle, the `post` hook logs a notice and skips the upload.

## Example workflow

```yaml
name: Multi-Job Processing

on: [ push ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: rb-mwindh/git-bundle@v1
        with:
          bundle: release-state

      - name: Build and release
        run: |
          npm install
          npm run build
          git config user.name "CI"
          git config user.email "ci@example.com"
          npm run release

  publish:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4

      - uses: rb-mwindh/git-bundle@v1
        with:
          bundle: release-state

      - name: Publish
        run: |
          npm install
          npm run publish
```

## Behavior and edge cases

The current implementation handles these cases intentionally:

- **First job in a chain**: No previous artifact is found, so the action starts with a fresh baseline.
- **Shallow repository**: The action tries `git fetch --force --unshallow origin ...` first and falls back to a regular
  fetch if unshallowing fails.
- **No new bundle content**: The `post` hook skips artifact upload instead of failing.
- **Missing tracked refs**: Snapshot creation tolerates missing namespaces such as absent tags or notes.
- **Artifact replacement**: Before upload, the action attempts to delete an existing artifact with the same name.

## State management

The action currently persists one state value between `main` and `post`:

- `git-bundle-snapshot`: JSON snapshot of the tracked refs from the `main` hook

`github.context.sha` is read directly during the `post` hook and is not stored in Actions state.

## Notes and limitations

- The action metadata does **not** define a separate GitHub Actions `pre` entrypoint. Internally, the `GitBundleAction`
  class exposes `pre()`, `main()`, and `post()`, but only `main` and `post` are wired in `action.yml`.
- Bundle files are currently created without a `.bundle` suffix. The artifact name and file name are both the configured
  `bundle` value.
- Ref deletions are not bundled. The diff logic only considers tracked refs that exist in the current snapshot.
- Bundle import errors are not ignored. For example, a malformed bundle can still fail the action.
- The action is intended to exchange artifacts within a single workflow run.

## Development

### Build

This project uses [esbuild](https://github.com/evanw/esbuild)
and [esbuild-plugin-license](https://github.com/bcherny/esbuild-plugin-license) for bundling and license generation.

```sh
npm ci
npm run build
```

- Runtime bundles are generated in `bin/main.js` and `bin/post.js`.
- License files are generated alongside each runtime bundle.

### Project structure

```text
src/
  main.ts                    # GitHub Actions main entrypoint
  post.ts                    # GitHub Actions post entrypoint
  lib/
    git-bundle-action.ts     # Orchestrates main/post lifecycle
    git-bundle-api.ts        # High-level bundle operations
    git-api.ts               # Low-level Git operations
    github-api.ts            # Low-level GitHub Actions operations
```

### Key technologies

- **simple-git**: Git command wrapper
- **@actions/core**: Inputs, logging, state, and failure handling
- **@actions/artifact**: Artifact download, upload, and deletion
- **TypeScript**: Type-safe implementation
- **esbuild**: Action bundle generation

## License

MIT © Markus Windhager

The license files in `bin/` include the licenses of all used third-party dependencies.

