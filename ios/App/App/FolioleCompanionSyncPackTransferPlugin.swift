import Capacitor
import Foundation

@objc(FolioleCompanionSyncPackTransferPlugin)
public class FolioleCompanionSyncPackTransferPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionSyncPackTransferPlugin"
    public let jsName = "FolioleCompanionSyncPackTransfer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "downloadDesktopSyncPack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteDownloadedSyncPack", returnType: CAPPluginReturnPromise)
    ]

    @objc func downloadDesktopSyncPack(_ call: CAPPluginCall) {
        do {
            let contracts = try FolioleCompanionContractStore()
            let urlKey = try contracts.transferRequestKey("url")
            let headersKey = try contracts.transferRequestKey("headers")
            guard let url = call.getString(urlKey)?.trimmingCharacters(in: .whitespacesAndNewlines), !url.isEmpty else {
                call.reject("\(urlKey) is required.")
                return
            }
            guard let headersObject = call.getObject(headersKey) else {
                call.reject("\(headersKey) is required.")
                return
            }
            let headers = try stringHeaders(headersObject)
            Task {
                do {
                    let packURL = try await FolioleCompanionSyncPackTransfer.downloadDesktopSyncPack(
                        url: url,
                        headers: headers
                    )
                    call.resolve([try contracts.transferResponseKey("packPath"): packURL.path])
                } catch {
                    call.reject("Failed to download companion desktop sync pack: \(error.localizedDescription)")
                }
            }
        } catch {
            call.reject("Failed to prepare companion desktop sync pack: \(error.localizedDescription)")
        }
    }

    @objc func deleteDownloadedSyncPack(_ call: CAPPluginCall) {
        do {
            let contracts = try FolioleCompanionContractStore()
            let pathKey = try contracts.transferRequestKey("packPath")
            guard let path = call.getString(pathKey)?.trimmingCharacters(in: .whitespacesAndNewlines), !path.isEmpty else {
                call.reject("\(pathKey) is required.")
                return
            }
            let deleted = try FolioleCompanionSyncPackTransfer.deleteDownloadedSyncPack(path: path)
            call.resolve([try contracts.transferResponseKey("deleted"): deleted])
        } catch {
            call.reject("Failed to delete companion desktop sync pack: \(error.localizedDescription)")
        }
    }

    private func stringHeaders(_ value: JSObject) throws -> [String: String] {
        try value.reduce(into: [:]) { result, entry in
            guard let header = entry.value as? String else {
                throw NSError(
                    domain: "FolioleCompanionSyncPackTransfer",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Sync pack headers must be strings."]
                )
            }
            result[entry.key] = header
        }
    }
}
