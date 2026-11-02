import Foundation

enum ContractFailure: Error { case failed(String) }

func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw ContractFailure.failed(message) }
}

func database(_ file: String, readonly: Bool = false) throws -> Database {
    let db = try Database(databaseLocation: "Documents", databaseName: "contractSQLite.db",
        encrypted: false, isEncryption: false, account: "test-only", mode: "no-encryption",
        version: 1, readonly: readonly)
    db.path = file
    try db.open()
    return db
}

func value(_ db: Database, _ sql: String) throws -> Int {
    let rows = try db.selectSQL(sql: sql, values: [])
    return (rows.last?["value"] as? NSNumber)?.intValue ?? -1
}

func seed(_ file: String) throws {
    let db = try database(file)
    defer { try? db.close() }
    // Match bootstrap: initialize WAL and schema before exposing the database to background readers.
    _ = try db.executeSQL(sql: "PRAGMA journal_mode=WAL;", transaction: false)
    _ = try db.executeSQL(sql: """
        CREATE TABLE facts(id INTEGER PRIMARY KEY, body TEXT, payload BLOB);
        INSERT INTO facts VALUES(1, 'retained legacy body', X'010203');
        """)
}

func persistence(_ file: String) throws {
    print("persistence: open writer")
    let writer = try database(file)
    _ = try writer.executeSQL(sql: "PRAGMA journal_mode=WAL;", transaction: false)
    print("persistence: open independent reader")
    let reader = try database(file, readonly: true)
    try require(try value(reader, "SELECT count(*) AS value FROM facts WHERE id=1 AND body='retained legacy body'") == 1,
        "Existing plaintext content was not preserved")
    _ = try writer.beginTransaction()
    _ = try writer.runSQL(sql: "INSERT INTO facts VALUES(?, ?, ?)",
        values: [2, "committed body", [UInt8](arrayLiteral: 4, 5, 6)], transaction: false)
    _ = try writer.commitTransaction()
    try require(try value(reader, "SELECT length(payload) AS value FROM facts WHERE id=2") == 3,
        "Independent reader missed the committed write")
    _ = try writer.beginTransaction()
    _ = try writer.runSQL(sql: "INSERT INTO facts(id, body) VALUES(?, ?)",
        values: [3, "rolled back"], transaction: false)
    _ = try writer.rollbackTransaction()
    try require(try value(reader, "SELECT count(*) AS value FROM facts WHERE id=3") == 0,
        "Rolled-back write became visible")
    try reader.close()
    try writer.close()
    print("persistence: reopen after close")
    let reopened = try database(file)
    defer { try? reopened.close() }
    try require(try value(reopened, "SELECT count(*) AS value FROM facts") == 2,
        "Facts changed after closing and reopening the production backend")
}

func searchAndAttachments(_ file: String) throws {
    let db = try database(file)
    defer { try? db.close() }
    _ = try db.executeSQL(sql: """
        CREATE VIRTUAL TABLE search USING fts5(body, tokenize='trigram');
        INSERT INTO search VALUES('retained searchable body');
        ATTACH ':memory:' AS incoming;
        CREATE TABLE incoming.pack(body TEXT);
        INSERT INTO incoming.pack VALUES('attached body');
        INSERT INTO facts(id, body) SELECT 4, body FROM incoming.pack;
        DETACH incoming;
        """, transaction: false)
    try require(try value(db, "SELECT count(*) AS value FROM search WHERE search MATCH 'searchable'") == 1,
        "FTS5 trigram search did not return retained content")
    try require(try value(db, "SELECT json_extract('{\"count\":7}', '$.count') AS value") == 7,
        "JSON SQL capability is unavailable")
    try require(try value(db, "SELECT count(*) AS value FROM facts WHERE id=4 AND body='attached body'") == 1,
        "Attached staging did not reach the main database")
}

func encryptionUnavailable(_ directory: String) throws {
    let file = directory + "/must-not-create.db"
    var rejected = false
    do {
        let handle = try UtilsSQLCipher.openOrCreateDatabase(filename: file, password: "test-only")
        try? UtilsSQLCipher.close(oDB: handle)
    } catch { rejected = true }
    try require(rejected, "Password-bearing database open silently succeeded")
    try require(!FileManager.default.fileExists(atPath: file), "Rejected encryption created a file")
    let retained = directory + "/legacy.db"
    let before = try Data(contentsOf: URL(fileURLWithPath: retained))
    rejected = false
    do {
        _ = try UtilsEncryption.encryptDatabase(databaseLocation: "Documents", filePath: retained,
            password: "test-only", version: 1)
    } catch { rejected = true }
    try require(rejected, "Database encryption reported success")
    rejected = false
    do { try UtilsSQLCipher.changePassword(filename: retained, password: "", newpassword: "test-only") }
    catch { rejected = true }
    try require(rejected, "Database rekey reported success")
    try require(try Data(contentsOf: URL(fileURLWithPath: retained)) == before,
        "Rejected encryption modified the plaintext source file")
}

func retainedPlaintext(_ file: String) throws {
    let writer = try database(file)
    try require(try value(writer, "SELECT count(*) AS value FROM facts WHERE id=1 AND body='retained legacy body'") == 1,
        "Previously created plaintext content was lost")
    _ = try writer.runSQL(sql: "INSERT INTO facts(id, body) VALUES(?, ?)", values: [2, "system SQLite update"])
    try writer.close()
    let reopened = try database(file)
    defer { try? reopened.close() }
    try require(try value(reopened, "SELECT count(*) AS value FROM facts WHERE id IN (1,2)") == 2,
        "Existing plaintext database did not preserve a subsequent write")
}

@main struct SqliteSystemBackendContract {
    static func main() {
        do { try run() }
        catch {
            FileHandle.standardError.write(Data("\(error)\n".utf8))
            exit(1)
        }
    }

    static func run() throws {
        let directory = CommandLine.arguments[2]
        let file = directory + "/legacy.db"
        switch CommandLine.arguments[1] {
        case "seed": try seed(file)
        case "engine":
            let db = try database(file)
            defer { try? db.close() }
            let rows = try db.selectSQL(sql: "PRAGMA cipher_version", values: [])
            try require(rows.filter { $0["ios_columns"] == nil }.isEmpty,
                "The production database backend still contains SQLCipher")
        case "persistence": try persistence(file)
        case "legacy": try retainedPlaintext(file)
        case "search": try searchAndAttachments(file)
        case "reject-encryption": try encryptionUnavailable(directory)
        default: throw ContractFailure.failed("Unknown scenario")
        }
        print("production SQLite backend contract passed")
    }
}
