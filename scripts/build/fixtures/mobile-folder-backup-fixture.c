#include "mobile-folder-backup-fixture.h"
#include "mobile-folder-backup-io.h"

static void pinned(void *context) {
    Fixture *fixture = context;
    if (fixture->action == 1) foliole_backup_cancel(fixture->job);
    if (fixture->action == 2 || fixture->action == 5) {
        if (fixture->action == 5) require(atomic_load(&fixture->sourceReleased) == 1,
            "Small-delta target commit retained the source snapshot");
        for (int i = 0; i < 32; i++) {
            execute(fixture->owner, "INSERT INTO events DEFAULT VALUES");
            for (int n = 0; n < 2; n++) {
                sqlite3 *reader = openDatabase(fixture->source, SQLITE_OPEN_READONLY);
                require(scalar(reader, "SELECT count(*) FROM facts") == 1, "Source connection lost facts");
                sqlite3_close(reader);
            }
            if (i % 8 == 0) execute(fixture->owner, "PRAGMA wal_checkpoint(PASSIVE)");
        }
    }
    if (fixture->action == 3) {
        require(sqlite3_close(fixture->owner) == SQLITE_OK, "Owner close failed");
        fixture->owner = NULL;
    }
}

static void committed(void *context) {
    Fixture *fixture = context;
    if (fixture->action == 4) foliole_backup_cancel(fixture->job);
    if (fixture->action == 87) _exit(87);
}

static int prepared(void *context, const char *fingerprint) {
    Fixture *fixture = context;
    int rc = writeFingerprint(fixture->pendingPath, fingerprint);
    if (rc == SQLITE_OK) strcpy(fixture->pendingFingerprint, fingerprint);
    return rc;
}

static void sourceReleased(void *context) {
    Fixture *fixture = context;
    atomic_fetch_add(&fixture->sourceReleased, 1);
    if (fixture->owner && fixture->action != 5) require(scalar(fixture->owner, "PRAGMA wal_checkpoint(TRUNCATE)") == 0,
        "Source release notification retained a snapshot lock");
}

FolioleBackupResult fixture_copy(Fixture *fixture, const char *target) {
    FolioleBackupOptions options = {30000, fixture->action == 5 ? NULL : pinned, fixture, committed};
    options.expectedFingerprint = fixture->lastFingerprint[0] ? fixture->lastFingerprint : NULL;
    options.pendingFingerprint = fixture->pendingFingerprint[0] ? fixture->pendingFingerprint : NULL;
    options.snapshotPrepared = prepared;
    options.sourceReleased = sourceReleased;
    atomic_store(&fixture->sourceReleased, 0);
    char *uri = fixture_io_uri(target);
    fixture_io_reset(fixture->ioFault, fixture->action == 5 ? pinned : NULL, fixture);
    fixture->job = foliole_backup_create(fixture->source, uri, &options);
    require(fixture->job != NULL, "Cannot create native job");
    require(foliole_backup_engine_address() == (uintptr_t)&sqlite3_open_v2,
        "Backup and writer use different SQLite engines");
    FolioleBackupResult result;
    foliole_backup_run(fixture->job, &result);
    require(atomic_load(&fixture->sourceReleased) == 1, "Source lifetime was not released exactly once");
    require(foliole_backup_destroy(fixture->job) == SQLITE_OK, "Cannot destroy completed job");
    fixture->job = NULL;
    sqlite3_free(uri);
    if (result.committed) {
        strcpy(fixture->lastFingerprint, result.fingerprint);
        require(writeFingerprint(fixture->lastPath, result.fingerprint) == SQLITE_OK,
            "Cannot retain completed fingerprint");
    }
    return result;
}

void fixture_successful_copy(Fixture *fixture, const char *target) {
    FolioleBackupResult result = fixture_copy(fixture, target);
    if (result.code) fprintf(stderr, "%s\n", result.message);
    require(result.code == SQLITE_OK && result.committed && !result.cleanupPending,
        "Native snapshot did not commit and finish");
    char *journal = sqlite3_mprintf("%s-journal", target);
    require(access(journal, F_OK) != 0, "Successful backup retained a journal");
    sqlite3_free(journal);
}

void fixture_initialize(Fixture *fixture) {
    fixture->owner = openDatabase(fixture->source, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE);
    execute(fixture->owner, "PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;"
        "CREATE TABLE facts(id INTEGER PRIMARY KEY,value TEXT);"
        "INSERT INTO facts VALUES(1,'one');CREATE TABLE events(id INTEGER PRIMARY KEY);"
        "CREATE TABLE payload(data BLOB);INSERT INTO payload VALUES(zeroblob(2000000))");
}

static void sequence(Fixture *fixture, const char *target) {
    fixture_initialize(fixture);
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "SELECT count(*) FROM facts WHERE value='one'", 1);
    execute(fixture->owner, "UPDATE facts SET value='two' WHERE id=1");
    FolioleBackupResult edit = fixture_copy(fixture, target);
    require(edit.code == SQLITE_OK && edit.committed && edit.pagesSent * 10 < edit.sourcePages,
        "Small change rewrote the library");
    require(fixture_io_main_bytes() < 200000 && fixture_io_journal_bytes() < 200000,
        "Small change rewrote the target or journal");
    verifyTarget(target, "SELECT count(*) FROM facts WHERE value='two'", 1);
    FolioleBackupResult unchanged = fixture_copy(fixture, target);
    require(unchanged.code == SQLITE_OK && unchanged.pagesSent * 10 < unchanged.sourcePages,
        "Unchanged backup rewrote the library");
    require(fixture_io_main_bytes() < 200000 && fixture_io_journal_bytes() < 200000,
        "Unchanged backup rewrote the target or journal");
    execute(fixture->owner, "INSERT INTO facts VALUES(2,'removed');DELETE FROM facts WHERE id=2;"
        "CREATE TABLE added(value TEXT);INSERT INTO added VALUES('schema change');"
        "INSERT INTO payload VALUES(zeroblob(4000000))");
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "SELECT count(*) FROM added WHERE value='schema change'", 1);
    execute(fixture->owner, "DELETE FROM payload WHERE rowid>1;VACUUM");
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "SELECT sum(length(data)) FROM payload", 2000000);
    execute(fixture->owner, "UPDATE facts SET value='during copy' WHERE id=1");
    fixture->action = 2;
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "SELECT count(*) FROM events", 0);
    require(scalar(fixture->owner, "SELECT count(*) FROM events") == 32, "Source commits were blocked");
    fixture->action = 0;
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "SELECT count(*) FROM events", 32);
    execute(fixture->owner, "UPDATE facts SET value='target commit' WHERE id=1");
    fixture->action = 5;
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "SELECT count(*) FROM events", 32);
    fixture->action = 0;
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "SELECT count(*) FROM events", 64);
    execute(fixture->owner, "PRAGMA wal_checkpoint(TRUNCATE)");
    printf("{\"passed\":true,\"sourcePages\":%u,\"editPages\":%u,\"unchangedPages\":%u,"
        "\"sourceCommits\":64,\"sourceConnectionsClosed\":128}\n", edit.sourcePages, edit.pagesSent, unchanged.pagesSent);
}

static void ioFailure(Fixture *fixture, const char *target, int mode) {
    fixture_initialize(fixture);
    fixture_successful_copy(fixture, target);
    execute(fixture->owner, "UPDATE facts SET value='after error' WHERE id=1;INSERT INTO events DEFAULT VALUES");
    fixture->ioFault = mode;
    FolioleBackupResult failed = fixture_copy(fixture, target);
    require(failed.code != SQLITE_OK && !failed.committed, "Injected I/O failure falsely succeeded");
    verifyTarget(target, "SELECT count(*) FROM facts WHERE value='one'", 1);
    verifyTarget(target, "SELECT count(*) FROM events", 0);
    fixture->ioFault = 0;
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "SELECT count(*) FROM facts WHERE value='after error'", 1);
    verifyTarget(target, "SELECT count(*) FROM events", 1);
    puts("{\"passed\":true,\"oldTargetRetained\":true,\"retrySucceeded\":true}");
}

static void cancellation(Fixture *fixture, const char *target) {
    fixture_initialize(fixture);
    fixture_successful_copy(fixture, target);
    execute(fixture->owner, "UPDATE facts SET value='pending' WHERE id=1");
    fixture->action = 1;
    FolioleBackupResult cancelled = fixture_copy(fixture, target);
    require(cancelled.code == SQLITE_INTERRUPT && !cancelled.committed, "Cancelled job falsely succeeded");
    verifyTarget(target, "SELECT count(*) FROM facts WHERE value='one'", 1);
    fixture->action = 0;
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "SELECT count(*) FROM facts WHERE value='pending'", 1);
    execute(fixture->owner, "UPDATE facts SET value='committed' WHERE id=1");
    fixture->action = 4;
    FolioleBackupResult completed = fixture_copy(fixture, target);
    require(completed.committed, "Post-commit cancellation lost the committed outcome");
    verifyTarget(target, "SELECT count(*) FROM facts WHERE value='committed'", 1);
    fixture->action = 3;
    fixture_successful_copy(fixture, target);
    require(fixture->owner == NULL, "Owner was not closed during the pinned snapshot");
    fixture->owner = openDatabase(fixture->source, SQLITE_OPEN_READWRITE);
    execute(fixture->owner, "INSERT INTO events DEFAULT VALUES");
    fixture->action = 0;
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "SELECT count(*) FROM events", 1);
    puts("{\"passed\":true,\"cancelledOldTargetRetained\":true,\"committedOutcomeRetained\":true}");
}

int main(int argc, char **argv) {
    require(argc == 3, "Scenario and directory required");
    char *source = sqlite3_mprintf("%s/source.db", argv[2]);
    char *target = sqlite3_mprintf("%s/target.db", argv[2]);
    Fixture fixture = {0};
    atomic_init(&fixture.sourceReleased, 0);
    fixture.source = source;
    fixture.lastPath = sqlite3_mprintf("%s/last.fp", argv[2]);
    fixture.pendingPath = sqlite3_mprintf("%s/pending.fp", argv[2]);
    readFingerprint(fixture.lastPath, fixture.lastFingerprint);
    readFingerprint(fixture.pendingPath, fixture.pendingFingerprint);
    if (!strcmp(argv[1], "sequence")) sequence(&fixture, target);
    else if (!strcmp(argv[1], "foreign")) fixture_ownership(&fixture, target, 0);
    else if (!strcmp(argv[1], "unknown")) fixture_ownership(&fixture, target, 1);
    else if (!strcmp(argv[1], "cancel")) cancellation(&fixture, target);
    else if (!strcmp(argv[1], "io-error")) ioFailure(&fixture, target, 1);
    else if (!strcmp(argv[1], "full-error")) ioFailure(&fixture, target, 2);
    else if (!strcmp(argv[1], "prepare")) {
        fixture_initialize(&fixture);
        fixture_successful_copy(&fixture, target);
    } else {
        fixture.owner = openDatabase(source, SQLITE_OPEN_READWRITE);
        if (!strcmp(argv[1], "crash-commit") || !strcmp(argv[1], "crash-page")) {
            execute(fixture.owner, "UPDATE facts SET value='after crash' WHERE id=1");
            fixture.action = !strcmp(argv[1], "crash-commit") ? 87 : 0;
            fixture.ioFault = !strcmp(argv[1], "crash-page") ? 86 : 0;
            fixture_copy(&fixture, target);
            require(0, "Commit fault did not terminate the process");
        } else {
            const char *value = !strcmp(argv[1], "recover-old") ? "one" : "after crash";
            char *query = sqlite3_mprintf("SELECT count(*) FROM facts WHERE value=%Q", value);
            verifyTarget(target, query, 1);
            sqlite3_free(query);
            fixture_successful_copy(&fixture, target);
        }
    }
    if (fixture.owner) require(sqlite3_close(fixture.owner) == SQLITE_OK, "Cannot close owner");
    sqlite3_free((void *)fixture.lastPath);
    sqlite3_free((void *)fixture.pendingPath);
    sqlite3_free(source);
    sqlite3_free(target);
    return 0;
}
