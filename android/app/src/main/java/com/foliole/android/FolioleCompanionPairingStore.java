package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import com.getcapacitor.JSObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class FolioleCompanionPairingStore {
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";

    private FolioleCompanionPairingStore() {}

    static JSObject loadPairingState(Context context) throws Exception {
        SharedPreferences prefs = prefs(context);
        FolioleCompanionPairingAuthorizationCutover.ensure(context, null, null, null);
        JSObject result = new JSObject();
        String authorizationId = prefs.getString(FolioleCompanionBridgeContractDefinitions.pairingAuthorizationIdPreferenceKey(context), null);
        String deviceId = prefs.getString(FolioleCompanionBridgeContractDefinitions.pairingDeviceIdPreferenceKey(context), null);
        boolean hasCredentials = canReadPairingSecret(context, authorizationId);
        result.put(FolioleCompanionBridgeContractDefinitions.pairingAuthorizationIdStateKey(context), trimToNull(authorizationId));
        result.put(FolioleCompanionBridgeContractDefinitions.pairingDeviceIdStateKey(context), trimToNull(deviceId));
        result.put(
            FolioleCompanionBridgeContractDefinitions.pairingDeviceKindStateKey(context),
            trimToNull(prefs.getString(FolioleCompanionBridgeContractDefinitions.pairingDeviceKindPreferenceKey(context), null))
        );
        result.put(
            FolioleCompanionBridgeContractDefinitions.pairingDeviceNameStateKey(context),
            trimToNull(prefs.getString(FolioleCompanionBridgeContractDefinitions.pairingDeviceNamePreferenceKey(context), null))
        );
        result.put(FolioleCompanionBridgeContractDefinitions.pairingHostNameStateKey(context), trimToNull(
            prefs.getString(FolioleCompanionBridgeContractDefinitions.pairingHostNamePreferenceKey(context), null)));
        result.put(FolioleCompanionBridgeContractDefinitions.pairingHostPlatformStateKey(context), trimToNull(
            prefs.getString(FolioleCompanionBridgeContractDefinitions.pairingHostPlatformPreferenceKey(context), null)));
        result.put(FolioleCompanionBridgeContractDefinitions.pairingIsPairedStateKey(context), hasCredentials);
        result.put(
            FolioleCompanionBridgeContractDefinitions.pairingPairedAtStateKey(context),
            trimToNull(prefs.getString(FolioleCompanionBridgeContractDefinitions.pairingPairedAtPreferenceKey(context), null))
        );
        result.put(
            FolioleCompanionBridgeContractDefinitions.pairingPrimaryDeviceIdStateKey(context),
            trimToNull(prefs.getString(FolioleCompanionBridgeContractDefinitions.pairingPrimaryDeviceIdPreferenceKey(context), null))
        );
        FolioleCompanionPairingMetadata.addState(context, prefs, result);
        FolioleCompanionPairingProtocolStore.addState(context, prefs, result, hasCredentials);
        return result;
    }

    static String loadPairedDeviceId(Context context) throws Exception {
        return requireMeta(context, FolioleCompanionBridgeContractDefinitions.pairingDeviceIdPreferenceKey(context));
    }

    static String loadStoredDeviceId(Context context) throws Exception {
        return trimToNull(prefs(context).getString(
            FolioleCompanionBridgeContractDefinitions.pairingDeviceIdPreferenceKey(context), null
        ));
    }

    static String loadAuthorizedDeviceId(Context context) throws Exception {
        String deviceId = loadStoredDeviceId(context);
        String authorizationId = prefs(context).getString(
            FolioleCompanionBridgeContractDefinitions.pairingAuthorizationIdPreferenceKey(context), null);
        return canReadPairingSecret(context, authorizationId) ? deviceId : null;
    }

    static JSObject savePairingCredentials(
        Context context,
        String authorizationId,
        String credentialSecret,
        String deviceId,
        String deviceKind,
        String deviceName,
        String hostName,
        String hostPlatform,
        int negotiatedProtocolVersion,
        String pairedAt,
        String primaryDeviceId,
        String remotePeerId,
        String remotePeerName,
        String remotePeerPlatform,
        JSObject remoteProtocol
    ) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, loadOrCreateSecretKey(context));
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length == 0) {
            throw new IllegalStateException("Android Keystore did not provide an encryption IV.");
        }
        byte[] encrypted = cipher.doFinal(credentialSecret.getBytes(StandardCharsets.UTF_8));
        SharedPreferences.Editor editor = prefs(context).edit()
            .putString(FolioleCompanionBridgeContractDefinitions.pairingAuthorizationIdPreferenceKey(context), authorizationId.trim())
            .putString(FolioleCompanionBridgeContractDefinitions.pairingCredentialSecretPreferenceKey(context), Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString(FolioleCompanionBridgeContractDefinitions.pairingCredentialSecretIvPreferenceKey(context), Base64.encodeToString(iv, Base64.NO_WRAP))
            .putString(FolioleCompanionBridgeContractDefinitions.pairingDeviceIdPreferenceKey(context), deviceId.trim())
            .putString(FolioleCompanionBridgeContractDefinitions.pairingDeviceKindPreferenceKey(context), deviceKind.trim())
            .putString(FolioleCompanionBridgeContractDefinitions.pairingDeviceNamePreferenceKey(context), deviceName.trim())
            .putString(FolioleCompanionBridgeContractDefinitions.pairingHostNamePreferenceKey(context), hostName.trim())
            .putString(FolioleCompanionBridgeContractDefinitions.pairingHostPlatformPreferenceKey(context), hostPlatform.trim())
            .putString(FolioleCompanionBridgeContractDefinitions.pairingPairedAtPreferenceKey(context), pairedAt.trim())
            .putString(FolioleCompanionBridgeContractDefinitions.pairingPrimaryDeviceIdPreferenceKey(context), primaryDeviceId.trim());
        FolioleCompanionPairingMetadata.saveRemotePeer(context, editor, remotePeerId, remotePeerName, remotePeerPlatform);
        FolioleCompanionPairingProtocolStore.save(context, editor, negotiatedProtocolVersion, remoteProtocol);
        boolean saved = editor.commit();
        if (!saved) {
            throw new IllegalStateException("Failed to persist companion pairing credentials.");
        }
        return loadPairingState(context);
    }

    static JSObject signRequest(
        Context context,
        String method,
        String pathWithQuery,
        String timestamp,
        String nonce,
        String bodyHash
    ) throws Exception {
        String authorizationId = requireMeta(context, FolioleCompanionBridgeContractDefinitions.pairingAuthorizationIdPreferenceKey(context));
        FolioleCompanionPairingProtocolStore.assertUsable(context, prefs(context));
        String secret = decryptSecret(context);
        String canonical = method.toUpperCase() + "\n" + pathWithQuery + "\n" + timestamp + "\n" + nonce + "\n" + bodyHash;
        JSObject headers = new JSObject();
        headers.put(FolioleCompanionPairingSignatureContractDefinitions.authorizationIdHeader(context), authorizationId);
        headers.put(FolioleCompanionPairingSignatureContractDefinitions.timestampHeader(context), timestamp);
        headers.put(FolioleCompanionPairingSignatureContractDefinitions.nonceHeader(context), nonce);
        headers.put(FolioleCompanionPairingSignatureContractDefinitions.signatureHeader(context), FolioleCompanionPairingCrypto.signCanonicalRequest(secret, canonical));
        JSObject result = new JSObject();
        result.put(FolioleCompanionPairingSignatureContractDefinitions.headersResponse(context), headers);
        return result;
    }

    static JSObject savePrimaryDeviceId(Context context, String primaryDeviceId) throws Exception {
        boolean saved = prefs(context).edit()
            .putString(FolioleCompanionBridgeContractDefinitions.pairingPrimaryDeviceIdPreferenceKey(context), primaryDeviceId.trim())
            .commit();
        if (!saved) {
            throw new IllegalStateException("Failed to persist companion primary device id.");
        }
        return loadPairingState(context);
    }

    static String decryptCredentialBag(Context context, String service, String salt, String iv, String ciphertext) throws Exception {
        return FolioleCompanionCredentialBagCipher.decrypt(
            decryptSecret(context), service, salt, iv, ciphertext);
    }

    private static SharedPreferences prefs(Context context) throws Exception {
        return context.getSharedPreferences(FolioleCompanionBridgeContractDefinitions.pairingPreferencesNameStorageKey(context), Context.MODE_PRIVATE);
    }

    private static boolean canReadPairingSecret(Context context, String authorizationId) {
        if (trimToNull(authorizationId) == null || trimToNull(readCredentialSecretPreference(context)) == null) {
            return false;
        }
        try {
            String secret = decryptSecret(context);
            FolioleCompanionPairingCrypto.signCanonicalRequest(secret, "pairing-state-check");
            return trimToNull(secret) != null;
        } catch (Exception exception) {
            clearPairingCredentials(context);
            return false;
        }
    }

    static void clearPairingCredentials(Context context) {
        try {
            SharedPreferences.Editor editor = prefs(context).edit();
            FolioleCompanionPairingPreferenceCleaner.clear(context, editor);
            editor.apply();
        } catch (Exception exception) {
            throw new IllegalStateException("Companion bridge contract asset is missing pairing preference key.", exception);
        }
    }

    private static SecretKey loadOrCreateSecretKey(Context context) throws Exception {
        String keyAlias = FolioleCompanionBridgeContractDefinitions.pairingKeyAliasStorageKey(context);
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(keyAlias)) {
            return (SecretKey) keyStore.getKey(keyAlias, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance("AES", ANDROID_KEYSTORE);
        generator.init(new android.security.keystore.KeyGenParameterSpec.Builder(
            keyAlias,
            android.security.keystore.KeyProperties.PURPOSE_DECRYPT | android.security.keystore.KeyProperties.PURPOSE_ENCRYPT
        )
            .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private static String decryptSecret(Context context) throws Exception {
        String encryptedSecret = requireMeta(context, FolioleCompanionBridgeContractDefinitions.pairingCredentialSecretPreferenceKey(context));
        String iv = requireMeta(context, FolioleCompanionBridgeContractDefinitions.pairingCredentialSecretIvPreferenceKey(context));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
            Cipher.DECRYPT_MODE,
            loadOrCreateSecretKey(context),
            new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
        );
        return new String(
            cipher.doFinal(Base64.decode(encryptedSecret, Base64.NO_WRAP)),
            StandardCharsets.UTF_8
        );
    }

    private static String requireMeta(Context context, String key) throws Exception {
        String value = trimToNull(prefs(context).getString(key, null));
        if (value == null) {
            throw new IllegalStateException("Companion is not paired.");
        }
        return value;
    }

    private static String readCredentialSecretPreference(Context context) {
        try {
            return prefs(context).getString(FolioleCompanionBridgeContractDefinitions.pairingCredentialSecretPreferenceKey(context), null);
        } catch (Exception exception) {
            throw new IllegalStateException("Companion bridge contract asset is missing pairing preference key.", exception);
        }
    }

    private static String trimToNull(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

}
