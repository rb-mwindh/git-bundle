# cpy-cli

> Copy files

## Why

- Fast by using streams.
- Resilient by using [graceful-fs](https://github.com/isaacs/node-graceful-fs).
- User-friendly by accepting [globs](https://github.com/sindresorhus/globby#globbing-patterns) and creating non-existent destination directories.
- User-friendly error messages.

## Install

```sh
npm install --global cpy-cli
```

## Usage

```
$ cpy --help

  Usage
    $ cpy <source …> <destination>

  Options
    --no-overwrite       Don't overwrite the destination
    --ignore-existing    Skip files that already exist at the destination
    --update             Only overwrite if the source is newer, or if sizes differ with the same modification time
    --cwd=<dir>          Working directory for files
    --base=<mode>        Base mode for destination paths: cwd or pattern
    --rename=<filename>  Rename all <source> filenames to <filename>. Supports string templates.
    --dot                Allow patterns to match entries that begin with a period (.)
    --flat               Flatten directory structure. All copied files will be put in the same directory.
    --dry-run            List files that would be copied without actually copying
    --concurrency        Number of files being copied concurrently

  <source> can contain globs if quoted

  Errors if no files match, similar to cp.

  --update is ignored when --no-overwrite or --ignore-existing is set.

  If the source is a single file and the destination is not an existing directory, it will be treated as a file-to-file copy (like cp).

  Examples
    Copy all .png files in src folder into dist except src/goat.png
    $ cpy 'src/*.png' '!src/goat.png' dist

    Copy all files inside src folder into dist and preserve path structure
    $ cpy . '../dist/' --cwd=src

    Copy a single file to a specific filename
    $ cpy .env.development .env

    Copy all .png files in the src folder to dist and prefix the image filenames
    $ cpy 'src/*.png' dist --cwd=src --rename=hi-{{basename}}

    Copy only when the source is newer, or if sizes differ with the same modification time
    $ cpy src dist --update
```

## Related

- [cpy](https://github.com/sindresorhus/cpy) - API for this package
