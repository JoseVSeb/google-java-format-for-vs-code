/** @type {import('semantic-release').GlobalConfig} */
const config = {
    branches: ["main"],
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
