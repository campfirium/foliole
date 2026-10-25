import Capacitor
import Foundation
import FolioleFramedSyncRuntime

private let attachmentVerification = DispatchQueue(label: "com.campfirium.foliole.attachment-verification", qos: .utility)

extension FolioleCompanionSyncPlugin {
    @objc func attachmentBatch(_ call: CAPPluginCall) {
        do {
            let owner = try Self.requestHTTPOwner(call)
            try owner.requireActive()
            guard let id = call.getString("operation_id"), UUID(uuidString: id) != nil,
                  let action = call.getString("action") else { throw invalidBatch() }
            if action == "open" {
                guard hasListeners(FolioleAttachmentBatches.event) else { throw FolioleFramedSyncValidationError("attachment_batch_listener_missing") }
                let options = try FolioleAttachmentBatchOptions(call.options as? [String: Any] ?? [:])
                let operation = try FolioleAttachmentBatches.open(owner: owner, id: id, options: options) { [weak self] in
                    DispatchQueue.main.async {
                        self?.notifyListeners(FolioleAttachmentBatches.event, data: ["library_key": owner.libraryKey, "generation_id": owner.generationID, "operation_id": id])
                    }
                }
                call.resolve(operation.payload()); return
            }
            let operation = try FolioleAttachmentBatches.get(owner: owner, id: id)
            if action == "wait_exit" {
                operation.onExit { result in
                    switch result { case .success: call.resolve(operation.payload()); case .failure(let error): call.reject(error.localizedDescription) }
                }; return
            }
            if ["verify", "publish", "discard"].contains(action) {
                let sequence = try FolioleAttachmentBatchOptions.sequence(call.options["sequence"])
                attachmentVerification.async {
                    do {
                        if action == "verify" {
                            let verified = try operation.verify(sequence)
                            var payload = operation.payload(); payload["verification"] = ["sequence": sequence, "valid": verified]; call.resolve(payload)
                        } else { try operation.finalize(action, sequence); call.resolve(operation.payload()) }
                    } catch { call.reject(error.localizedDescription) }
                }; return
            }
            switch action {
            case "read": break
            case "stop": operation.stop()
            case "dispose": try FolioleAttachmentBatches.dispose(owner: owner, id: id)
            case "claim":
                guard let values = call.options["sequences"] as? [Any], values.count <= 4 else { throw invalidBatch() }
                try operation.queue.claim(values.map { try FolioleAttachmentBatchOptions.sequence($0) })
            case "settle":
                let sequence = try FolioleAttachmentBatchOptions.sequence(call.options["sequence"])
                guard let outcome = call.getString("outcome"), ["published", "failed"].contains(outcome) else { throw invalidBatch() }
                try operation.receiver.settle(sequence, published: outcome == "published"); operation.changed()
            default: throw invalidBatch()
            }
            call.resolve(operation.payload())
        } catch { call.reject(error.localizedDescription) }
    }
}
private func invalidBatch() -> Error { FolioleFramedSyncValidationError("attachment_batch_command_invalid") }
