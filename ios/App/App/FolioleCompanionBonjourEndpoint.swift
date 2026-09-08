import Foundation
import Network

enum FolioleCompanionBonjourEndpoint {
    static func url(service: NetService) -> String? {
        guard service.port > 0,
              let host = preferredResolvedIPv4(numericIPv4Addresses(service.addresses))
                ?? resolvedHost(service.hostName)
        else { return nil }
        return "http://\(host):\(service.port)"
    }

    static func preferredResolvedIPv4(_ values: [String]) -> String? {
        let usable = values.filter(isUsableIPv4)
        return usable.first(where: isPrivateIPv4) ?? usable.first
    }

    static func resolvedHost(_ value: String?) -> String? {
        let result = value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: ".")) ?? ""
        return result.isEmpty ? nil : result
    }

    private static func numericIPv4Addresses(_ values: [Data]?) -> [String] {
        values?.compactMap { value in
            value.withUnsafeBytes { buffer in
                guard let base = buffer.baseAddress,
                      buffer.count >= MemoryLayout<sockaddr_in>.size else { return nil }
                let address = base.assumingMemoryBound(to: sockaddr.self)
                guard Int32(address.pointee.sa_family) == AF_INET else { return nil }
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                let status = host.withUnsafeMutableBufferPointer {
                    getnameinfo(address, socklen_t(buffer.count), $0.baseAddress,
                                socklen_t($0.count), nil, 0, NI_NUMERICHOST)
                }
                return status == 0 ? String(cString: host) : nil
            }
        } ?? []
    }

    private static func isUsableIPv4(_ value: String) -> Bool {
        guard let address = IPv4Address(value) else { return false }
        let bytes = [UInt8](address.rawValue)
        return bytes.first != 0 && bytes.first != 127 && bytes.prefix(2) != [169, 254]
    }

    private static func isPrivateIPv4(_ value: String) -> Bool {
        guard let address = IPv4Address(value) else { return false }
        let bytes = [UInt8](address.rawValue)
        return bytes.first == 10 || bytes.prefix(2) == [192, 168]
            || (bytes.first == 172 && (16...31).contains(bytes[1]))
    }
}
