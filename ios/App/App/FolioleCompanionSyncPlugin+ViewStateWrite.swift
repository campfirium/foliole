import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func saveSyncActiveViewState(_ call: CAPPluginCall) {
        resolveViewStateWrite(call) { store, contract in
            try store.saveActiveNode(call.getString(contract.nodeIdPayloadKey))
        }
    }

    @objc func saveSyncNodeViewState(_ call: CAPPluginCall) {
        resolveViewStateWrite(call) { store, contract in
            guard let nodeId = call.getString(contract.nodeIdPayloadKey)?.trimmingCharacters(
                in: .whitespacesAndNewlines
            ), !nodeId.isEmpty else {
                throw NSError(
                    domain: "FolioleCompanionViewStateWritePlugin",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "node_id is required"]
                )
            }
            return try store.saveNodeViewState(
                nodeId: nodeId,
                scrollTop: call.getInt(contract.scrollTopPayloadKey) ?? 0
            )
        }
    }

    private func resolveViewStateWrite(
        _ call: CAPPluginCall,
        operation: (FolioleCompanionViewStateWriteStore, FolioleCompanionViewStateWriteContract) throws -> [String: Any]
    ) {
        do {
            let contract = try FolioleCompanionViewStateWriteContract()
            let store = try FolioleCompanionViewStateWriteStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(),
                contract: contract
            )
            call.resolve(try operation(store, contract))
        } catch { call.reject("Failed to save companion view state: \(error.localizedDescription)") }
    }
}
