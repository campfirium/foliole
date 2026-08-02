#include "legacy_safe_storage.h"

#include <CommonCrypto/CommonCryptor.h>
#include <CommonCrypto/CommonKeyDerivation.h>
#include <Security/Security.h>
#include <cstring>

#import <Foundation/Foundation.h>

namespace {

constexpr char kService[] = "Foliole Safe Storage";
constexpr char kAccount[] = "Foliole App Store Key";
constexpr uint8_t kPrefix[] = {'v', '1', '0'};
constexpr uint8_t kSalt[] = {'s', 'a', 'l', 't', 'y', 's', 'a', 'l', 't'};

napi_value BoolValue(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

napi_value String(napi_env env, const char *value) {
  napi_value result;
  napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &result);
  return result;
}

void Set(napi_env env, napi_value object, const char *key, napi_value value) {
  napi_set_named_property(env, object, key, value);
}

napi_value Failure(napi_env env, const char *code) {
  napi_value result;
  napi_create_object(env, &result);
  Set(env, result, "ok", BoolValue(env, false));
  Set(env, result, "errorCode", String(env, code));
  return result;
}

napi_value Success(napi_env env, const uint8_t *bytes, size_t length) {
  napi_value result;
  napi_value plaintext;
  napi_create_object(env, &result);
  napi_create_string_utf8(env, reinterpret_cast<const char *>(bytes), length, &plaintext);
  Set(env, result, "ok", BoolValue(env, true));
  Set(env, result, "plaintext", plaintext);
  return result;
}

bool ReadCiphertext(napi_env env, napi_callback_info info, uint8_t **bytes, size_t *length) {
  size_t argc = 1;
  napi_value argv[1];
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc != 1) return false;
  bool isBuffer = false;
  if (napi_is_buffer(env, argv[0], &isBuffer) != napi_ok || !isBuffer) return false;
  void *data = nullptr;
  if (napi_get_buffer_info(env, argv[0], &data, length) != napi_ok) return false;
  *bytes = static_cast<uint8_t *>(data);
  return true;
}

OSStatus ReadLegacyPassword(void **password, UInt32 *length) {
  return SecKeychainFindGenericPassword(
    nullptr,
    static_cast<UInt32>(sizeof(kService) - 1), kService,
    static_cast<UInt32>(sizeof(kAccount) - 1), kAccount,
    length, password, nullptr
  );
}

bool DeriveKey(const void *password, UInt32 passwordLength, uint8_t key[kCCKeySizeAES128]) {
  return CCKeyDerivationPBKDF(
    kCCPBKDF2,
    static_cast<const char *>(password), passwordLength,
    kSalt, sizeof(kSalt),
    kCCPRFHmacAlgSHA1, 1003,
    key, kCCKeySizeAES128
  ) == kCCSuccess;
}

}  // namespace

napi_value DecryptLegacyMasSafeStorage(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    uint8_t *ciphertext = nullptr;
    size_t ciphertextLength = 0;
    if (!ReadCiphertext(env, info, &ciphertext, &ciphertextLength)) {
      return Failure(env, "invalid_argument");
    }
    if (ciphertextLength <= sizeof(kPrefix) || memcmp(ciphertext, kPrefix, sizeof(kPrefix)) != 0) {
      return Failure(env, "unsupported_ciphertext");
    }
    void *password = nullptr;
    UInt32 passwordLength = 0;
    if (ReadLegacyPassword(&password, &passwordLength) != errSecSuccess) {
      return Failure(env, "legacy_key_unavailable");
    }
    uint8_t key[kCCKeySizeAES128] = {};
    const bool derived = DeriveKey(password, passwordLength, key);
    SecKeychainItemFreeContent(nullptr, password);
    if (!derived) return Failure(env, "key_derivation_failed");

    const uint8_t iv[kCCBlockSizeAES128] = {
      ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '
    };
    const uint8_t *payload = ciphertext + sizeof(kPrefix);
    const size_t payloadLength = ciphertextLength - sizeof(kPrefix);
    NSMutableData *plaintext = [NSMutableData dataWithLength:payloadLength + kCCBlockSizeAES128];
    size_t plaintextLength = 0;
    const CCCryptorStatus status = CCCrypt(
      kCCDecrypt, kCCAlgorithmAES, kCCOptionPKCS7Padding,
      key, sizeof(key), iv,
      payload, payloadLength,
      plaintext.mutableBytes, plaintext.length, &plaintextLength
    );
    if (status != kCCSuccess) return Failure(env, "legacy_decryption_failed");
    return Success(env, static_cast<const uint8_t *>(plaintext.bytes), plaintextLength);
  }
}
