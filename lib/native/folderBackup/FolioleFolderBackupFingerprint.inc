/* A content fingerprint for ownership/recovery, using the upstream hash engine.
 * Canonicalize only the pager-owned header metadata that rsync may change.
 * This is a change detector, not authentication or an encryption primitive. */
static int hashPage(HashContext *hash, sqlite3_int64 page, const unsigned char *data, int size) {
    if (!data || size < 100 || page < 1 || page > 0xfffffffe) return SQLITE_CORRUPT;
    unsigned char number[4] = {page >> 24, page >> 16, page >> 8, page};
    HashUpdate(hash, number, sizeof(number));
    if (page == 1) {
        unsigned char header[100];
        memcpy(header, data, sizeof(header));
        header[18] = header[19] = 0;
        memset(header + 24, 0, 4);
        memset(header + 92, 0, 8);
        HashUpdate(hash, header, sizeof(header));
        HashUpdate(hash, data + sizeof(header), size - sizeof(header));
    } else HashUpdate(hash, data, size);
    return SQLITE_OK;
}

static int fingerprint(sqlite3 *db, const char *schema, char output[41]) {
    char *sql = sqlite3_mprintf("SELECT pgno,data FROM sqlite_dbpage(%Q) ORDER BY pgno", schema);
    if (!sql) return SQLITE_NOMEM;
    sqlite3_stmt *statement = NULL;
    int rc = sqlite3_prepare_v2(db, sql, -1, &statement, NULL);
    sqlite3_free(sql);
    if (rc != SQLITE_OK) return rc;
    HashContext hash;
    HashInit(&hash, 160);
    while ((rc = sqlite3_step(statement)) == SQLITE_ROW) {
        rc = hashPage(&hash, sqlite3_column_int64(statement, 0),
            sqlite3_column_blob(statement, 1), sqlite3_column_bytes(statement, 1));
        if (rc != SQLITE_OK) break;
    }
    if (rc == SQLITE_DONE) {
        const unsigned char *bytes = HashFinal(&hash);
        const char hex[] = "0123456789abcdef";
        for (int i = 0; i < 20; i++) {
            output[i * 2] = hex[bytes[i] >> 4];
            output[i * 2 + 1] = hex[bytes[i] & 15];
        }
        output[40] = 0;
        rc = SQLITE_OK;
    }
    sqlite3_finalize(statement);
    return rc;
}
