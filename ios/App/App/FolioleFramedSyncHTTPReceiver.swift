import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncHTTPReceiver: NSObject, URLSessionDataDelegate {
    private let owner: FolioleFramedSyncPayloadBudget?
    private let receiptSequence: Bool
    private let responseLane: FolioleFramedSyncPayloadBudget.Lane
    private let delegateQueue = OperationQueue()
    private var payloadLoan: FolioleFramedSyncPayloadBudget.Loan?
    private var receiptPrefix = Data()
    private var outgoingLoan: FolioleFramedSyncPayloadBudget.Loan?
    private var receivedBytes = 0
    private var waitingLoan: UUID?
    private let responseURL: URL
    private let partialURL: URL
    private let expectedDeviceID: String
    private let expectedLibraryEpoch: String
    private var continuation: CheckedContinuation<URL, Error>?
    private var errorBody = Data()
    private var errorStatusCode: Int?
    private var output: OutputStream?
    private var session: URLSession?

    init(responseURL: URL, expectedDeviceID: String, expectedLibraryEpoch: String,
         owner: FolioleFramedSyncPayloadBudget? = nil, responseLane: FolioleFramedSyncPayloadBudget.Lane = .payload, receiptSequence: Bool = false) {
        self.owner = owner; self.responseLane = responseLane; self.receiptSequence = receiptSequence
        self.responseURL = responseURL
        partialURL = responseURL.deletingLastPathComponent()
            .appendingPathComponent(".\(responseURL.lastPathComponent).\(UUID().uuidString).partial")
        self.expectedDeviceID = expectedDeviceID
        self.expectedLibraryEpoch = expectedLibraryEpoch
    }

    func upload(
        request: URLRequest,
        bodyURL: URL,
        configuration: URLSessionConfiguration, outgoingLoan: FolioleFramedSyncPayloadBudget.Loan? = nil
    ) async throws -> URL {
        self.outgoingLoan = outgoingLoan
        try FileManager.default.createDirectory(
            at: responseURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            delegateQueue.maxConcurrentOperationCount = 1
            let session = URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
            self.session = session
            session.uploadTask(with: request, fromFile: bodyURL).resume()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                    totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        if totalBytesExpectedToSend >= 0 && totalBytesSent >= totalBytesExpectedToSend {
            outgoingLoan?.release(); outgoingLoan = nil
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
            if let owner {
                waitingLoan = owner.acquire(.inbound, lane: responseLane) { outcome in
                    self.delegateQueue.addOperation {
                        self.waitingLoan = nil
                        guard self.continuation != nil else {
                            if case .success(let loan) = outcome { loan.release() }
                            completionHandler(.cancel); return
                        }
                        do { self.payloadLoan = try outcome.get(); completionHandler(.allow) }
                        catch { completionHandler(.cancel); self.finish(.failure(error)) }
                    }
                }
            } else { completionHandler(.allow) }
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
        do {
            if responseLane == .receipt {
                let maximum = receiptSequence ? 2_097_152 + 128 * 32 : 1_048_576 + 112
                guard data.count <= maximum - receivedBytes else {
                    throw FolioleFramedSyncValidationError("framed_sync_receipt_limit_exceeded")
                }
                receivedBytes += data.count
                if receiptPrefix.count < 112 {
                    receiptPrefix.append(data.prefix(112 - receiptPrefix.count))
                    if receiptPrefix.count == 112 {
                        let header = try FolioleFramedSyncWireHeader(decoding: Data(receiptPrefix.suffix(16)))
                        guard header.ciphertextBytes <= 1_048_576 else {
                            throw FolioleFramedSyncValidationError("framed_sync_receipt_limit_exceeded")
                        }
                    }
                }
            }
            try write(data)
        } catch { dataTask.cancel(); finish(.failure(error)) }
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
        outgoingLoan?.release(); outgoingLoan = nil
        if let waitingLoan { owner?.cancel(waitingLoan); self.waitingLoan = nil }
        payloadLoan?.release(); payloadLoan = nil
        output?.close()
        output = nil
        if case .failure = result { try? FileManager.default.removeItem(at: partialURL) }
        continuation.resume(with: result)
        session?.finishTasksAndInvalidate()
        session = nil
    }
}
