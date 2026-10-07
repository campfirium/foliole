import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncHTTPReceiver: NSObject, URLSessionDataDelegate {
    private let responseURL: URL
    private let partialURL: URL
    private let expectedDeviceID: String
    private let expectedLibraryEpoch: String
    private var continuation: CheckedContinuation<URL, Error>?
    private var errorBody = Data()
    private var errorStatusCode: Int?
    private var output: OutputStream?
    private var session: URLSession?

    init(responseURL: URL, expectedDeviceID: String, expectedLibraryEpoch: String) {
        self.responseURL = responseURL
        partialURL = responseURL.deletingLastPathComponent()
            .appendingPathComponent(".\(responseURL.lastPathComponent).\(UUID().uuidString).partial")
        self.expectedDeviceID = expectedDeviceID
        self.expectedLibraryEpoch = expectedLibraryEpoch
    }

    func upload(
        request: URLRequest,
        bodyURL: URL,
        configuration: URLSessionConfiguration
    ) async throws -> URL {
        try FileManager.default.createDirectory(
            at: responseURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let queue = OperationQueue()
            queue.maxConcurrentOperationCount = 1
            let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
            self.session = session
            session.uploadTask(with: request, fromFile: bodyURL).resume()
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping @Sendable (URLSession.ResponseDisposition) -> Void
    ) {
        do {
            guard let http = response as? HTTPURLResponse else {
                throw FolioleFramedSyncValidationError("framed_sync_response_not_http")
            }
            if http.statusCode != 200 {
                errorStatusCode = http.statusCode
                completionHandler(.allow)
                return
            }
            try FolioleFramedSyncHTTPTransport.validateResponse(
                http,
                expectedDeviceID: expectedDeviceID,
                expectedLibraryEpoch: expectedLibraryEpoch
            )
            guard let output = OutputStream(url: partialURL, append: false) else {
                throw FolioleFramedSyncValidationError("framed_sync_response_file_open_failed")
            }
            output.open()
            self.output = output
            completionHandler(.allow)
        } catch {
            completionHandler(.cancel)
            finish(.failure(error))
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        if errorStatusCode != nil {
            if errorBody.count + data.count <= 4 * 1024 { errorBody.append(data) }
            else { errorBody = Data(repeating: 0, count: 4 * 1024 + 1) }
            return
        }
        do { try write(data) } catch { dataTask.cancel(); finish(.failure(error)) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error { finish(.failure(error)); return }
        if let statusCode = errorStatusCode {
            finish(.failure(FolioleFramedSyncValidationError(
                FolioleFramedSyncHTTPTransport.httpErrorCode(
                    statusCode: statusCode, body: errorBody
                )
            )))
            return
        }
        do {
            output?.close()
            output = nil
            try FileManager.default.moveItem(at: partialURL, to: responseURL)
            finish(.success(responseURL))
        } catch { finish(.failure(error)) }
    }

    private func write(_ data: Data) throws {
        guard let output else {
            throw FolioleFramedSyncValidationError("framed_sync_response_stream_unavailable")
        }
        try data.withUnsafeBytes { raw in
            guard let bytes = raw.bindMemory(to: UInt8.self).baseAddress else { return }
            var offset = 0
            while offset < data.count {
                let count = output.write(bytes + offset, maxLength: data.count - offset)
                guard count > 0 else {
                    throw output.streamError ?? FolioleFramedSyncValidationError("framed_sync_response_write_failed")
                }
                offset += count
            }
        }
    }

    private func finish(_ result: Result<URL, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        output?.close()
        output = nil
        if case .failure = result { try? FileManager.default.removeItem(at: partialURL) }
        continuation.resume(with: result)
        session?.finishTasksAndInvalidate()
        session = nil
    }
}

struct FolioleFramedSyncSessionReadResult {
    let sessionID: Data
    let messages: [FolioleFramedSyncValidatedMessage]
}

enum FolioleFramedSyncSessionReader {
    static func read(
        _ data: Data, groupKey: Data, context: FolioleFramedSyncSessionContext,
        maximumFrames: Int
    ) throws -> FolioleFramedSyncSessionReadResult {
        guard (1...FolioleFramedSyncLimits.maxSessionFrames).contains(maximumFrames) else {
            throw FolioleFramedSyncValidationError("session_frame_limit_invalid")
        }
        guard data.count <= FolioleFramedSyncLimits.maxSessionBytes else {
            throw FolioleFramedSyncValidationError("session_byte_limit_exceeded")
        }
        return try read(InputStream(data: data), groupKey: groupKey, context: context, maximumFrames: maximumFrames)
    }

    static func read(
        _ stream: InputStream, groupKey: Data, context: FolioleFramedSyncSessionContext,
        maximumFrames: Int
    ) throws -> FolioleFramedSyncSessionReadResult {
        guard (1...FolioleFramedSyncLimits.maxSessionFrames).contains(maximumFrames) else {
            throw FolioleFramedSyncValidationError("session_frame_limit_invalid")
        }
        let reader = FolioleFramedSyncStreamReader(input: stream)
        let preamble = try reader.nextPreamble()
        let sessionID = try context.validate(preamble)
        var messages = [FolioleFramedSyncValidatedMessage]()
        var sequence: UInt64 = 0
        var bytes = FolioleFramedSyncPreamble.byteCount
        while let frame = try reader.nextFrame() {
            bytes += FolioleFramedSyncWireHeader.byteCount + frame.ciphertext.count
            guard bytes <= FolioleFramedSyncLimits.maxSessionBytes else {
                throw FolioleFramedSyncValidationError("session_byte_limit_exceeded")
            }
            guard messages.count < maximumFrames else {
                throw FolioleFramedSyncValidationError("session_frame_limit_exceeded")
            }
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
                groupKey: groupKey, preamble: preamble,
                frame: frame, expectedSequence: sequence
            )
            messages.append(try FolioleFramedSyncCodec.decode(
                plaintext, authenticatedFrameType: frame.header.frameType.rawValue
            ))
            sequence += 1
        }
        return .init(sessionID: sessionID, messages: messages)
    }
}
