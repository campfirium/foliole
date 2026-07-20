import Foundation

final class FolioleCompanionGeneratedReadQueryRunner {
    private let database: FolioleReadOnlySQLite

    init(databaseURL: URL) throws {
        database = try FolioleReadOnlySQLite(url: databaseURL)
    }

    func rows(_ query: FolioleCompanionGeneratedQuery, arguments: [String] = []) throws -> [[String: Any]] {
        try database.rows(query.sql, arguments: arguments).map { row in
            guard row.count == query.columns.count else { throw Self.error("Query returned an invalid row.") }
            return Dictionary(uniqueKeysWithValues: zip(query.columns, row).map { column, value in
                (column.key, Self.value(value, type: column.type))
            })
        }
    }

    private static func value(_ value: String?, type: String) -> Any {
        guard let value else { return NSNull() }
        if type == "long" { return Int(value) ?? 0 }
        if type == "double" { return Double(value) ?? 0 }
        return value
    }

    private static func error(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionGeneratedReadQuery", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
