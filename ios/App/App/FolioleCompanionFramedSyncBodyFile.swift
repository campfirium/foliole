import Foundation
import FolioleFramedSyncRuntime

extension FolioleCompanionSyncPlugin {
    func preparedFramedBody(
        _ reference: Foliole_Sync_V22_BlobReference, selection: [String: Any], transferID: String, directory: URL
    ) throws -> URL {
        try FolioleFramedSyncBodyResponse.writeFrozen(reference, selection: selection,
            transferID: transferID, directory: directory, bridge: groupData)
    }
}
