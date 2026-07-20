import Foundation

final class FolioleCompanionPdfPageTextStore {
    private let contract: FolioleCompanionPdfPageTextContract
    private let queries: FolioleCompanionGeneratedReadQueryRunner

    init(databaseURL: URL, contract: FolioleCompanionPdfPageTextContract) throws {
        self.contract = contract
        queries = try FolioleCompanionGeneratedReadQueryRunner(databaseURL: databaseURL)
    }

    func load(attachmentId: String) throws -> [String: Any] {
        let normalizedId = attachmentId.trimmingCharacters(in: .whitespacesAndNewlines)
        let pages = normalizedId.isEmpty ? [] : try queries.rows(
            contract.pagesQuery,
            arguments: [normalizedId]
        )
        return [contract.attachmentIdKey: attachmentId, contract.pagesResultKey: pages]
    }

    func search(query: String, limit: Int?) throws -> [String: Any] {
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedQuery.isEmpty else {
            return [contract.queryKey: query, contract.searchResultKey: []]
        }
        let requestedLimit = limit.flatMap { $0 > 0 ? $0 : nil } ?? contract.defaultSearchLimit
        let resolvedLimit = min(requestedLimit, contract.maxSearchLimit)
        let arguments = [normalizedQuery, normalizedQuery, normalizedQuery, String(resolvedLimit)]
        let results = try queries.rows(contract.searchQuery, arguments: arguments)
        return [contract.queryKey: query, contract.searchResultKey: results]
    }
}
