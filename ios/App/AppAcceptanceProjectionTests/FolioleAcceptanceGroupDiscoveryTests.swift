import XCTest
@testable import App

final class FolioleAcceptanceGroupDiscoveryTests: XCTestCase {
    func testFindsExpectedSyncGroup() async throws {
        let expectedId = try requiredEnvironment("FOLIOLE_T152_EXPECTED_GROUP_ID")
        let expectedTag = try requiredEnvironment("FOLIOLE_T152_EXPECTED_GROUP_TAG")
        let contract = try FolioleCompanionContractStore().networkContract()
        let candidates: [[String: Any]] = await withCheckedContinuation { continuation in
            var discovery: FolioleCompanionBonjourDiscovery?
            discovery = FolioleCompanionBonjourDiscovery(contract: contract) { values in
                withExtendedLifetime(discovery) { continuation.resume(returning: values) }
            }
            discovery?.start()
        }
        var matches = 0
        var mismatches = 0
        for candidate in candidates {
            guard let endpoint = candidate[contract.discoveryCandidateKeys["endpointUrl"] ?? ""] as? String
            else { continue }
            let response = try await FolioleCompanionDesktopHttpClient.request(
                url: endpoint + "/companion/discovery", method: "GET", headers: [:],
                body: nil, contract: contract)
            let bodyKey = try XCTUnwrap(contract.networkResponseKeys["body"])
            let body = try XCTUnwrap(response[bodyKey] as? String)
            let value = try XCTUnwrap(
                JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any]
            )
            let idMatches = value["group_id"] as? String == expectedId
            let tagMatches = value["group_tag"] as? String == expectedTag
            if idMatches && tagMatches { matches += 1 }
            else if idMatches || tagMatches { mismatches += 1 }
        }
        XCTAssertEqual(mismatches, 0)
        XCTAssertEqual(matches, 1)
    }

    private func requiredEnvironment(_ key: String) throws -> String {
        let value = try XCTUnwrap(ProcessInfo.processInfo.environment[key])
        XCTAssertFalse(value.isEmpty)
        return value
    }
}
