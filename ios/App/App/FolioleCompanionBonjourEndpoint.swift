import Foundation

enum FolioleCompanionBonjourEndpoint {
    static func url(service: NetService) -> String? {
        guard service.port > 0,
              let host = resolvedHost(service.hostName)
        else { return nil }
        return "http://\(host):\(service.port)"
    }

    static func resolvedHost(_ value: String?) -> String? {
        let result = value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: ".")) ?? ""
        return result.isEmpty ? nil : result
    }
}
