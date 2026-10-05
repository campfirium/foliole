import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

enum FolioleCompanionSyncGroupJoinCrypto {
    private static let algorithm = "ECDH-P256-HKDF-SHA256-AES-GCM"
    private static let info = Data("Foliole companion pairing v1".utf8)

    static func encrypt(publicKey encodedPublicKey: String, plaintext: Data) throws -> [String: Any] {
        let publicKeyData = try Base64URL.decode(encodedPublicKey)
        guard publicKeyData.count == 65, publicKeyData.first == 4 else {
            throw invalid("sync_group_join_public_key_invalid")
        }
        let clientPublicKey = try P256.KeyAgreement.PublicKey(x963Representation: publicKeyData)
        let privateKey = P256.KeyAgreement.PrivateKey()
        let sharedSecret = try privateKey.sharedSecretFromKeyAgreement(with: clientPublicKey)
        let salt = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
        let encryptionKey = sharedSecret.hkdfDerivedSymmetricKey(
            using: SHA256.self, salt: salt, sharedInfo: info, outputByteCount: 32
        )
        let sealed = try AES.GCM.seal(plaintext, using: encryptionKey)
        let ciphertext = sealed.ciphertext + sealed.tag
        return [
            "algorithm": algorithm,
            "ciphertext": Base64URL.encode(ciphertext),
            "iv": Base64URL.encode(Data(sealed.nonce)),
            "salt": Base64URL.encode(salt),
            "server_public_key": Base64URL.encode(privateKey.publicKey.x963Representation)
        ]
    }

    private static func invalid(_ detail: String) -> Error {
        NSError(domain: "FolioleCompanionSyncGroupJoinCrypto", code: 1,
                userInfo: [NSLocalizedDescriptionKey: detail])
    }
}

enum Base64URL {
    static func encode(_ value: Data) -> String {
        value.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func decode(_ value: String) throws -> Data {
        guard !value.isEmpty, value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else {
            throw invalid()
        }
        let base64 = value.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
            .padding(toLength: ((value.count + 3) / 4) * 4, withPad: "=", startingAt: 0)
        guard let data = Data(base64Encoded: base64) else { throw invalid() }
        return data
    }

    private static func invalid() -> Error {
        NSError(domain: "FolioleCompanionBase64URL", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "base64url_invalid"])
    }
}

struct FolioleFramedSyncSessionContext {
    private static let domain = Data("foliole-framed-sync-session-context-v1".utf8)
    let groupID: String
    let initiatorDeviceID: String
    let initiatorLibraryEpoch: String
    let responderDeviceID: String
    let responderLibraryEpoch: String

    init(
        groupID: String, initiatorDeviceID: String, initiatorLibraryEpoch: String,
        responderDeviceID: String, responderLibraryEpoch: String
    ) throws {
        self.groupID = try Self.text(groupID)
        self.initiatorDeviceID = try Self.text(initiatorDeviceID)
        self.initiatorLibraryEpoch = try Self.text(initiatorLibraryEpoch)
        self.responderDeviceID = try Self.text(responderDeviceID)
        self.responderLibraryEpoch = try Self.text(responderLibraryEpoch)
    }

    func validate(_ preamble: FolioleFramedSyncPreamble) throws -> Data {
        guard preamble.contextKind == 1 else { throw invalid("session_preamble_required") }
        guard preamble.startingSequence == 0 else { throw invalid("session_starting_sequence_invalid") }
        let sessionID = preamble.identifier
        guard deriveContextID(sessionID: sessionID) == preamble.contextID else {
            throw invalid("session_context_mismatch")
        }
        return sessionID
    }

    func deriveContextID(sessionID: Data) -> Data {
        var bytes = Self.domain + Data([0, 0, 22])
        [groupID, initiatorDeviceID, initiatorLibraryEpoch,
         responderDeviceID, responderLibraryEpoch].forEach { bytes.appendLengthPrefixed($0) }
        bytes.append(sessionID)
        return Data(SHA256.hash(data: bytes))
    }

    private static func text(_ value: String) throws -> String {
        guard !value.isEmpty, value.utf8.count <= 64 * 1024 else {
            throw invalid("session_context_text_invalid")
        }
        return value
    }

    private func invalid(_ code: String) -> FolioleFramedSyncValidationError { Self.invalid(code) }
    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError {
        FolioleFramedSyncValidationError(code)
    }
}

enum FolioleFramedSyncFrameCrypto {
    static func encrypt(
        groupKey: Data, preamble: FolioleFramedSyncPreamble,
        header: Data, plaintext: Data, sequence: UInt64
    ) throws -> Data {
        let sealed = try AES.GCM.seal(
            plaintext, using: try frameKey(groupKey, preamble),
            nonce: try nonce(preamble.noncePrefix, sequence),
            authenticating: preamble.encoded + header
        )
        return sealed.ciphertext + sealed.tag
    }

    static func decrypt(
        groupKey: Data, preamble: FolioleFramedSyncPreamble,
        frame: FolioleFramedSyncWireFrame, expectedSequence: UInt64
    ) throws -> Data {
        guard frame.header.sequence == expectedSequence else {
            throw FolioleFramedSyncValidationError("frame_sequence_not_contiguous")
        }
        guard preamble.compression == 0 else {
            throw FolioleFramedSyncValidationError("gzip_decoder_required")
        }
        guard frame.ciphertext.count >= 16 else {
            throw FolioleFramedSyncValidationError("frame_authentication_failed")
        }
        let box = try AES.GCM.SealedBox(
            nonce: try nonce(preamble.noncePrefix, frame.header.sequence),
            ciphertext: frame.ciphertext.dropLast(16), tag: frame.ciphertext.suffix(16)
        )
        do {
            return try AES.GCM.open(
                box, using: try frameKey(groupKey, preamble),
                authenticating: preamble.encoded + frame.headerBytes
            )
        } catch {
            throw FolioleFramedSyncValidationError("frame_authentication_failed")
        }
    }

    private static func frameKey(
        _ groupKey: Data, _ preamble: FolioleFramedSyncPreamble
    ) throws -> SymmetricKey {
        guard groupKey.count == 32 else {
            throw FolioleFramedSyncValidationError("group_key_must_be_32_bytes")
        }
        let label = preamble.contextKind == 1
            ? "Foliole framed sync v22 session" : "Foliole framed sync v22 transfer"
        return HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: groupKey), salt: preamble.identifier,
            info: Data(label.utf8) + Data([0]) + preamble.contextID, outputByteCount: 32
        )
    }

    private static func nonce(_ prefix: Data, _ sequence: UInt64) throws -> AES.GCM.Nonce {
        var bytes = prefix
        bytes.appendUInt64BE(sequence)
        return try AES.GCM.Nonce(data: bytes)
    }
}

extension FolioleFramedSyncPreamble {
    var compression: UInt8 { encoded[13] }
}
