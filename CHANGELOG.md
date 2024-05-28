# Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.1.2](https://github.com/JoseVSeb/google-java-format-for-vs-code/compare/v1.1.1...v1.1.2) (2024-05-28)


### Bug Fixes

* **deps:** override @typescript-eslint/eslint-plugin peer deps to allow installed eslint version ([a273b65](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/a273b65826324c464f8396c0b6f2fde932f89a00))

## [1.1.1](https://github.com/JoseVSeb/google-java-format-for-vs-code/compare/v1.1.0...v1.1.1) (2024-02-18)


### Bug Fixes

* run chmod +x for linux and mac native executables ([680002a](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/680002acaa930836ae45a716acc3d67a723b2a39)), closes [#20](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues/20) [#21](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues/21)

## [1.1.0](https://github.com/JoseVSeb/google-java-format-for-vs-code/compare/v1.0.3...v1.1.0) (2024-02-18)


### Features

* add support for native executable ([4805f80](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/4805f80b444f7efe9ffda3f64ca3443ba84851ce)), closes [#17](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues/17)
* register command to clear cache ([230405e](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/230405e7bd7606bf3237db8cd3a2a14443495580)), closes [#8](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues/8)

## [1.0.3](https://github.com/JoseVSeb/google-java-format-for-vs-code/compare/v1.0.2...v1.0.3) (2024-02-10)


### Bug Fixes

* add quotation marks around jar file in GoogleJavaFormatterSync.ts ([efff316](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/efff316a0732f7c6dce1e05f446ad11145f5a1c4)), closes [#4](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues/4)

## [1.0.2](https://github.com/JoseVSeb/google-java-format-for-vs-code/compare/v1.0.1...v1.0.2) (2024-02-09)


### Bug Fixes

* update jar file with confirmation on configuration change ([9b12115](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/9b1211577ad16655ea9a7de8c75479ec370c6e0a)), closes [#15](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues/15)

## [1.0.1](https://github.com/JoseVSeb/google-java-format-for-vs-code/compare/v1.0.0...v1.0.1) (2024-02-08)


### Bug Fixes

* add debug log for exec command ([28dcb58](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/28dcb58372013f6be4ce19d6ec4c30bb5053eda7)), closes [#13](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues/13)
* get config on every invoke of formatter ([8ece27e](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/8ece27e979fc80283ca5d0fde1d76c4d52a672a8)), closes [#12](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues/12)

## [1.0.0](https://github.com/JoseVSeb/google-java-format-for-vs-code/compare/v0.2.0...v1.0.0) (2024-01-16)


### ⚠ BREAKING CHANGES

* by default, download and use latest version of GJF

### Features

* by default, download and use latest version of GJF ([608c6fe](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/608c6fe2f661d7211f8e18a191813b7dd95cc9e3)), closes [#7](https://github.com/JoseVSeb/google-java-format-for-vs-code/issues/7)

# [0.2.0](https://github.com/JoseVSeb/google-java-format-for-vs-code/compare/v0.1.4...v0.2.0) (2023-12-16)


### Bug Fixes

* **deps:** revert @types/vscode to vscode engine version ([58b46ed](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/58b46edef821f3eac2eb6168c37ecb5691964b42))
* **deps:** revert glob version ([cfc545f](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/cfc545f3b622455615ea534704e7ae8d8b71ddde))


### Features

* **deps:** upgrade dependencies ([7df3fcd](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/7df3fcd00f37d63226bafd0317b75ddf6a862338))

## [0.1.4](https://github.com/JoseVSeb/google-java-format-for-vs-code/compare/v0.1.3...v0.1.4) (2023-12-16)


### Bug Fixes

* Range Formatting ([319698a](https://github.com/JoseVSeb/google-java-format-for-vs-code/commit/319698aa8b12c86bedbfcbf7d97588044b1086e9))

## [0.1.3] - 2023-09-20

Fix issue with path of executable containing space.

## [0.1.2] - 2023-05-10

Update default google java format version to 1.17.0.

## [0.1.1] - 2023-05-10

### Fixed

Fix extension activation in vs code v1.78.

## [0.1.0] - 2023-02-14

### Added

Format Java files using Google Java Format.

Auto-download Google Java Format jar using url or version.

Call Google Java Format using extra CLI arguments.
