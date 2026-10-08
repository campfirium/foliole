import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func configureFramedSyncPayloadBudget(_ call: CAPPluginCall) {
        budgetLifecycle(call, configure: true)
    }

    @objc func closeFramedSyncPayloadBudget(_ call: CAPPluginCall) {
        budgetLifecycle(call, configure: false)
    }

    private func budgetLifecycle(_ call: CAPPluginCall, configure: Bool) {
        do {
            let library = try framedRequired(call, "library_key"), generation = try framedRequired(call, "generation_id")
            DispatchQueue.global(qos: .utility).async {
                let complete: (Result<Void, Error>) -> Void = { result in
                    switch result { case .success:
                        if configure {
                            DispatchQueue.main.async {
                                if let owner = FolioleFramedSyncPayloadBudgetRegistry.shared.documentOwner,
                                   owner.libraryKey == library, owner.generationID == generation {
                                    (self.bridge?.webView?.navigationDelegate as? FolioleFramedSyncWebViewLifecycle)?.configured(owner)
                                }
                                call.resolve()
                            }
                        } else { call.resolve() }; case .failure(let error): call.reject(error.localizedDescription) }
                }
                let registry = FolioleFramedSyncPayloadBudgetRegistry.shared
                if configure { registry.configure(libraryKey: library, generationID: generation, complete: complete) }
                else { registry.close(libraryKey: library, generationID: generation, complete: complete) }
            }
        } catch { call.reject(error.localizedDescription) }
    }

    @objc func releaseFramedSyncPayloadLoan(_ call: CAPPluginCall) {
        do {
            let library = try framedRequired(call, "library_key"), generation = try framedRequired(call, "generation_id")
            guard call.getString("direction") == "outbound", call.getString("lane") == "payload",
                  let id = call.getString("loan_id"), call.getInt("capacity_bytes") == 2_097_152 else {
                throw invalid("framed_sync_payload_loan_invalid")
            }
            FolioleFramedSyncPayloadBudgetRegistry.shared.releaseProducer(libraryKey: library, generationID: generation,
                loanID: id, slot: .init(direction: .outbound, lane: .payload), capacity: 2_097_152)
            call.resolve()
        } catch { call.reject(error.localizedDescription) }
    }

    @objc func validateFramedSyncPayloadLoan(_ call: CAPPluginCall) {
        do {
            let owner = try FolioleFramedSyncPayloadBudgetRegistry.shared.requireCurrent()
            guard owner.libraryKey == call.getString("library_key"), owner.generationID == call.getString("generation_id"),
                  call.getString("direction") == "outbound", call.getString("lane") == "payload",
                  let id = call.getString("loan_id"), let capacity = call.getInt("capacity_bytes"),
                  owner.validate(loanID: id, slot: .init(direction: .outbound, lane: .payload), capacity: capacity) else {
                throw invalid("framed_sync_payload_loan_invalid")
            }
            call.resolve(["valid": true])
        } catch { call.reject(error.localizedDescription) }
    }
}
