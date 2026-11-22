#include "mobile-folder-backup-fixture.h"

/* The Apple engine defaults new databases to full auto-vacuum, while restored
 * or older libraries may use another mode. Each copy must reproduce the
 * source's pages exactly instead of letting the target vacuum them at commit. */
static void changeMode(Fixture *fixture, const char *mode) {
    char *sql = sqlite3_mprintf("PRAGMA journal_mode=DELETE;PRAGMA auto_vacuum=%s;VACUUM;"
        "PRAGMA journal_mode=WAL", mode);
    execute(fixture->owner, sql);
    sqlite3_free(sql);
}

static void copyMode(Fixture *fixture, const char *target, int mode, int round) {
    char *sql = sqlite3_mprintf("UPDATE facts SET value='round %d' WHERE id=1;"
        "INSERT INTO payload VALUES(zeroblob(1000000));DELETE FROM payload WHERE rowid>1", round);
    execute(fixture->owner, sql);
    sqlite3_free(sql);
    require(scalar(fixture->owner, "PRAGMA auto_vacuum") == mode, "Source auto-vacuum mode was not prepared");
    require(mode == 1 || scalar(fixture->owner, "PRAGMA freelist_count") > 0, "Source has no free pages");
    fixture_successful_copy(fixture, target);
    verifyTarget(target, "PRAGMA auto_vacuum", mode);
    char *query = sqlite3_mprintf("SELECT count(*) FROM facts WHERE value='round %d'", round);
    verifyTarget(target, query, 1);
    sqlite3_free(query);
}

void fixture_autovacuum(Fixture *fixture, const char *target) {
    fixture->owner = openDatabase(fixture->source, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE);
    execute(fixture->owner, "PRAGMA auto_vacuum=NONE;PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;"
        "CREATE TABLE facts(id INTEGER PRIMARY KEY,value TEXT);INSERT INTO facts VALUES(1,'one');"
        "CREATE TABLE events(id INTEGER PRIMARY KEY);"
        "CREATE TABLE payload(data BLOB);INSERT INTO payload VALUES(zeroblob(2000000))");
    copyMode(fixture, target, 0, 1);
    changeMode(fixture, "FULL");
    copyMode(fixture, target, 1, 2);
    changeMode(fixture, "NONE");
    copyMode(fixture, target, 0, 3);
    changeMode(fixture, "INCREMENTAL");
    copyMode(fixture, target, 2, 4);
    changeMode(fixture, "FULL");
    copyMode(fixture, target, 1, 5);
    copyMode(fixture, target, 1, 6);
    puts("{\"passed\":true,\"modes\":[\"none\",\"full\",\"none\",\"incremental\",\"full\"]}");
}
