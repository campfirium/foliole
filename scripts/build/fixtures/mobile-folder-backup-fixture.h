#include "FolioleFolderBackup.h"
#include "sqlite3.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <stdatomic.h>

typedef struct Fixture {
    sqlite3 *owner;
    FolioleBackupJob *job;
    const char *source;
    int action;
    int ioFault;
    const char *lastPath;
    const char *pendingPath;
    char lastFingerprint[41];
    char pendingFingerprint[41];
    atomic_int sourceReleased;
} Fixture;

FolioleBackupResult fixture_copy(Fixture *fixture, const char *target);
void fixture_initialize(Fixture *fixture);
void fixture_successful_copy(Fixture *fixture, const char *target);
void fixture_ownership(Fixture *fixture, const char *target, int unknown);

static void require(int condition, const char *message) {
    if (!condition) { fprintf(stderr, "%s\n", message); exit(1); }
}

static void execute(sqlite3 *db, const char *sql) {
    char *error = NULL;
    int rc = sqlite3_exec(db, sql, NULL, NULL, &error);
    if (rc) fprintf(stderr, "%s\n", error ? error : sqlite3_errmsg(db));
    sqlite3_free(error);
    require(rc == SQLITE_OK, "Fixture SQL failed");
}

static int scalar(sqlite3 *db, const char *sql) {
    sqlite3_stmt *statement = NULL;
    require(sqlite3_prepare_v2(db, sql, -1, &statement, NULL) == SQLITE_OK, sqlite3_errmsg(db));
    require(sqlite3_step(statement) == SQLITE_ROW, sqlite3_errmsg(db));
    int value = sqlite3_column_int(statement, 0);
    sqlite3_finalize(statement);
    return value;
}

static sqlite3 *openDatabase(const char *path, int flags) {
    sqlite3 *db = NULL;
    require(sqlite3_open_v2(path, &db, flags, NULL) == SQLITE_OK, "Fixture open failed");
    return db;
}

static void verifyTarget(const char *path, const char *query, int expected) {
    sqlite3 *db = openDatabase(path, SQLITE_OPEN_READWRITE);
    require(scalar(db, "SELECT integrity_check='ok' FROM pragma_integrity_check") == 1,
        "Target integrity failed");
    require(scalar(db, query) == expected, "Target facts differ from expected snapshot");
    sqlite3_close(db);
}

/* Simulate private durable backup metadata; never store this beside a real
 * user-authorized backup. Each fixture root represents the whole test sandbox. */
static void readFingerprint(const char *path, char output[41]) {
    FILE *file = fopen(path, "rb");
    if (!file) return;
    require(fread(output, 1, 40, file) == 40, "Incomplete fixture fingerprint");
    output[40] = 0;
    fclose(file);
}

static int writeFingerprint(const char *path, const char *value) {
    FILE *file = fopen(path, "wb");
    if (!file) return SQLITE_IOERR;
    int ok = fwrite(value, 1, 40, file) == 40 && !fflush(file) && !fsync(fileno(file));
    if (fclose(file)) ok = 0;
    return ok ? SQLITE_OK : SQLITE_IOERR;
}
