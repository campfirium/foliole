package com.foliole.android;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.DataInputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import okhttp3.HttpUrl;

final class FolioleWebDavCredentialStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final byte FORMAT = 1;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final int MAX_CREDENTIAL_CHARS = 4096;
    private static final int MAX_RECORD_BYTES = 64 * 1024;
    private final File directory;
    private final String alias;

    FolioleWebDavCredentialStore(Context context) {
        directory = context.getNoBackupFilesDir();
        alias = context.getPackageName() + ".webdav-credentials.v1";
    }

    void save(Scope scope, Credentials credentials) throws IOException {
        synchronized (FolioleWebDavCredentialStore.class) {
            Credentials stored = load(scope);
            if (stored != null) {
                if (!stored.username.equals(credentials.username) || !stored.password.equals(credentials.password)) {
                    throw new IOException("webdav_relay_credential_version_conflict");
                }
                return;
            }
            try {
                write(file(scope), encrypt(scope, credentials));
            } catch (Exception error) {
                throw unavailable();
            }
        }
    }

    Credentials load(Scope scope) throws IOException {
        synchronized (FolioleWebDavCredentialStore.class) {
            try {
                byte[] bytes = read(file(scope));
                return bytes == null ? null : decrypt(scope, bytes);
            } catch (Exception error) {
                throw unavailable();
            }
        }
    }

    private byte[] encrypt(Scope scope, Credentials credentials) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key(true));
        cipher.updateAAD(scope.bytes);
        byte[] iv = cipher.getIV();
        if (iv.length != IV_BYTES) throw unavailable();
        byte[] secret = new JSONObject().put("username", credentials.username).put("password", credentials.password)
            .toString().getBytes(StandardCharsets.UTF_8);
        try {
            byte[] encrypted = cipher.doFinal(secret);
            byte[] record = new byte[1 + IV_BYTES + encrypted.length];
            record[0] = FORMAT;
            System.arraycopy(iv, 0, record, 1, IV_BYTES);
            System.arraycopy(encrypted, 0, record, 1 + IV_BYTES, encrypted.length);
            return record;
        } finally {
            Arrays.fill(secret, (byte) 0);
        }
    }

    private Credentials decrypt(Scope scope, byte[] record) throws Exception {
        if (record.length < 1 + IV_BYTES + TAG_BITS / 8 || record[0] != FORMAT) throw unavailable();
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(TAG_BITS, record, 1, IV_BYTES));
        cipher.updateAAD(scope.bytes);
        byte[] secret = cipher.doFinal(record, 1 + IV_BYTES, record.length - 1 - IV_BYTES);
        try {
            JSONObject data = new JSONObject(new String(secret, StandardCharsets.UTF_8));
            return new Credentials(data.getString("username"), data.getString("password"));
        } finally {
            Arrays.fill(secret, (byte) 0);
        }
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        Key existing = store.getKey(alias, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        if (!create || store.containsAlias(alias)) throw unavailable();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private AtomicFile file(Scope scope) throws Exception {
        if (directory == null) throw unavailable();
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(scope.bytes);
        StringBuilder name = new StringBuilder("webdav-credential-v1-");
        for (byte value : digest) {
            name.append(Character.forDigit((value & 0xff) >>> 4, 16)).append(Character.forDigit(value & 15, 16));
        }
        return new AtomicFile(new File(directory, name + ".bin"));
    }

    private static byte[] read(AtomicFile file) throws IOException {
        try (var stream = file.openRead()) {
            long length = stream.getChannel().size();
            if (length < 1 || length > MAX_RECORD_BYTES) throw unavailable();
            byte[] bytes = new byte[(int) length];
            new DataInputStream(stream).readFully(bytes);
            if (stream.read() != -1) throw unavailable();
            return bytes;
        } catch (FileNotFoundException error) {
            if (file.getBaseFile().exists()) throw error;
            return null;
        }
    }

    private static void write(AtomicFile file, byte[] record) throws IOException {
        FileOutputStream output = file.startWrite();
        try {
            output.write(record);
        } catch (IOException error) {
            file.failWrite(output);
            throw error;
        }
        file.finishWrite(output);
        // Android's AtomicFile can log a failed finish rather than throwing it to the caller.
        if (!Arrays.equals(record, read(file))) throw unavailable();
    }

    private static IOException unavailable() {
        return new IOException("webdav_relay_secure_storage_unavailable");
    }

    static final class Scope {
        private final byte[] bytes;

        Scope(String libraryKey, String libraryEpoch, String groupId, String desktopId, String phoneId,
              String bindingId, String directory, long version) {
            HttpUrl root = directory == null ? null : HttpUrl.parse(directory);
            if (root == null || !root.isHttps() || !root.username().isEmpty() || !root.password().isEmpty() ||
                root.query() != null || root.fragment() != null || !root.encodedPath().endsWith("/") || version < 1) {
                throw new IllegalArgumentException("webdav_relay_credential_scope_invalid");
            }
            JSONArray tuple = new JSONArray().put("foliole-webdav-credential-v1");
            for (String id : new String[]{ libraryKey, libraryEpoch, groupId, desktopId, phoneId, bindingId }) {
                if (id == null || id.isEmpty()) throw new IllegalArgumentException("webdav_relay_credential_scope_invalid");
                tuple.put(id);
            }
            bytes = tuple.put(root.toString()).put(version).toString().getBytes(StandardCharsets.UTF_8);
        }
    }

    static final class Credentials {
        final String username;
        final String password;

        Credentials(String username, String password) {
            if (username == null || password == null || username.trim().isEmpty() || username.contains(":") ||
                password.isEmpty() || username.length() > MAX_CREDENTIAL_CHARS || password.length() > MAX_CREDENTIAL_CHARS ||
                username.chars().anyMatch(Credentials::control) || password.chars().anyMatch(Credentials::control)) {
                throw new IllegalArgumentException("webdav_relay_invalid_credentials");
            }
            this.username = username;
            this.password = password;
        }

        private static boolean control(int character) {
            return character < 32 || character == 127;
        }
    }
}
