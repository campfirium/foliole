import Network

enum FolioleCompanionSyncGroupAdvertisement {
    static func service(_ discovery: [String: Any]) -> NWListener.Service {
        let txt = discovery.reduce(into: [String: String]()) { result, entry in
            if let value = entry.value as? String { result[entry.key] = value }
            else if let value = entry.value as? Int { result[entry.key] = String(value) }
        }
        return NWListener.Service(
            name: serviceName(discovery), type: "_foliole-sync._tcp", domain: "local.",
            txtRecord: NWTXTRecord(txt)
        )
    }

    private static func serviceName(_ discovery: [String: Any]) -> String {
        let name = discovery["group_display_name"] as? String ?? "Foliole"
        let runtime = (discovery["runtime_instance_id"] as? String ?? "runtime").prefix(8)
        return String("\(name)-\(runtime)".prefix(63))
    }
}
