# git-bundle

Transport git changes across multiple GitHub Actions jobs without pushing to the remote repository. Uses git bundles as artifacts to move commits, tags, and notes between jobs in a single run.

## Features

- **Zero remote pushes**: All changes stay local until you're ready
- **Multi-job workflows**: Seamlessly pass commits, tags, and notes between jobs
- **Automatic PRE/POST phases**: No manual setup required—action handles both phases automatically
- **Robust error handling**: Won't fail if there are no changes, no previous artifact, or bundle is empty
- **Complete history support**: Automatically unshallows repositories for full history access
- **Dynamic ref discovery**: Automatically detects and transports all tags and notes

## Supported Git Objects

- **Commits**: All new commits since the previous job
- **Tags**: All refs under `refs/tags/*` are dynamically detected and transported
- **Notes**: All refs under `refs/notes/*` are dynamically detected and transported
- **HEAD state**: Current HEAD is always transported via `refs/head/<bundle>` for seamless continuation

## Usage

Add the action after `actions/checkout` in your workflow:

```yaml
- uses: actions/checkout@v4

- uses: rb-mwindh/git-bundle@v1
  with:
    bundle: my-bundle

# ... your job logic (commits, tags, notes) ...

# POST phase runs automatically at job end
```

## Input Parameters

- `bundle` (required): Bundle artifact identifier
  - Used for: bundle filename `<bundle>.bundle`, artifact name `<bundle>`, ref `refs/head/<bundle>`

## How It Works

### PRE Phase (beginning of job)

1. Ensures a git repository exists after `actions/checkout`
2. Ensures full history is available locally (unshallow if needed)
3. Attempts to download the previous artifact `<bundle>`
4. Validates and imports `<bundle>.bundle` if present
5. Checks out `refs/head/<bundle>` when transported state exists
6. Captures a snapshot of `refs/tags/*` and `refs/notes/*`
7. Saves the snapshot and `github.context.sha` into action state

### MAIN Phase

The main phase is intentionally a no-op.

### POST Phase (end of job)

1. Captures a second snapshot of `refs/tags/*` and `refs/notes/*`
2. Diffs the snapshot against PRE to identify changed refs
3. Updates `refs/head/<bundle>` to the current `HEAD`
4. Creates an incremental bundle using changed refs and new commits since `github.context.sha`
5. Uploads the result as artifact `<bundle>`
6. If there is nothing to bundle, logs a no-op notice and skips upload

## Example Workflow

```yaml
name: Multi-Job Processing

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Recommended for complete history

      - uses: rb-mwindh/git-bundle@v1
        with:
          bundle: release-state

      # Build and create tags/commits
      - name: Build and Release
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
        with:
          fetch-depth: 0

      - uses: rb-mwindh/git-bundle@v1
        with:
          bundle: release-state

      # At this point, working directory contains:
      # - All commits from build job
      # - All tags created in build job
      # - All notes from build job
      # - HEAD points to the final commit from build

      - name: Publish
        run: |
          npm install
          npm run publish
```

## Edge Cases Handled

The action gracefully handles these scenarios without failing:

- **First job**: No previous artifact found → action starts fresh with baseline
- **No changes**: No new commits or refs → action creates no bundle, continues normally
- **Empty bundle**: Bundle file exists but contains no relevant objects → action skips upload
- **Invalid bundle**: Corrupted or malformed bundle → action logs warning, continues
- **Shallow repository**: `actions/checkout` cloned without history → action unshallows automatically
- **Multiple runs in same job**: Action can be called multiple times safely
- **Missing refs**: Tags or notes may not exist → action adapts gracefully

## State Management

The action uses GitHub Actions state (`saveState`/`getState`) to communicate between PRE and POST phases:

- `git-bundle-github-sha`: `github.context.sha` captured during PRE
- `git-bundle-snapshot`: JSON snapshot of `refs/tags/*` and `refs/notes/*`

This state is job-specific and automatically cleaned up by GitHub Actions.

## Technical Details

### Bundle Format

Bundles are created using incremental revision specs when possible:
- Commit range `github.context.sha..refs/head/<bundle>` when new commits exist
- Transport ref `refs/head/<bundle>`
- All changed refs under `refs/tags/*` and `refs/notes/*`

If there are no changes, the action treats POST as a no-op and skips artifact upload. PRE already handles missing artifacts gracefully.

### Refs Organization

- **Transport ref**: `refs/head/<bundle>` - tracks current HEAD across jobs
- **Tags**: `refs/tags/*` - all git tags
- **Notes**: `refs/notes/*` - all git notes

### Failure Modes

The action is designed to never fail due to:
- Missing previous artifacts
- No new changes to transport
- Empty or malformed bundles
- Shallow repositories
- Invalid refs

Instead, it logs appropriate `info` or `warning` messages and allows the job to continue. Only critical errors (e.g., input not provided) cause failure.

## Development

### Build

This project uses [esbuild](https://github.com/evanw/esbuild) and [esbuild-plugin-license](https://github.com/bcherny/esbuild-plugin-license) for bundling and license generation.

```sh
npm ci
npm run build
```

- Bundles are generated in `bin/pre.js`, `bin/main.js`, and `bin/post.js`
- License files are generated alongside each runtime bundle

### Project Structure

```
src/
  pre.ts                 # PRE phase entry point
  main.ts                # MAIN phase entry point (no-op)
  post.ts                # POST phase entry point
  lib/
    repo.ts              # Single source of truth for git-bundle logic
```

### Key Technologies

- **simple-git**: Robust git operations
- **@actions/core**: GitHub Actions API
- **@actions/artifact**: Artifact management
- **TypeScript**: Type-safe implementation
- **esbuild**: Bundling for GitHub Actions

## Limitations

1. **Artifacts across runs**: Only works within a single GitHub Actions run (not across different run IDs)
2. **Size limits**: Artifacts are subject to GitHub's storage limits (typically 5GB per run)
3. **Shallow clones**: Initial `actions/checkout` may be shallow; action auto-corrects this
4. **Large bundles**: Very large repositories may produce large bundles; consider splitting workflows

## License

MIT © Markus Windhager

The license files in the `bin/` directory include the licenses of all used third-party dependencies.

