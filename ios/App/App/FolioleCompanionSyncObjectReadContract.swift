import Foundation

struct FolioleCompanionSyncPayloadRoute {
    let argMode: String
    let objectIdKey: String?
    let objectIdPrefix: String?
    let objectType: String
    let query: FolioleCompanionGeneratedQuery
}

struct FolioleCompanionSyncObjectReadContract {
    let defaultDeviceId: String
    let deletedAtKey: String
    let noneArgMode: String
    let objectIdArgMode: String
    let objectIdDelimiter: String
    let objectIdDeviceIdPartIndex: Int
    let objectIdKey: String
    let objectIdKeyPartIndex: Int
    let objectIdPartLimit: Int
    let objectIdsReplacement: String
    let objectTypesReplacement: String
    let objectTypeKey: String
    let payloadJsonKey: String
    let routes: [FolioleCompanionSyncPayloadRoute]
    let syncIndexQuery: FolioleCompanionGeneratedQuery
    let syncObjectsQuery: FolioleCompanionGeneratedQuery
    let unfilteredObjectTypesReplacement: String
    let viewStateNodeArgMode: String
}

final class FolioleCompanionSyncObjectReadContractStore {
    private let definitions: FolioleCompanionQueryDefinitions

    init(bundle: Bundle = .main) throws {
        definitions = try FolioleCompanionQueryDefinitions(bundle: bundle)
    }

    func contract() throws -> FolioleCompanionSyncObjectReadContract {
        let read = try definitions.object(["syncObjectRead"])
        let index = try definitions.object(["syncIndex"], root: read)
        let objects = try definitions.object(["syncObjects"], root: read)
        let routing = try definitions.object(["syncPayloadRouting"])
        return FolioleCompanionSyncObjectReadContract(
            defaultDeviceId: try definitions.string("defaultDeviceId", in: routing),
            deletedAtKey: try definitions.string("deletedAtKey", in: routing),
            noneArgMode: try definitions.string("noneArgMode", in: routing),
            objectIdArgMode: try definitions.string("objectIdArgMode", in: routing),
            objectIdDelimiter: try definitions.string("objectIdDelimiter", in: routing),
            objectIdDeviceIdPartIndex: try definitions.integer("objectIdDeviceIdPartIndex", in: routing),
            objectIdKey: try definitions.string("objectIdKey", in: routing),
            objectIdKeyPartIndex: try definitions.integer("objectIdKeyPartIndex", in: routing),
            objectIdPartLimit: try definitions.integer("objectIdPartLimit", in: routing),
            objectIdsReplacement: try definitions.string("objectIdsReplacement", in: objects),
            objectTypesReplacement: try definitions.string("objectTypesReplacement", in: objects),
            objectTypeKey: try definitions.string("objectTypeKey", in: routing),
            payloadJsonKey: try definitions.string("payloadJsonKey", in: routing),
            routes: try routes(routing),
            syncIndexQuery: try definitions.query(named: definitions.string("queryName", in: index)),
            syncObjectsQuery: try definitions.query(named: definitions.string("queryName", in: objects)),
            unfilteredObjectTypesReplacement: try definitions.string("unfilteredObjectTypesReplacement", in: objects),
            viewStateNodeArgMode: try definitions.string("viewStateNodeArgMode", in: routing)
        )
    }

    private func routes(_ routing: [String: Any]) throws -> [FolioleCompanionSyncPayloadRoute] {
        let argModeKey = try definitions.string("argModeKey", in: routing)
        let objectIdKey = try definitions.string("objectIdRouteKey", in: routing)
        let prefixKey = try definitions.string("objectIdPrefixKey", in: routing)
        let queryKey = try definitions.string("queryNameKey", in: routing)
        let typeKey = try definitions.string("objectTypeRouteKey", in: routing)
        let defaultMode = try definitions.string("objectIdArgMode", in: routing)
        return try definitions.objects("routes", in: routing).map { route in
            FolioleCompanionSyncPayloadRoute(
                argMode: definitions.optionalString(argModeKey, in: route) ?? defaultMode,
                objectIdKey: definitions.optionalString(objectIdKey, in: route),
                objectIdPrefix: definitions.optionalString(prefixKey, in: route),
                objectType: try definitions.string(typeKey, in: route),
                query: try definitions.query(
                    named: definitions.string(queryKey, in: route),
                    defaultColumnKey: try definitions.string("payloadJsonKey", in: routing),
                    defaultResultKey: "payloads"
                )
            )
        }
    }
}
