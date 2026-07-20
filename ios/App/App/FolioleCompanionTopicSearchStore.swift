import Foundation

final class FolioleCompanionTopicSearchStore {
    private let contract: FolioleCompanionTopicSearchContract
    private let database: FolioleReadOnlySQLite

    init(databaseURL: URL, contract: FolioleCompanionTopicSearchContract) throws {
        self.contract = contract
        database = try FolioleReadOnlySQLite(url: databaseURL)
    }

    func search(query: String, limit: Int?) throws -> [String: Any] {
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let responseQueryKey = try value("query", in: contract.responseKeys)
        let responseResultsKey = try value("results", in: contract.responseKeys)
        guard !normalizedQuery.isEmpty else {
            return [responseQueryKey: query, responseResultsKey: []]
        }
        let resolvedLimit = max(1, min(limit ?? contract.defaultLimit, contract.maxLimit))
        let arguments = Array(repeating: normalizedQuery, count: 5) + [String(resolvedLimit)]
        let results = try database.rows(contract.sql, arguments: arguments).map(result)
        return [responseQueryKey: query, responseResultsKey: results]
    }

    private func result(_ row: [String?]) throws -> [String: Any] {
        guard row.count == 7 else { throw error("Topic search returned an invalid row.") }
        return [
            try value("nodeId", in: contract.resultKeys): row[0] ?? "",
            try value("title", in: contract.resultKeys): row[1] ?? "",
            try value("openingText", in: contract.resultKeys): nullable(row[2]),
            try value("contentStatus", in: contract.resultKeys): row[3] ?? "missing",
            try value("updatedAt", in: contract.resultKeys): row[4] ?? "",
            try value("matchStart", in: contract.resultKeys): Int(row[5] ?? "") ?? 0,
            try value("excerpt", in: contract.resultKeys): row[6] ?? ""
        ]
    }

    private func value(_ key: String, in values: [String: String]) throws -> String {
        guard let value = values[key] else { throw error("Missing topic search contract key \(key).") }
        return value
    }

    private func nullable(_ value: String?) -> Any { value ?? NSNull() }

    private func error(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionTopicSearch", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
