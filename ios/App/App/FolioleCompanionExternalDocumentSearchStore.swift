import Foundation

struct FolioleCompanionExternalDocumentSearchContract {
    let defaultLimit: Int
    let maxLimit: Int
    let queryKey: String
    let resultsKey: String
    let searchQuery: FolioleCompanionGeneratedQuery
}

final class FolioleCompanionExternalDocumentSearchContractStore {
    private let definitions: FolioleCompanionQueryDefinitions

    init(bundle: Bundle = .main) throws {
        definitions = try FolioleCompanionQueryDefinitions(bundle: bundle)
    }

    func contract() throws -> FolioleCompanionExternalDocumentSearchContract {
        let rules = try definitions.object(["contentRead", "externalDocuments"])
        let outputs = try definitions.object(["outputKeys"], root: rules)
        return FolioleCompanionExternalDocumentSearchContract(
            defaultLimit: try definitions.integer("defaultSearchLimit", in: rules),
            maxLimit: try definitions.integer("maxSearchLimit", in: rules),
            queryKey: try definitions.string("query", in: outputs),
            resultsKey: try definitions.string("results", in: outputs),
            searchQuery: try definitions.query(named: definitions.string("searchQueryName", in: rules))
        )
    }
}

final class FolioleCompanionExternalDocumentSearchStore {
    private let contract: FolioleCompanionExternalDocumentSearchContract
    private let queries: FolioleCompanionGeneratedReadQueryRunner

    init(databaseURL: URL, contract: FolioleCompanionExternalDocumentSearchContract) throws {
        self.contract = contract
        queries = try FolioleCompanionGeneratedReadQueryRunner(databaseURL: databaseURL)
    }

    func search(query: String, limit: Int?) throws -> [String: Any] {
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedQuery.isEmpty else {
            return [contract.queryKey: query, contract.resultsKey: []]
        }
        let requestedLimit = limit.flatMap { $0 > 0 ? $0 : nil } ?? contract.defaultLimit
        let resolvedLimit = min(requestedLimit, contract.maxLimit)
        let arguments = Array(repeating: normalizedQuery, count: 7) + [String(resolvedLimit)]
        return [
            contract.queryKey: query,
            contract.resultsKey: try queries.rows(contract.searchQuery, arguments: arguments)
        ]
    }
}
