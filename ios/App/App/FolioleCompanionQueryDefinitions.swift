import Foundation

struct FolioleCompanionGeneratedQuery {
    struct Column {
        let key: String
        let type: String
    }

    let columns: [Column]
    let resultKey: String
    let sql: String

    func replacing(_ replacements: [String: String]) -> FolioleCompanionGeneratedQuery {
        FolioleCompanionGeneratedQuery(
            columns: columns,
            resultKey: resultKey,
            sql: replacements.reduce(sql) { value, replacement in
                value.replacingOccurrences(of: replacement.key, with: replacement.value)
            }
        )
    }
}

struct FolioleCompanionGeneratedField {
    let outputKey: String
    let rowKey: String
}

final class FolioleCompanionQueryDefinitions {
    private let root: [String: Any]

    init(bundle: Bundle = .main) throws {
        guard let url = bundle.url(forResource: "companion-query-definitions", withExtension: "json") else {
            throw Self.error("missing resource")
        }
        let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        guard let root = value as? [String: Any] else { throw Self.error("invalid root") }
        self.root = root
    }

    func object(_ path: [String], root customRoot: [String: Any]? = nil) throws -> [String: Any] {
        var current: Any = customRoot ?? root
        for key in path {
            guard let object = current as? [String: Any], let next = object[key] else {
                throw Self.error(path.joined(separator: "."))
            }
            current = next
        }
        guard let result = current as? [String: Any] else { throw Self.error(path.joined(separator: ".")) }
        return result
    }

    func string(_ key: String, in root: [String: Any]) throws -> String {
        guard let value = root[key] as? String, !value.isEmpty else { throw Self.error(key) }
        return value
    }

    func integer(_ key: String, in root: [String: Any]) throws -> Int {
        guard let number = root[key] as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue == Double(number.intValue) else { throw Self.error(key) }
        return number.intValue
    }

    func fields(_ key: String, in root: [String: Any]) throws -> [FolioleCompanionGeneratedField] {
        guard let values = root[key] as? [[String: Any]], !values.isEmpty else { throw Self.error(key) }
        return try values.map { field in
            FolioleCompanionGeneratedField(
                outputKey: try string("outputKey", in: field),
                rowKey: try string("rowKey", in: field)
            )
        }
    }

    func objects(_ key: String, in root: [String: Any]) throws -> [[String: Any]] {
        guard let values = root[key] as? [[String: Any]] else { throw Self.error(key) }
        return values
    }

    func optionalString(_ key: String, in root: [String: Any]) -> String? {
        guard let value = root[key] as? String, !value.isEmpty else { return nil }
        return value
    }

    func query(
        named name: String,
        defaultColumnKey: String? = nil,
        defaultResultKey: String? = nil
    ) throws -> FolioleCompanionGeneratedQuery {
        let definition = try object(["queries", name])
        let rawColumns = definition["columns"] as? [[String: Any]] ?? []
        let columns: [FolioleCompanionGeneratedQuery.Column]
        if rawColumns.isEmpty, let defaultColumnKey {
            columns = [.init(key: defaultColumnKey, type: "nullableString")]
        } else {
            guard !rawColumns.isEmpty else { throw Self.error("queries.\(name).columns") }
            columns = try rawColumns.map { column in
                FolioleCompanionGeneratedQuery.Column(
                    key: try string("key", in: column),
                    type: try string("type", in: column)
                )
            }
        }
        guard let resultKey = optionalString("resultKey", in: definition) ?? defaultResultKey else {
            throw Self.error("queries.\(name).resultKey")
        }
        return FolioleCompanionGeneratedQuery(
            columns: columns,
            resultKey: resultKey,
            sql: try string("sql", in: definition)
        )
    }

    private static func error(_ detail: String) -> NSError {
        NSError(
            domain: "FolioleCompanionQueryDefinitions",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Invalid companion query definitions: \(detail)"]
        )
    }
}
