# Agent Instructions

## Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting (`src/`, `*.json`, `*.js`, `*.ts`).

**Run after every iteration on the codebase and before making commits:**

```sh
npx biome check --write .
```

This single command formats code, fixes auto-fixable lint issues, and organizes imports in one pass.

**Also verify the build compiles cleanly before committing:**

```sh
npm run compile-tests
```

This runs `tsc` (TypeScript type-check of the full project including tests) followed by copying test fixtures. Fix any TypeScript errors it reports before committing.

## Git Hooks

[Lefthook](https://github.com/evilmartians/lefthook) is configured to run `biome check --write` on staged files automatically before every commit.

To activate the hooks after cloning or after installing dependencies, run:

```sh
npx lefthook install
```

The hook is defined in `lefthook.yml` at the repository root.

## Build & Test

| Task | Command |
|---|---|
| Compile (webpack) | `npm run compile` |
| TypeScript type check | `npm run compile-tests` |
| Run tests | `npm run test:ci` |
| Lint only | `npm run lint` |
| Format + lint + fix | `npx biome check --write .` |
