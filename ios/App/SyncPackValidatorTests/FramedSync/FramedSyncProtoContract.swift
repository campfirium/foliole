import Foundation

struct ProtocolPayloadField: Equatable {
    let fieldNumber: Int
    let fieldName: String
    let messageType: String
}

enum FramedSyncProtoContract {
    static func payloadFields(in proto: Data) throws -> [ProtocolPayloadField] {
        guard let source = String(data: proto, encoding: .utf8),
              let body = block(named: "message ProtocolMessage", in: source),
              let payload = block(named: "oneof payload", in: body) else {
            throw ProtoContractError.protocolMessageMissing
        }
        let expression = try NSRegularExpression(
            pattern: #"(?m)^\s*(\w+)\s+(\w+)\s*=\s*(\d+)\s*;"#
        )
        let range = NSRange(payload.startIndex..<payload.endIndex, in: payload)
        return try expression.matches(in: payload, range: range).map { match in
            guard let typeRange = Range(match.range(at: 1), in: payload),
                  let nameRange = Range(match.range(at: 2), in: payload),
                  let numberRange = Range(match.range(at: 3), in: payload),
                  let number = Int(payload[numberRange]) else {
                throw ProtoContractError.payloadFieldMalformed
            }
            return ProtocolPayloadField(
                fieldNumber: number,
                fieldName: String(payload[nameRange]),
                messageType: String(payload[typeRange])
            )
        }
    }

    static func declaredMessages(in proto: Data) throws -> Set<String> {
        guard let source = String(data: proto, encoding: .utf8) else {
            throw ProtoContractError.notUTF8
        }
        let expression = try NSRegularExpression(pattern: #"(?m)^message\s+(\w+)\s*\{"#)
        let range = NSRange(source.startIndex..<source.endIndex, in: source)
        return Set(expression.matches(in: source, range: range).compactMap { match in
            Range(match.range(at: 1), in: source).map { String(source[$0]) }
        })
    }

    private static func block(named name: String, in source: String) -> String? {
        guard let declaration = source.range(of: name),
              let openingBrace = source[declaration.upperBound...].firstIndex(of: "{") else {
            return nil
        }
        var depth = 0
        for index in source.indices[openingBrace...].dropFirst() {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" {
                if depth == 0 {
                    return String(source[source.index(after: openingBrace)..<index])
                }
                depth -= 1
            }
        }
        return nil
    }
}

enum ProtoContractError: Error {
    case notUTF8
    case payloadFieldMalformed
    case protocolMessageMissing
}
