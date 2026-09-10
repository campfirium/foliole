import Foundation
import Network

enum FolioleCompanionBonjourTXT {
    static func decode(_ data: Data) -> [String: String] {
        NetService.dictionary(fromTXTRecord: data).compactMapValues {
            String(data: $0, encoding: .utf8)
        }
    }
}

struct FolioleIPv4Subnet {
    let address: [UInt8]
    let netmask: [UInt8]

    init?(address: String, netmask: String) {
        guard let address = IPv4Address(address), let netmask = IPv4Address(netmask) else {
            return nil
        }
        self.address = [UInt8](address.rawValue)
        self.netmask = [UInt8](netmask.rawValue)
    }

    func contains(_ value: String) -> Bool {
        guard let candidate = IPv4Address(value) else { return false }
        return zip([UInt8](candidate.rawValue), netmask).map { $0 & $1 }.elementsEqual(
            zip(address, netmask).map { $0 & $1 }
        )
    }
}

enum FolioleCompanionBonjourEndpoint {
    static func url(service: NetService) -> String? {
        guard service.port > 0,
              let host = preferredResolvedIPv4(numericIPv4Addresses(service.addresses))
                ?? resolvedHost(service.hostName)
        else { return nil }
        return "http://\(host):\(service.port)"
    }

    static func preferredResolvedIPv4(
        _ values: [String], localSubnets: [FolioleIPv4Subnet]? = nil
    ) -> String? {
        let usable = values.filter(isUsableIPv4)
        let subnets = localSubnets ?? resolvedLocalIPv4Subnets()
        if let matched = usable.first(where: { value in
            subnets.contains(where: { $0.contains(value) })
        }) { return matched }
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

    private static func resolvedLocalIPv4Subnets() -> [FolioleIPv4Subnet] {
        var head: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&head) == 0, let first = head else { return [] }
        defer { freeifaddrs(first) }
        var current: UnsafeMutablePointer<ifaddrs>? = first
        var result: [FolioleIPv4Subnet] = []
        while let item = current {
            let entry = item.pointee
            current = entry.ifa_next
            let flags = entry.ifa_flags
            guard flags & UInt32(IFF_UP) != 0,
                  flags & UInt32(IFF_LOOPBACK) == 0,
                  flags & UInt32(IFF_POINTOPOINT) == 0,
                  let address = entry.ifa_addr, let netmask = entry.ifa_netmask,
                  Int32(address.pointee.sa_family) == AF_INET,
                  let addressText = numericIPv4Address(address),
                  let netmaskText = numericIPv4Address(netmask),
                  let subnet = FolioleIPv4Subnet(address: addressText, netmask: netmaskText)
            else { continue }
            result.append(subnet)
        }
        return result
    }

    private static func numericIPv4Address(_ address: UnsafePointer<sockaddr>) -> String? {
        var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        let status = host.withUnsafeMutableBufferPointer {
            getnameinfo(address, socklen_t(address.pointee.sa_len), $0.baseAddress,
                        socklen_t($0.count), nil, 0, NI_NUMERICHOST)
        }
        return status == 0 ? String(cString: host) : nil
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
