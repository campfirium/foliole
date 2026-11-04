#include <sqlite3.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void require(int condition, const char *message) {
    if (!condition) { fprintf(stderr, "%s\n", message); exit(1); }
}

static void execute(sqlite3 *db, const char *sql) {
    char *error = NULL;
    int result = sqlite3_exec(db, sql, NULL, NULL, &error);
    if (result != SQLITE_OK) fprintf(stderr, "%s: %s\n", sql, error ? error : sqlite3_errmsg(db));
    sqlite3_free(error);
    require(result == SQLITE_OK, "SQL operation failed");
}

static int scalar(sqlite3 *db, const char *sql) {
    sqlite3_stmt *statement = NULL;
    require(sqlite3_prepare_v2(db, sql, -1, &statement, NULL) == SQLITE_OK, sqlite3_errmsg(db));
    require(sqlite3_step(statement) == SQLITE_ROW, sqlite3_errmsg(db));
    int result = sqlite3_column_int(statement, 0);
    sqlite3_finalize(statement);
    return result;
}

static sqlite3 *open_database(const char *file, int encrypted) {
    sqlite3 *db = NULL;
    require(sqlite3_open(file, &db) == SQLITE_OK, "Cannot open test database");
    if (encrypted) execute(db, "PRAGMA key='public regression-test key'");
    return db;
}

static void create_database(const char *file, int encrypted) {
    sqlite3 *db = open_database(file, encrypted);
    execute(db, "CREATE TABLE facts(id INTEGER PRIMARY KEY, value TEXT NOT NULL);"
        "CREATE VIRTUAL TABLE search USING fts5(value);"
        "ATTACH ':memory:' AS incoming;"
        "CREATE TABLE incoming.stage(id INTEGER, value TEXT);"
        "INSERT INTO incoming.stage VALUES(1,'retained native content');"
        "BEGIN; INSERT INTO facts SELECT * FROM incoming.stage;"
        "INSERT INTO search SELECT value FROM facts; COMMIT; DETACH incoming;");
    require(scalar(db, "SELECT count(*) FROM facts") == 1, "Initial write missing");
    require(sqlite3_close(db) == SQLITE_OK, "Cannot close created database");
}

static void verify_database(const char *file, int encrypted) {
    if (encrypted) {
        sqlite3 *wrong = open_database(file, 0);
        execute(wrong, "PRAGMA key='incorrect key'");
        require(sqlite3_exec(wrong, "SELECT * FROM facts", NULL, NULL, NULL) != SQLITE_OK,
            "Incorrect key unexpectedly read encrypted content");
        sqlite3_close(wrong);
    }
    sqlite3 *db = open_database(file, encrypted);
    require(scalar(db, "SELECT count(*) FROM facts WHERE value='retained native content'") == 1,
        "Content changed after reopening");
    require(scalar(db, "SELECT count(*) FROM search WHERE search MATCH 'native'") == 1,
        "FTS content changed after reopening");
    execute(db, "BEGIN; INSERT OR REPLACE INTO facts VALUES(2,'subsequent write'); COMMIT;");
    sqlite3_close(db);
    db = open_database(file, encrypted);
    require(scalar(db, "SELECT count(*) FROM facts WHERE id=2 AND value='subsequent write'") == 1,
        "Subsequent transaction was not persisted");
    sqlite3_close(db);
}

static void reject_invalid_hexkey(const char *uri) {
    sqlite3 *db = NULL;
    int result = sqlite3_open_v2(uri, &db,
        SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI, NULL);
    require(result != SQLITE_OK, "Invalid hexkey silently created a database");
    if (db) sqlite3_close(db);
}

static void export_quoted_alias(void) {
    sqlite3 *db = open_database(":memory:", 0);
    execute(db, "CREATE TABLE sentinel(id INTEGER); INSERT INTO sentinel VALUES(1);"
        "ATTACH ':memory:' AS \"odd'; DROP TABLE sentinel; --\"");
    sqlite3_stmt *statement = NULL;
    require(sqlite3_prepare_v2(db, "SELECT sqlcipher_export(?1)", -1, &statement, NULL) == SQLITE_OK,
        "Cannot prepare export");
    sqlite3_bind_text(statement, 1, "odd'; DROP TABLE sentinel; --", -1, SQLITE_STATIC);
    require(sqlite3_step(statement) == SQLITE_ROW, sqlite3_errmsg(db));
    sqlite3_finalize(statement);
    require(scalar(db, "SELECT count(*) FROM main.sentinel") == 1, "Source sentinel changed");
    require(scalar(db, "SELECT count(*) FROM \"odd'; DROP TABLE sentinel; --\".sentinel") == 1,
        "Quoted destination was not exported");
    sqlite3_close(db);
}

static void verify_readonly_page_access(const char *file) {
    create_database(file, 0);
    sqlite3 *db = NULL;
    require(sqlite3_open_v2(file, &db, SQLITE_OPEN_READONLY, NULL) == SQLITE_OK,
        "Cannot open readonly page source");
    require(sqlite3_compileoption_used("ENABLE_DBPAGE_VTAB"), "Page access is not compiled in");
    require(scalar(db, "SELECT length(data) FROM sqlite_dbpage WHERE pgno=1") > 0,
        "Cannot read a consistent source page");
    require(sqlite3_exec(db, "INSERT INTO sqlite_dbpage(pgno,data) "
        "SELECT pgno,data FROM sqlite_dbpage WHERE pgno=1", NULL, NULL, NULL) != SQLITE_OK,
        "Readonly source unexpectedly accepted a page write");
    require(scalar(db, "SELECT count(*) FROM facts") == 1, "Readonly page access changed facts");
    sqlite3_close(db);
}

int main(int argc, char **argv) {
    require(argc >= 2, "Scenario required");
    if (!strcmp(argv[1], "alias")) export_quoted_alias();
    else {
        require(argc >= 3, "Test file required");
        if (!strcmp(argv[1], "hexkey")) reject_invalid_hexkey(argv[2]);
        else if (!strcmp(argv[1], "dbpage")) verify_readonly_page_access(argv[2]);
        else {
            int encrypted = argc > 3 && !strcmp(argv[3], "encrypted");
            if (!strcmp(argv[1], "create")) create_database(argv[2], encrypted);
            else if (!strcmp(argv[1], "verify")) verify_database(argv[2], encrypted);
            else require(0, "Unknown scenario");
        }
    }
    puts("native SQLCipher contract passed");
    return 0;
}
