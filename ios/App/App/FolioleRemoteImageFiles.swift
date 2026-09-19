import Capacitor
import CryptoKit
import Foundation

private final class ImageRedirectDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

extension FolioleCompanionSyncPlugin {
    @objc func readRemoteImageResponse(_ call: CAPPluginCall) {
        Task {
            do { call.resolve(try await FolioleRemoteImageFiles.read(call.getString("url") ?? "")) }
            catch { call.reject("Image download failed: \(error.localizedDescription)") }
        }
    }

    @objc func writeImageAttachment(_ call: CAPPluginCall) {
        Task {
            do { call.resolve(try FolioleRemoteImageFiles.write(call)) }
            catch { call.reject("Image storage failed: \(error.localizedDescription)") }
        }
    }
}

enum FolioleRemoteImageFiles {
    private static let maxBytes = 32 * 1024 * 1024

    static func read(_ value: String) async throws -> JSObject {
        guard let url = URL(string: value), ["http", "https"].contains(url.scheme ?? ""),
              url.user == nil, url.password == nil else { throw invalid("Invalid image URL") }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        let session = URLSession(configuration: configuration, delegate: ImageRedirectDelegate(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (stream, response) = try await session.bytes(from: url)
        guard let http = response as? HTTPURLResponse else { throw invalid("Invalid image response") }
        var result: JSObject = ["status": http.statusCode]
        if let location = http.value(forHTTPHeaderField: "Location") { result["location"] = location }
        guard (200..<300).contains(http.statusCode) else { return result }
        if response.expectedContentLength > maxBytes { throw invalid("Image too large") }
        var bytes = Data()
        for try await byte in stream {
            if bytes.count >= maxBytes { throw invalid("Image too large") }
            bytes.append(byte)
        }
        result["bytesBase64"] = bytes.base64EncodedString()
        return result
    }

    static func write(_ call: CAPPluginCall) throws -> JSObject {
        guard let encoded = call.getString("bytesBase64"), let bytes = Data(base64Encoded: encoded),
              !bytes.isEmpty, bytes.count <= maxBytes,
              let hash = call.getString("contentHash"), let mime = call.getString("mimeType"),
              let key = call.getString("storageKey"),
              FolioleCompanionCanonicalAttachmentKey.matches(contentHash: hash, mimeType: mime, storageKey: key),
              SHA256.hash(data: bytes).map({ String(format: "%02x", $0) }).joined() == hash
        else { throw invalid("Invalid image identity") }
        let contract = try FolioleCompanionContractStore().attachmentResourceContract()
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                 appropriateFor: nil, create: true)
        let root = support.appendingPathComponent(contract.directoryName, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let target = root.appendingPathComponent(key)
        if let values = try? target.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey]) {
            guard values.isSymbolicLink != true, values.isRegularFile == true,
                  try FolioleCompanionAttachmentResourceDownloader.digestHex(target) == hash
            else { throw invalid("Existing image differs") }
            return ["storedFile": "reused"]
        }
        let temporary = root.appendingPathComponent("image-\(UUID().uuidString).part")
        defer { try? FileManager.default.removeItem(at: temporary) }
        try bytes.write(to: temporary, options: .withoutOverwriting)
        try FileManager.default.moveItem(at: temporary, to: target)
        return ["storedFile": "created"]
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleRemoteImageFiles", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
