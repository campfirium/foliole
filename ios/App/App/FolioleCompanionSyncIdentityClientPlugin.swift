import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func createIdentitySourceView(_ call: CAPPluginCall) {
        runGroup(call, "Failed to create sync source view") {
            try self.identityClientView.create(bridge: self.groupData)
        }
    }

    @objc func buildIdentitySourcePack(_ call: CAPPluginCall) {
        runGroup(call, "Failed to build sync identity pack") {
            guard let path = call.getString("snapshot_path"), let page = call.getObject("page") else {
                throw self.invalid("sync_identity_pack_request_invalid")
            }
            return try self.identityClientView.build(path: path, page: page, bridge: self.groupData)
        }
    }

    @objc func closeIdentitySourceView(_ call: CAPPluginCall) {
        runGroup(call, "Failed to close sync source view") {
            guard let path = call.getString("snapshot_path") else {
                throw self.invalid("sync_identity_source_view_unavailable")
            }
            return try self.identityClientView.close(path: path)
        }
    }
}
