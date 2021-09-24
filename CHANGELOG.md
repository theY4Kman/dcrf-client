# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).


## [Unreleased]
### Added
 - Add support for streaming requests ([#31](https://github.com/theY4Kman/dcrf-client/pull/31), thanks [@jhillacre](https://github.com/jhillacre)!)


## 1.0.0 — 2021-06-05
### Breaking
 - Return a Promise from `subscription.cancel()`
 - Return a Promise from `subscription.cancel()`
 - Return a Promise from `client.close()`
 - Return a Promise from `client.unsubscribeAll()`

### Added
 - Allow custom subscription actions to be used ([#24](https://github.com/theY4Kman/dcrf-client/pull/24), thanks [@jhillacre](https://github.com/jhillacre)!)
 - Optionally allow subscription callbacks to handle "create" actions, through `includeCreateEvents` option ([#24](https://github.com/theY4Kman/dcrf-client/pull/24), thanks [@jhillacre](https://github.com/jhillacre)!)
 - Unsubscription requests are now sent to the server! ([#24](https://github.com/theY4Kman/dcrf-client/pull/24), thanks [@jhillacre](https://github.com/jhillacre)!)
 - Logging switched from [loglevel](https://github.com/pimterry/loglevel) to [winston](https://github.com/winstonjs/winston)
 - _Docs:_ Added CHANGELOG.md

### Changed
 - Return a Promise from `subscription.cancel()`
 - Return a Promise from `client.close()`
 - Return a Promise from `client.unsubscribeAll()`
 - Upgraded TypeScript compiler to 3.7.7 (to support optional chaining and nullish coalescence)

### Fixed
 - Prevent duplicate transmissions of subscribe requests during resubscribe ([#24](https://github.com/theY4Kman/dcrf-client/pull/24), thanks [@jhillacre](https://github.com/jhillacre)!)
 - _Tests:_ Upgrade pytest to 6.2
 - _Tests:_ Upgrade integration tests' Python from 3.7 to 3.8 to resolve `importlib_metadata` import error ([#10](https://github.com/theY4Kman/dcrf-client/issues/10))
 - _Tests:_ Change `npm run test:integration` to invoke pytest through `pipenv run`
 - _Docs:_ Change instructions on setting up env for integration tests to use `pipenv install --dev` (without `--dev`, necessary deps were not being installed)
 - _Tests:_ Resolve stdout buffering issue in integration test runner which resulted in process hang


## 0.3.0 — 2020-12-09
### Added
 - Allow custom PK fields to be used with subscriptions
 - Allow generation of selector/payload objects to be controlled
 - Add `client.close()` method to explicitly disconnect transport
 - Add `client.unsubscribeAll()` method to unsubscribe any active subscriptions (called by default in `close()`)
 - _Docs:_ Add docs to README explaining how to utilize custom PK fields (and `ensurePkFieldInDeleteEvents`)


## 0.2.0 — 2020-11-11
### Added
 - Allow all options supported by `ReconnectingWebsocket` to be passed through client (previously, the allowed options were hardcoded) (thanks [@sandro-salles](https://github.com/sandro-salles))
 - _Docs:_ Include docs on reconnecting-websocket options in README (thanks [@sandro-salles](https://github.com/sandro-salles))

### Changed
 - Upgraded [reconnecting-websocket](https://github.com/pladaria/reconnecting-websocket) from 4.1.10 to 4.4.0 (thanks [@sandro-salles](https://github.com/sandro-salles))


## 0.1.2 — 2019-03-30
### Added
 - _Docs:_ Add code example for `client.patch()` in README


## 0.1.1 — 2019-03-30
### Fixed
 - _Docs:_ Update outdated code examples in README


## 0.1.0 — 2019-03-30
### Added
 - Allow request IDs to be manually specified
 - _Tests:_ Add integration tests
 - _Docs:_ Add instructions for running tests

### Fixed
 - Update subscription request/listener to match DCRF's semantics (channels-api semantics were being used)


## 0.0.2 — 2019-03-24
### Fixed
 - Ensure a request ID is sent in resubscriptions


## 0.0.1 — 2019-03-20
### Added
 - Initial release: TypeScript port of channels-api
