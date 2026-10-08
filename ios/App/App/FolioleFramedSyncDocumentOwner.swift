import Foundation

/** A document boundary revokes product delivery; it does not assert WebKit has reclaimed physical copies. */
final class FolioleFramedSyncDocumentOwner {
    private(set) var owner: FolioleFramedSyncPayloadBudget?
    private var navigating: FolioleFramedSyncPayloadBudget?
    private let invalidate: (FolioleFramedSyncPayloadBudget) -> Void
    init(invalidate: @escaping (FolioleFramedSyncPayloadBudget) -> Void) { self.invalidate = invalidate }

    func configured(_ owner: FolioleFramedSyncPayloadBudget) { self.owner = owner }
    func started() { navigating = owner }
    func failed() { navigating = nil }

    func committed() {
        let captured = navigating; navigating = nil
        if let captured {
            if owner === captured { owner = nil }
            invalidate(captured)
        }
    }

    func terminated() {
        let captured = owner ?? navigating
        owner = nil; navigating = nil
        if let captured { invalidate(captured) }
    }
}
