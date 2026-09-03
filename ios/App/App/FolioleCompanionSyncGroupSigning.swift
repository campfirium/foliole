import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func signCompanionSyncRequest(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            do { call.resolve(try self.signSyncGroupRequest(call)) }
            catch { call.reject("Failed to sign Sync Group request: \(error.localizedDescription)", nil, error) }
        }
    }

    private func signSyncGroupRequest(_ call: CAPPluginCall) throws -> [String: Any] {
        let contract = try FolioleCompanionContractStore().networkContract()
        func value(_ name: String) throws -> String {
            guard let key = contract.signatureRequestKeys[name], let value = call.getString(key), !value.isEmpty else {
                throw NSError(domain: "FolioleCompanionSyncGroupSigning", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "\(name)_required"])
            }
            return value
        }
        let groupId = try value("syncGroupId")
        let credential = try groupData.request("load_current_credential", ["group_id": groupId])
        guard let deviceId = credential["device_id"] as? String,
              let workgroupKey = credential["workgroup_key"] as? String else {
            throw NSError(domain: "FolioleCompanionSyncGroupSigning", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "sync_group_current_credential_missing"])
        }
        return try FolioleCompanionSignedClientRequests.prepare(
            body: call.getString(contract.signatureRequestKeys["body"]!),
            bodyHash: try value("bodyHash"), endpointUrl: try value("endpointUrl"), groupId: groupId,
            method: try value("method").uppercased(), nonce: try value("nonce"),
            path: try value("pathWithQuery"), timestamp: try value("timestamp"),
            deviceId: deviceId, workgroupKey: workgroupKey
        )
    }
}
