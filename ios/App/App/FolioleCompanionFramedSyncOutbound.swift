import Capacitor
import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

extension FolioleCompanionSyncPlugin {
    @objc func sendFramedSyncTransfer(_ call: CAPPluginCall) {
        Task.detached { [weak self] in
            guard let self else { return call.reject("Companion Sync plugin is unavailable") }
            do { call.resolve(try await self.sendFramedTransfer(call)) }
            catch { call.reject("Failed to send framed Sync transfer: \(error.localizedDescription)", nil, error) }
        }
    }

    private func sendFramedTransfer(_ call: CAPPluginCall) async throws -> [String: Any] {
        let outcomes = try await sendFramedSelections(call.jsObjectRepresentation, multiple: false)
        guard let receipt = outcomes.first?["receipt"] as? [String: Any] else {
            throw invalid(outcomes.first?["error"] as? String ?? "framed_sync_receipt_missing")
        }
        return receipt
    }

    func framedPath(
        _ senderDeviceID: String, _ senderEpoch: String,
        _ receiverDeviceID: String, _ receiverEpoch: String
    ) throws -> String {
        var value = URLComponents(); value.path = "/companion/framed-sync"
        value.queryItems = [
            .init(name: "initiator_device_id", value: senderDeviceID),
            .init(name: "initiator_library_epoch", value: senderEpoch),
            .init(name: "responder_device_id", value: receiverDeviceID),
            .init(name: "responder_library_epoch", value: receiverEpoch)
        ]
        guard let path = value.string else { throw invalid("framed_sync_identity_context_invalid") }
        return path
    }

    func framedRequired(_ call: CAPPluginCall, _ key: String) throws -> String {
        guard let value = call.getString(key)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { throw invalid("\(key)_required") }
        return value
    }

}
