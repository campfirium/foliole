import Foundation

struct FolioleCompanionGeneratedQuery {
    struct Column {
        let key: String
        let type: String
    }

    let columns: [Column]
    let sql: String
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

    func query(named name: String) throws -> FolioleCompanionGeneratedQuery {
        let definition = try object(["queries", name])
        let rawColumns = definition["columns"] as? [[String: Any]] ?? []
        guard !rawColumns.isEmpty else { throw Self.error("queries.\(name).columns") }
        return FolioleCompanionGeneratedQuery(
            columns: try rawColumns.map { column in
                FolioleCompanionGeneratedQuery.Column(
                    key: try string("key", in: column),
                    type: try string("type", in: column)
                )
            },
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
