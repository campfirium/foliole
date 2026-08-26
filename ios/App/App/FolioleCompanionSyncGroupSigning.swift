import Capacitor
import CryptoKit
import Foundation

enum FolioleCompanionSyncGroupSecurity {
    static func groupTag(_ workgroupKey: String) throws -> String {
        let digest = SHA256.hash(data: try Base64URL.decode(workgroupKey))
        return digest.prefix(16).map { String(format: "%02x", $0) }.joined()
    }
}

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
        let method = try value("method").uppercased(), path = try value("pathWithQuery")
        let timestamp = try value("timestamp"), nonce = try value("nonce"), bodyHash = try value("bodyHash")
        let canonical = [method, path, timestamp, nonce, bodyHash].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: Data(workgroupKey.utf8))
        )
        return ["headers": [contract.signatureHeaderKeys["deviceId"]!: deviceId,
            contract.signatureHeaderKeys["nonce"]!: nonce,
            contract.signatureHeaderKeys["signature"]!: Data(signature).map { String(format: "%02x", $0) }.joined(),
            contract.signatureHeaderKeys["timestamp"]!: timestamp]]
    }
}
