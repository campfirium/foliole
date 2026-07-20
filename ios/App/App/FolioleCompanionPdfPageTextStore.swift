import Foundation

final class FolioleCompanionPdfPageTextStore {
    private let contract: FolioleCompanionPdfPageTextContract
    private let database: FolioleReadOnlySQLite

    init(databaseURL: URL, contract: FolioleCompanionPdfPageTextContract) throws {
        self.contract = contract
        database = try FolioleReadOnlySQLite(url: databaseURL)
    }

    func load(attachmentId: String) throws -> [String: Any] {
        let normalizedId = attachmentId.trimmingCharacters(in: .whitespacesAndNewlines)
        let pages = normalizedId.isEmpty ? [] : try database.rows(
            contract.pagesSQL,
            arguments: [normalizedId]
        ).map(page)
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
        let results = try database.rows(contract.searchSQL, arguments: arguments).map(searchResult)
        return [contract.queryKey: query, contract.searchResultKey: results]
    }

    private func page(_ row: [String?]) throws -> [String: Any] {
        guard row.count == 4 else { throw error("PDF page query returned an invalid row.") }
        return pageFields(row)
    }

    private func searchResult(_ row: [String?]) throws -> [String: Any] {
        guard row.count == 7 else { throw error("PDF search query returned an invalid row.") }
        return pageFields(Array(row[1...4])).merging([
            contract.attachmentIdKey: row[0] ?? "",
            contract.matchStartKey: Int(row[5] ?? "") ?? 0,
            contract.excerptKey: row[6] ?? ""
        ]) { _, next in next }
    }

    private func pageFields(_ row: [String?]) -> [String: Any] {
        [
            contract.pageKey: Int(row[0] ?? "") ?? 0,
            contract.textKey: row[1] ?? "",
            contract.pageWidthKey: number(row[2]),
            contract.pageHeightKey: number(row[3])
        ]
    }

    private func number(_ value: String?) -> Any {
        value.flatMap(Double.init) ?? NSNull()
    }

    private func error(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionPdfPageText", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
