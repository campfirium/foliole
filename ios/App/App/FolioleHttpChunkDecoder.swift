import Foundation

final class FolioleHttpChunkDecoder {
    private enum State { case size, data(Int), separator, trailers, done }
    private var state = State.size
    private var pending = Data()
    private var trailerBytes = 0
    var finished: Bool { if case .done = state { return true }; return false }

    func append(_ data: Data, consume: (Data) throws -> Void) throws {
        pending.append(data)
        while !pending.isEmpty {
            switch state {
            case .size:
                guard let line = try takeLine() else { return }
                let token = line.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false)[0]
                    .trimmingCharacters(in: .whitespaces)
                guard !token.isEmpty, token.utf8.allSatisfy({
                    (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0)
                }), let size = Int(token, radix: 16) else { throw invalid() }
                state = size == 0 ? .trailers : .data(size)
            case .data(let remaining):
                let count = min(remaining, pending.count)
                try consume(Data(pending.prefix(count)))
                pending.removeFirst(count)
                state = count == remaining ? .separator : .data(remaining - count)
            case .separator:
                guard pending.count >= 2 else { return }
                guard pending.prefix(2) == Data([13, 10]) else { throw invalid() }
                pending.removeFirst(2)
                state = .size
            case .trailers:
                guard let line = try takeLine() else { return }
                trailerBytes += line.utf8.count + 2
                guard trailerBytes <= 16 * 1024 else { throw invalid() }
                if line.isEmpty { state = .done }
                else if !line.contains(":") { throw invalid() }
            case .done:
                throw invalid()
            }
        }
    }

    private func takeLine() throws -> String? {
        guard let range = pending.range(of: Data([13, 10])) else {
            guard pending.count <= 16 * 1024 else { throw invalid() }
            return nil
        }
        guard range.lowerBound - pending.startIndex <= 16 * 1024,
              let line = String(data: pending[..<range.lowerBound], encoding: .utf8),
              !line.contains("\r"), !line.contains("\n") else { throw invalid() }
        pending.removeSubrange(pending.startIndex..<range.upperBound)
        return line
    }

    private func invalid() -> Error { FolioleCompanionHttpHead.invalid("invalid_http_chunked_body") }
}
