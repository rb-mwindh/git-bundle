module.exports = {
    // Standard semantic-release branches configuration (defaults)
    // (You can omit this entirely if you want, but you asked to keep it explicit.)
    branches: [
        "+([0-9])?(.{+([0-9]),x}).x", // maintenance branches like 1.x, 1.2.x
        "master",
        "main",
        "next",
        "next-major",
        { name: "beta", prerelease: true },
        { name: "alpha", prerelease: true }
    ],

    plugins: [
        "@semantic-release/commit-analyzer",
        "@semantic-release/release-notes-generator",

        ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],

        // Updates version in package.json and publishes to npm
        "@semantic-release/npm",

        // Commits CHANGELOG.md + package.json back to the repo
        ["@semantic-release/git", {
            assets: [
                "CHANGELOG.md",
                "package.json",
                "package-lock.json",
                "bin/**/*"
            ],
            message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
        }],

        // Creates GitHub Release
        "@semantic-release/github"
    ]
};
