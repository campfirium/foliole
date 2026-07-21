import Foundation

final class FolioleCompanionGeneratedReadQueryRunner {
    private let database: FolioleReadOnlySQLite

    init(databaseURL: URL) throws {
        database = try FolioleReadOnlySQLite(url: databaseURL)
    }

    func rows(_ query: FolioleCompanionGeneratedQuery, arguments: [String] = []) throws -> [[String: Any]] {
        try mapRows(database.rows(query.sql, arguments: arguments), query: query)
    }

    func rows(
        _ query: FolioleCompanionGeneratedQuery,
        fields: [FolioleCompanionGeneratedField],
        arguments: [String] = []
    ) throws -> [[String: Any]] {
        try rows(query, arguments: arguments).map { row in
            Dictionary(uniqueKeysWithValues: fields.map { field in
                (field.outputKey, row[field.rowKey] ?? NSNull())
            })
        }
    }

    func typedRows(
        _ query: FolioleCompanionGeneratedQuery,
        bindings: [FolioleReadOnlySQLite.Binding]
    ) throws -> [[String: Any]] {
        try mapRows(database.rows(query.sql, bindings: bindings), query: query)
    }

    private func mapRows(
        _ rows: [[String?]],
        query: FolioleCompanionGeneratedQuery
    ) throws -> [[String: Any]] {
        try rows.map { row in
            guard row.count == query.columns.count else { throw Self.error("Query returned an invalid row.") }
            return Dictionary(uniqueKeysWithValues: try zip(query.columns, row).map { column, value in
                (column.key, try Self.value(value, column: column))
            })
        }
    }

    private static func value(_ value: String?, column: FolioleCompanionGeneratedQuery.Column) throws -> Any {
        guard let value else { return NSNull() }
        if column.type == "long" {
            guard let result = Int(value) else { throw error("Invalid long value for \(column.key).") }
            return result
        }
        if column.type == "double" {
            guard let result = Double(value), result.isFinite else {
                throw error("Invalid double value for \(column.key).")
            }
            return result
        }
        return value
    }

    private static func error(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionGeneratedReadQuery", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
