/** @type {import('semantic-release').GlobalConfig} */
const config = {
    // NOTE: "next" is a stable release branch for semantic-release — it is NOT
    // marked as `prerelease: true` here because semantic-release's prerelease
    // option generates pre-release semver tags (e.g. 1.2.0-next.1) which the
    // VS Code Marketplace does NOT support (it requires plain semver like 1.2.0).
    // The marketplace pre-release flag is set separately via the VSCE_PRE_RELEASE
    // environment variable in release.yaml, which passes --pre-release to `vsce package`.
    branches: ["main", "next"],
    preset: "conventionalcommits",
    plugins: [
        [
            "@semantic-release/commit-analyzer",
            {
                releaseRules: [
                    { type: "perf", release: "patch" },
                    { type: "refactor", release: "patch" },
                    { type: "build", scope: "deps", release: "patch" },
                    // https://github.com/semantic-release/commit-analyzer/issues/413#issuecomment-1465299187
                    { breaking: true, release: "major" },
                ],
            },
        ],
        [
            "@semantic-release/release-notes-generator",
            {
                presetConfig: {
                    types: [
                        { type: "feat", section: "Features" },
                        { type: "fix", section: "Bug Fixes" },
                        { type: "perf", section: "Performance Improvements" },
                        { type: "revert", section: "Reverts" },
                        { type: "refactor", section: "Code Refactoring" },
                        { type: "build", scope: "deps", section: "Dependencies" },
                    ],
                },
            },
        ],
        [
            "@semantic-release/changelog",
            {
                changelogTitle:
                    "# Changelog\n\nAll notable changes to this project will be documented in this file. See\n[Conventional Commits](https://conventionalcommits.org) for commit guidelines.",
            },
        ],
        ["semantic-release-vsce", { packageVsix: true }],
        "@semantic-release/git",
        ["@semantic-release/github", { assets: "*.vsix" }],
    ],
};

module.exports = config;
