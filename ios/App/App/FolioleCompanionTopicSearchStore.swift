import Foundation

struct FolioleCompanionTopicSearchContract {
    let defaultLimit: Int
    let maxLimit: Int
    let requestKeys: [String: String]
    let responseKeys: [String: String]
    let searchQuery: FolioleCompanionGeneratedQuery
    let searchResultFields: [FolioleCompanionGeneratedField]
}

final class FolioleCompanionTopicSearchContractStore {
    private let definitions: FolioleCompanionQueryDefinitions

    init(bundle: Bundle = .main) throws {
        definitions = try FolioleCompanionQueryDefinitions(bundle: bundle)
    }

    func contract() throws -> FolioleCompanionTopicSearchContract {
        let rules = try definitions.object(["contentRead", "topicSearch"])
        return FolioleCompanionTopicSearchContract(
            defaultLimit: try definitions.integer("defaultSearchLimit", in: rules),
            maxLimit: try definitions.integer("maxSearchLimit", in: rules),
            requestKeys: try stringMap("requestKeys", in: rules),
            responseKeys: try stringMap("responseKeys", in: rules),
            searchQuery: try definitions.query(named: definitions.string("searchQueryName", in: rules)),
            searchResultFields: try definitions.fields("searchResultFields", in: rules)
        )
    }

    private func stringMap(_ key: String, in root: [String: Any]) throws -> [String: String] {
        let values = try definitions.object([key], root: root)
        return try values.reduce(into: [:]) { result, entry in
            result[entry.key] = try definitions.string(entry.key, in: values)
        }
    }
}

final class FolioleCompanionTopicSearchStore {
    private let contract: FolioleCompanionTopicSearchContract
    private let queries: FolioleCompanionGeneratedReadQueryRunner

    init(databaseURL: URL, contract: FolioleCompanionTopicSearchContract) throws {
        self.contract = contract
        queries = try FolioleCompanionGeneratedReadQueryRunner(databaseURL: databaseURL)
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
        let results = try queries.rows(
            contract.searchQuery,
            fields: contract.searchResultFields,
            arguments: arguments
        )
        return [responseQueryKey: query, responseResultsKey: results]
    }

    private func value(_ key: String, in values: [String: String]) throws -> String {
        guard let value = values[key] else { throw error("Missing topic search contract key \(key).") }
        return value
    }

    private func error(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionTopicSearch", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
