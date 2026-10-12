import Foundation

enum FolioleAttachmentRequestValidation {
    static func validate(_ value: Foliole_Sync_V22_RequestAttachment) throws {
        try FolioleFramedSyncValueValidator.fixed(value.requestID, count: 16, "request_id")
        let operations = ["needs", "describe", "pull", "status", "push"]
        let states = ["", "partial", "complete", "offset", "block", "end"]
        guard operations.contains(value.operation), states.contains(value.state),
              value.byteLength <= FolioleFramedSyncLimits.maxBlobBytes,
              value.offset <= FolioleFramedSyncLimits.maxBlobBytes,
              value.data.count <= 524288, value.storageKeys.count <= 256,
              value.storageKey.isEmpty || validKey(value.storageKey),
              value.storageKeys.allSatisfy(validKey) else {
            throw FolioleFramedSyncValidationError("attachment_request_invalid")
        }
    }
    private static func validKey(_ key: String) -> Bool {
        key.range(of: "^[a-f0-9]{64}\\.(png|jpg|gif|webp|pdf|epub)$", options: .regularExpression) != nil
    }
}
