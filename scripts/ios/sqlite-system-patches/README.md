# iOS system SQLite backend

Foliole uses plaintext mobile databases. The upstream community plugin links SQLCipher even
when encryption is disabled. These patches retain its API and database paths, but link the
Apple SQLite3 module instead. Android is unchanged. Sync encryption still uses system APIs.

This follows the separation used by [Capgo Fast SQL](https://github.com/Cap-go/capacitor-fast-sql/blob/main/ios/Sources/CapgoCapacitorFastSqlPlugin/SQLDatabase.swift)
and the system backend used by [micro:bit's SQLite plugin](https://github.com/microbit-foundation/capacitor-sqlite-vanilla).
These are Foliole's patches for community SQLite 8.1.1, not a claimed upstream patch release.

`npm install` / `npm ci` applies the patches through `postinstall`. No additional package is
installed. The manifest pins the upstream version and original/patched file digests. Repeated
installation is idempotent; unexpected upstream contents require review instead of guessing.

The upstream package remains MIT licensed. Patch context retains its original notices.
Database encryption defaults off, password-bearing opens fail before touching the file,
and encryption/decryption/rekey operations throw. No encrypted database migration is performed.

When updating the plugin, regenerate and review these patches against that exact version,
then verify existing plaintext files, transactions, attached databases, FTS/JSON, process
restarts and iOS sync. Inspect the built app and its dependency graph for SQLCipher.
