import Foundation

struct FolioleCompanionExternalDocumentSearchContract {
    let absolutePathKey: String
    let byIdQuery: FolioleCompanionGeneratedQuery
    let defaultLimit: Int
    let directoryEntryFields: [FolioleCompanionGeneratedField]
    let directoryEntriesQuery: FolioleCompanionGeneratedQuery
    let documentFields: [FolioleCompanionGeneratedField]
    let documentIdKey: String
    let documentKey: String
    let entriesKey: String
    let foldersKey: String
    let foldersQuery: FolioleCompanionGeneratedQuery
    let maxLimit: Int
    let queryKey: String
    let resultsKey: String
    let searchQuery: FolioleCompanionGeneratedQuery
    let searchResultFields: [FolioleCompanionGeneratedField]
}

final class FolioleCompanionExternalDocumentSearchContractStore {
    private let definitions: FolioleCompanionQueryDefinitions

    init(bundle: Bundle = .main) throws {
        definitions = try FolioleCompanionQueryDefinitions(bundle: bundle)
    }

    func contract() throws -> FolioleCompanionExternalDocumentSearchContract {
        let rules = try definitions.object(["contentRead", "externalDocuments"])
        let outputs = try definitions.object(["outputKeys"], root: rules)
        let rowKeys = try definitions.object(["rowKeys"], root: rules)
        return FolioleCompanionExternalDocumentSearchContract(
            absolutePathKey: try definitions.string("absolutePath", in: outputs),
            byIdQuery: try definitions.query(named: definitions.string("byIdQueryName", in: rules)),
            defaultLimit: try definitions.integer("defaultSearchLimit", in: rules),
            directoryEntryFields: try definitions.fields("directoryEntryFields", in: rules),
            directoryEntriesQuery: try definitions.query(named: definitions.string("directoryEntriesQueryName", in: rules)),
            documentFields: try definitions.fields("documentFields", in: rules),
            documentIdKey: try definitions.string("documentId", in: rowKeys),
            documentKey: try definitions.string("document", in: outputs),
            entriesKey: try definitions.string("entries", in: outputs),
            foldersKey: try definitions.string("foldersResultKey", in: rules),
            foldersQuery: try definitions.query(named: definitions.string("foldersQueryName", in: rules)),
            maxLimit: try definitions.integer("maxSearchLimit", in: rules),
            queryKey: try definitions.string("query", in: outputs),
            resultsKey: try definitions.string("results", in: outputs),
            searchQuery: try definitions.query(named: definitions.string("searchQueryName", in: rules)),
            searchResultFields: try definitions.fields("searchResultFields", in: rules)
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

    func load(documentId: String) throws -> [String: Any] {
        let normalizedId = documentId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedId.isEmpty else { return [contract.documentKey: NSNull()] }
        let rows = try queries.rows(contract.byIdQuery, fields: contract.documentFields, arguments: [normalizedId])
        guard let document = rows.first else { return [contract.documentKey: NSNull()] }
        return [contract.documentKey: document]
    }

    func loadDirectory() throws -> [String: Any] {
        let entries = try queries.rows(
            contract.directoryEntriesQuery,
            fields: contract.directoryEntryFields
        ).map { row -> [String: Any] in
            var entry = row
            entry[contract.absolutePathKey] = row[contract.documentIdKey] ?? NSNull()
            return entry
        }
        return [
            contract.entriesKey: entries,
            contract.foldersKey: try queries.rows(contract.foldersQuery)
        ]
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
            contract.resultsKey: try queries.rows(
                contract.searchQuery,
                fields: contract.searchResultFields,
                arguments: arguments
            )
        ]
    }
}
