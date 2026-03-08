# Agent Instructions

## Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting (`src/`, `*.json`, `*.js`, `*.ts`).

**Run after every iteration on the codebase and before making commits:**

```sh
npx biome check --write .
```

This single command formats code, fixes auto-fixable lint issues, and organizes imports in one pass.

Keep import declarations contiguous: do not insert empty lines between consecutive `import` or `import type` statements.

**Also verify the build compiles cleanly before committing:**

```sh
yarn compile-tests
```

This runs `tsc` (TypeScript type-check of the full project including tests) followed by copying test fixtures. Fix any TypeScript errors it reports before committing.

## Package Manager

This project uses **yarn 1 (classic)** managed via [Corepack](https://nodejs.org/api/corepack.html). The pinned version is declared in the `packageManager` field of `package.json`.

To install dependencies:

```sh
yarn install
```

In CI, use `--frozen-lockfile` to ensure the lock file is not updated:

```sh
yarn install --frozen-lockfile
```

## Git Hooks

[Lefthook](https://github.com/evilmartians/lefthook) is configured to run `biome check --write` on staged files automatically before every commit. The hook activates automatically after `yarn install` (via the `postinstall` script).

The hook is defined in `lefthook.yml` at the repository root.

## Build & Test

| Task | Command |
|---|---|
| Compile (esbuild) | `yarn compile` |
| TypeScript type check | `yarn compile-tests` |
| Run tests | `yarn test:ci` |
| Lint only | `yarn lint` |
| Format + lint + fix | `npx biome check --write .` |
