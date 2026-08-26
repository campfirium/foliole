import CryptoKit
import Foundation

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
