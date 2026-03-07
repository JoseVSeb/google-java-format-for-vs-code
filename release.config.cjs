/** @type {import('semantic-release').GlobalConfig} */
const config = {
    // NOTE: "next" is intentionally NOT marked as `prerelease: true` here.
    // semantic-release's `prerelease: true` generates pre-release semver tags
    // (e.g. 1.2.0-next.1) which the VS Code Marketplace does NOT support —
    // it requires a standard semver version string (e.g. 1.2.0).
    // The marketplace pre-release flag is set separately via the VSCE_PRE_RELEASE
    // environment variable in release.yaml, which passes --pre-release to `vsce package`.
    branches: ["main", { name: "next" }],
    plugins: [
        [
            "@semantic-release/commit-analyzer",
            { preset: "conventionalcommits" },
        ],
        [
            "@semantic-release/release-notes-generator",
            { preset: "conventionalcommits" },
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
