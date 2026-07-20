import Foundation

struct FolioleCompanionPdfPageTextContract {
    let attachmentIdKey: String
    let defaultSearchLimit: Int
    let excerptKey: String
    let matchStartKey: String
    let maxSearchLimit: Int
    let pageHeightKey: String
    let pageKey: String
    let pagesResultKey: String
    let pagesSQL: String
    let pageWidthKey: String
    let queryKey: String
    let searchResultKey: String
    let searchSQL: String
    let textKey: String
}

final class FolioleCompanionPdfPageTextContractStore {
    private let definitions: [String: Any]

    init(bundle: Bundle = .main) throws {
        guard let url = bundle.url(forResource: "companion-query-definitions", withExtension: "json") else {
            throw Self.error("missing companion-query-definitions resource")
        }
        let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        guard let definitions = value as? [String: Any] else { throw Self.error("invalid root") }
        self.definitions = definitions
    }

    func contract() throws -> FolioleCompanionPdfPageTextContract {
        let rules = try object(["resourceRead", "pdfPageText"])
        let outputs = try object(["outputKeys"], root: rules)
        return FolioleCompanionPdfPageTextContract(
            attachmentIdKey: try string("attachmentIdKey", in: rules),
            defaultSearchLimit: try integer("defaultSearchLimit", in: rules),
            excerptKey: try string("excerpt", in: outputs),
            matchStartKey: try string("matchStart", in: outputs),
            maxSearchLimit: try integer("maxSearchLimit", in: rules),
            pageHeightKey: try string("pageHeightKey", in: rules),
            pageKey: try string("pageKey", in: rules),
            pagesResultKey: try string("pagesResultKey", in: rules),
            pagesSQL: try querySQL(named: try string("pagesQueryName", in: rules)),
            pageWidthKey: try string("pageWidthKey", in: rules),
            queryKey: try string("query", in: outputs),
            searchResultKey: try string("searchResultKey", in: rules),
            searchSQL: try querySQL(named: try string("searchQueryName", in: rules)),
            textKey: try string("textKey", in: rules)
        )
    }

    private func querySQL(named name: String) throws -> String {
        let query = try object(["queries", name])
        return try string("sql", in: query)
    }

    private func object(_ path: [String], root: [String: Any]? = nil) throws -> [String: Any] {
        var current: Any = root ?? definitions
        for key in path {
            guard let object = current as? [String: Any], let next = object[key] else {
                throw Self.error(path.joined(separator: "."))
            }
            current = next
        }
        guard let result = current as? [String: Any] else { throw Self.error(path.joined(separator: ".")) }
        return result
    }

    private func string(_ key: String, in root: [String: Any]) throws -> String {
        guard let value = root[key] as? String, !value.isEmpty else { throw Self.error(key) }
        return value
    }

    private func integer(_ key: String, in root: [String: Any]) throws -> Int {
        guard let number = root[key] as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue == Double(number.intValue) else { throw Self.error(key) }
        return number.intValue
    }

    private static func error(_ detail: String) -> NSError {
        NSError(
            domain: "FolioleCompanionPdfPageTextContract",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Invalid PDF page text contract: \(detail)"]
        )
    }
}
