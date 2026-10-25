import Darwin
import Foundation

/** A real TCP response kept open after its first authenticated file block. */
final class AttachmentStreamingHTTPServer {
    private let listener: Int32
    private let release = DispatchSemaphore(value: 0)
    private let exited = DispatchSemaphore(value: 0)
    let endpoint: URL

    init(prefix: Data, suffix: Data) throws {
        let listener = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard listener >= 0 else { throw Self.failure() }
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(listener, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0, Darwin.listen(listener, 1) == 0 else {
            let error = Self.failure(); Darwin.close(listener); throw error
        }
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(listener, $0, &length) }
        }
        guard named == 0 else { let error = Self.failure(); Darwin.close(listener); throw error }
        endpoint = URL(string: "http://127.0.0.1:\(UInt16(bigEndian: address.sin_port))/companion/framed-sync")!
        self.listener = listener
        let socket = listener, release = release, exited = exited
        DispatchQueue.global().async {
            defer { exited.signal() }
            let client = Darwin.accept(socket, nil, nil)
            guard client >= 0 else { return }
            defer { Darwin.close(client) }
            var one: Int32 = 1
            setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
            var timeout = timeval(tv_sec: 5, tv_usec: 0)
            setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
            setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
            var request = Data(), buffer = [UInt8](repeating: 0, count: 4096)
            while request.range(of: Data("\r\n\r\n".utf8)) == nil {
                let count = Darwin.read(client, &buffer, buffer.count)
                guard count > 0, request.count + count <= 65536 else { return }
                request.append(contentsOf: buffer.prefix(count))
            }
            guard let end = request.range(of: Data("\r\n\r\n".utf8)) else { return }
            let lines = String(decoding: request.prefix(end.upperBound), as: UTF8.self).components(separatedBy: "\r\n")
            let length = lines.first { $0.lowercased().hasPrefix("content-length:") }
                .flatMap { Int($0.split(separator: ":", maxSplits: 1)[1].trimmingCharacters(in: .whitespaces)) } ?? 0
            if lines.contains(where: { $0.lowercased().contains("100-continue") }) {
                _ = Self.send(client, Data("HTTP/1.1 100 Continue\r\n\r\n".utf8))
            }
            while request.count < end.upperBound + length {
                let count = Darwin.read(client, &buffer, buffer.count)
                guard count > 0 else { return }
                request.append(contentsOf: buffer.prefix(count))
            }
            let headers = "HTTP/1.1 200 OK\r\nContent-Type: application/vnd.foliole.framed-sync\r\nX-Foliole-Device-Id: b\r\nX-Foliole-Library-Epoch: b-epoch\r\nContent-Length: \(prefix.count + suffix.count)\r\nConnection: close\r\n\r\n"
            guard Self.send(client, Data(headers.utf8) + prefix) else { return }
            _ = release.wait(timeout: .now() + 5)
            _ = Self.send(client, suffix)
        }
    }
    func finish() { release.signal() }
    func close() {
        release.signal()
        Darwin.shutdown(listener, SHUT_RDWR); Darwin.close(listener)
        _ = exited.wait(timeout: .now() + 6)
    }
    private static func send(_ socket: Int32, _ data: Data) -> Bool {
        data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count {
                let count = Darwin.write(socket, bytes.baseAddress! + offset, bytes.count - offset)
                if count <= 0 { return false }
                offset += count
            }
            return true
        }
    }
    private static func failure() -> Error { NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
}
