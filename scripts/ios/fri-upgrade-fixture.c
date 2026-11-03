#include <sqlite3.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void check(int ok, const char *message) {
    if (!ok) { fprintf(stderr, "%s\n", message); exit(1); }
}

int main(int argc, char **argv) {
    check(argc == 3, "Expected source fixture and destination database");
    sqlite3 *source = NULL, *target = NULL;
    check(sqlite3_open_v2(argv[1], &source, SQLITE_OPEN_READONLY, NULL) == SQLITE_OK, "Open legacy fixture");
    check(sqlite3_open(argv[2], &target) == SQLITE_OK, "Create legacy database");
    sqlite3_stmt *version = NULL;
    check(sqlite3_prepare_v2(target, "PRAGMA cipher_version", -1, &version, NULL) == SQLITE_OK, "Read cipher version");
    check(sqlite3_step(version) == SQLITE_ROW, "Missing cipher version");
    const char *cipher = (const char *)sqlite3_column_text(version, 0);
    check(cipher && !strncmp(cipher, "4.17.0", 6), "Fixture must use SQLCipher 4.17.0");
    printf("legacyCipher=%s\n", cipher);
    sqlite3_finalize(version);
    sqlite3_backup *backup = sqlite3_backup_init(target, "main", source, "main");
    check(backup != NULL, "Start old-engine backup");
    check(sqlite3_backup_step(backup, -1) == SQLITE_DONE, "Copy old database");
    check(sqlite3_backup_finish(backup) == SQLITE_OK, "Finish old-engine backup");
    const char *sql = "PRAGMA journal_mode=DELETE; UPDATE nodes SET content='Legacy upgrade retained sentence.' "
        "WHERE id='upgrade-node';";
    check(sqlite3_exec(target, sql, NULL, NULL, NULL) == SQLITE_OK, sqlite3_errmsg(target));
    check(sqlite3_close(source) == SQLITE_OK && sqlite3_close(target) == SQLITE_OK, "Close old database");
    return 0;
}
