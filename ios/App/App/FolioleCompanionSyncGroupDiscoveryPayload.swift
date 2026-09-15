import Foundation

enum FolioleCompanionSyncGroupDiscoveryPayload {
    static func make(_ discovery: [String: Any]) -> [String: Any] {
        var result = discovery
        result["protocol"] = [
            "version": discovery["protocol_version"] as Any,
            "min_supported_version": discovery["protocol_min_version"] as Any,
            "max_supported_version": discovery["protocol_max_version"] as Any,
            "capabilities": discovery["protocol_capabilities"] as Any
        ]
        for key in ["protocol_version", "protocol_min_version",
                    "protocol_max_version", "protocol_capabilities"] {
            result.removeValue(forKey: key)
        }
        return result
    }
}
