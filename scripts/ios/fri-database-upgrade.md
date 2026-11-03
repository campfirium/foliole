# Physical database upgrade acceptance

The explicit `database-upgrade` scenario uses the existing physical development workflow and fixed isolated development identity. It never installs, reads or modifies the production app. It resets the development test container before preparing this journey.

```sh
node scripts/ios/fri-dev-workflow.mjs --scenario database-upgrade \
  --legacy-sqlcipher-framework /absolute/retained/SQLCipher.framework \
  --revision <current-clean-commit> --artifacts-dir .tmp/artifacts/<task>/upgrade-attempt
```

Run the local workflow/retention and `fri-database-upgrade.test.mjs` contracts first. On macOS, explicitly set `FOLIOLE_IOS_LEGACY_SQLCIPHER_FRAMEWORK` for the real old-framework test. Hosted runs without that retained framework still run the workflow and preservation rejection contracts; they do not attest the old native engine.

The fixture builder loads the supplied SQLCipher framework, requires cipher version 4.17.0, clones the existing versioned upgrade fixture through SQLite backup, and writes a known readable sentence using that old engine. It replaces the historical synthetic attachment labels with one consistent content-addressed identity while preserving attachment metadata and relations, so the fixture satisfies the production data contract. The production migration regression must boot this generated database and retain its original learning facts after reopen. It records the source fixture hash, framework hash and retained facts. The legacy engine is used for test-data creation on macOS; no old vulnerable application is installed on the phone.

After the existing runner builds the current development app, the scenario checks its bundle identity and linked SQLCipher 4.20.0 framework. It installs that app only to create its fresh test container, stages the old-engine database, and verifies a read-back digest. A covering install must preserve the exact old bytes before the first launch. XCUITest then searches and reads the old content, relaunches, writes a new capture, and searches both old and new content after another relaunch. The postflight SQLite snapshot must preserve the original review grade/operation/due date and sync cursor, together with the new UI write.

Use a new evidence directory for every independent attempt. An interrupted attempt is preserved; it is not a successful upgrade. The report distinguishes the old-engine fixture, covering installation, visible UI assertions and durable database checks. This scene proves local upgrade preservation, including sync-state retention. It does **not** prove real-network discovery, pairing or manual peer synchronization; retain those separate existing obligations and evidence.
