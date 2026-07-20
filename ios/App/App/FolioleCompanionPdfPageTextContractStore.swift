import Foundation

struct FolioleCompanionPdfPageTextContract {
    let attachmentIdKey: String
    let defaultSearchLimit: Int
    let maxSearchLimit: Int
    let pagesResultKey: String
    let pagesQuery: FolioleCompanionGeneratedQuery
    let queryKey: String
    let searchResultKey: String
    let searchQuery: FolioleCompanionGeneratedQuery
}

final class FolioleCompanionPdfPageTextContractStore {
    private let definitions: FolioleCompanionQueryDefinitions

    init(bundle: Bundle = .main) throws {
        definitions = try FolioleCompanionQueryDefinitions(bundle: bundle)
    }

    func contract() throws -> FolioleCompanionPdfPageTextContract {
        let rules = try definitions.object(["resourceRead", "pdfPageText"])
        let outputs = try definitions.object(["outputKeys"], root: rules)
        return FolioleCompanionPdfPageTextContract(
            attachmentIdKey: try definitions.string("attachmentIdKey", in: rules),
            defaultSearchLimit: try definitions.integer("defaultSearchLimit", in: rules),
            maxSearchLimit: try definitions.integer("maxSearchLimit", in: rules),
            pagesResultKey: try definitions.string("pagesResultKey", in: rules),
            pagesQuery: try definitions.query(named: definitions.string("pagesQueryName", in: rules)),
            queryKey: try definitions.string("query", in: outputs),
            searchResultKey: try definitions.string("searchResultKey", in: rules),
            searchQuery: try definitions.query(named: definitions.string("searchQueryName", in: rules))
        )
    }
}
