import CryptoKit
import Foundation

enum FolioleCompanionResourceTransferValidation {
    static func contentParts(_ parts: [FolioleCompanionContentBlobPart], requested: [String])
      -> (accepted: [FolioleCompanionContentBlobPart], errors: [String: String]) {
        var accepted: [FolioleCompanionContentBlobPart] = []
        var errors = Dictionary(uniqueKeysWithValues: Set(requested).map { ($0, "missing_file") })
        let grouped = Dictionary(grouping: parts, by: { $0.hash })
        for hash in Set(requested) {
            guard let values = grouped[hash] else { continue }
            guard values.count == 1 else { errors[hash] = "protocol_error"; continue }
            let part = values[0]
            let actual = SHA256.hash(data: part.data).map { String(format: "%02x", $0) }.joined()
            guard actual == hash else { errors[hash] = "checksum_mismatch"; continue }
            accepted.append(part)
            errors[hash] = nil
        }
        return (accepted, errors)
    }
}
