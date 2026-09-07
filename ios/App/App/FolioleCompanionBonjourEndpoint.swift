import Foundation
import Network

enum FolioleCompanionBonjourEndpoint {
    static func url(service: NetService, txt: [String: String]) -> String? {
        guard service.port > 0,
              let fallback = service.hostName?.trimmingCharacters(
                in: CharacterSet(charactersIn: ".")
              ),
              let host = preferredHost(advertised: txt["ipv4_addresses"], fallback: fallback)
        else { return nil }
        return "http://\(host):\(service.port)"
    }

    static func preferredHost(advertised: String?, fallback: String?) -> String? {
        let candidates = advertised?.split(separator: ",").map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
        } ?? []
        return candidates.first(where: isUsableIPv4) ?? fallback.flatMap(normalized)
    }

    private static func isUsableIPv4(_ value: String) -> Bool {
        guard let address = IPv4Address(value) else { return false }
        let bytes = [UInt8](address.rawValue)
        return bytes.first != 127 && bytes.prefix(2) != [169, 254]
    }

    private static func normalized(_ value: String) -> String? {
        let result = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return result.isEmpty ? nil : result
    }
}
