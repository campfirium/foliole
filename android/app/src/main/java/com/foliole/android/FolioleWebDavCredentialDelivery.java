package com.foliole.android;

import android.content.Context;
import android.os.SystemClock;
import android.util.Base64;

import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncPayloadBudgetRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class FolioleWebDavCredentialDelivery {
    private static final long LIFETIME_MS = 300_000;
    private static final int BASE64 = Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING;
    private static Pending pending;

    private FolioleWebDavCredentialDelivery() {}

    static synchronized JSObject prepare(Context context, PluginCall call) throws Exception {
        var owner = owner(call);
        JSONObject offer = call.getObject("offer");
        String id = offer.getString("id");
        if (pending != null && pending.live(owner) && pending.id.equals(id)) {
            if (!Arrays.equals(pending.transcript, transcript(offer, pending.phoneKey, pending.identityKey))) throw invalid();
            return pending.view();
        }
        var generated = create(context, offer, owner);
        pending = generated;
        return generated.view();
    }

    static synchronized JSObject confirm(PluginCall call) throws Exception {
        Pending current = requirePending(call);
        if (!current.fingerprint.equals(call.getString("fingerprint"))) throw invalid();
        current.approved = true;
        return new JSObject().put("confirmation", proof(current.confirmation, "confirmed"));
    }

    static synchronized JSObject install(Context context, PluginCall call) throws Exception {
        Pending current = requirePending(call);
        if (!current.approved) throw invalid();
        var credential = open(current, call.getObject("envelope"));
        new FolioleWebDavCredentialStore(context).save(current.scope, credential);
        return new JSObject().put("receipt", proof(current.receipt, "installed"));
    }

    private static Pending create(Context context, JSONObject offer, FramedSyncPayloadBudget owner) throws Exception {
        var generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        var pair = generator.generateKeyPair();
        String phoneKey = Base64.encodeToString(pair.getPublic().getEncoded(), BASE64);
        var desktopKey = (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(
            new X509EncodedKeySpec(Base64.decode(offer.getString("desktop_key"), BASE64)));
        if (!desktopKey.getParams().getCurve().equals(((ECPublicKey) pair.getPublic()).getParams().getCurve())) throw invalid();
        var agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(pair.getPrivate());
        agreement.doPhase(desktopKey, true);
        var identity = offer.has("desktop_identity") ? FolioleWebDavDeviceIdentity.loadOrCreate(context) : null;
        String identityKey = identity == null ? null : identity.publicKey();
        byte[] transcript = transcript(offer, phoneKey, identityKey);
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(transcript);
        byte[] shared = agreement.generateSecret();
        try {
            return new Pending(offer.getString("id"), owner, scope(offer, owner), phoneKey, transcript, digest, shared,
                identityKey, identity == null ? null : identity.sign(transcript));
        } finally {
            Arrays.fill(shared, (byte) 0);
        }
    }

    private static FolioleWebDavCredentialStore.Credentials open(Pending current, JSONObject envelope) throws Exception {
        byte[] iv = Base64.decode(envelope.getString("iv"), BASE64);
        String encoded = envelope.getString("ciphertext");
        if (iv.length != 12 || encoded.length() > 100_000) throw invalid();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(current.encryption, "AES"), new GCMParameterSpec(128, iv));
        cipher.updateAAD(current.transcript);
        byte[] plaintext = cipher.doFinal(Base64.decode(encoded, BASE64));
        try {
            JSONObject data = new JSONObject(new String(plaintext, StandardCharsets.UTF_8));
            return new FolioleWebDavCredentialStore.Credentials(data.getString("username"), data.getString("password"));
        } finally {
            Arrays.fill(plaintext, (byte) 0);
        }
    }

    private static byte[] transcript(JSONObject offer, String phoneKey, String identityKey) throws Exception {
        JSONObject binding = offer.getJSONObject("binding");
        var identity = offer.optJSONObject("desktop_identity");
        boolean paired = identity != null && identityKey != null;
        if ((identity != null) != (identityKey != null)) throw invalid();
        String protocol = paired ? "Foliole WebDAV credential delivery v2" : "Foliole WebDAV credential delivery v1";
        String[] fields = { protocol, offer.getString("id"), binding.getString("id"),
            binding.getString("group_id"), binding.getString("desktop_device_id"), binding.getString("phone_device_id"),
            binding.getString("directory_url"), offer.getString("library_epoch"), Long.toString(offer.getLong("version")),
            offer.getString("desktop_key"), phoneKey };
        var transcript = new java.util.StringJoiner("\n");
        for (String field : fields) appendField(transcript, field);
        if (paired) {
            appendField(transcript, identity.getString("library_epoch"));
            appendField(transcript, identity.getString("public_key"));
            appendField(transcript, identityKey);
        }
        return transcript.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void appendField(java.util.StringJoiner transcript, String field) {
        if (field.contains("\n") || field.contains("\r")) throw invalid();
        transcript.add(field);
    }

    private static FolioleWebDavCredentialStore.Scope scope(JSONObject offer, FramedSyncPayloadBudget owner) throws Exception {
        JSONObject binding = offer.getJSONObject("binding");
        return new FolioleWebDavCredentialStore.Scope(owner.libraryKey(), offer.getString("library_epoch"),
            binding.getString("group_id"), binding.getString("desktop_device_id"), binding.getString("phone_device_id"),
            binding.getString("id"), binding.getString("directory_url"), offer.getLong("version"));
    }

    private static FramedSyncPayloadBudget owner(PluginCall call) {
        var owner = FramedSyncPayloadBudgetRegistry.current();
        if (owner.isClosed() || !owner.libraryKey().equals(call.getString("library_key"))
            || !owner.generationId().equals(call.getString("generation_id"))) throw invalid();
        return owner;
    }

    private static Pending requirePending(PluginCall call) {
        if (pending == null || !pending.live(owner(call)) || !pending.id.equals(call.getString("id"))) throw invalid();
        return pending;
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("webdav_credential_delivery_invalid");
    }

    private static String proof(byte[] key, String purpose) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return Base64.encodeToString(mac.doFinal(purpose.getBytes(StandardCharsets.UTF_8)), BASE64);
    }

    private static final class Pending {
        final String id, phoneKey, fingerprint, identityKey, identityProof;
        final FramedSyncPayloadBudget owner;
        final FolioleWebDavCredentialStore.Scope scope;
        final byte[] transcript, encryption, confirmation, receipt;
        final long expires = SystemClock.elapsedRealtime() + LIFETIME_MS;
        boolean approved;

        Pending(String id, FramedSyncPayloadBudget owner, FolioleWebDavCredentialStore.Scope scope, String phoneKey,
                byte[] transcript, byte[] digest, byte[] shared, String identityKey, String identityProof) throws Exception {
            this.id = id;
            this.owner = owner;
            this.scope = scope;
            this.phoneKey = phoneKey;
            this.identityKey = identityKey;
            this.identityProof = identityProof;
            this.transcript = transcript;
            StringBuilder value = new StringBuilder();
            for (int i = 0; i < 16; i++) value.append(String.format(Locale.ROOT, "%02x", digest[i] & 255));
            fingerprint = value.toString();
            encryption = derive(shared, digest, "encryption");
            confirmation = derive(shared, digest, "confirmation");
            receipt = derive(shared, digest, "receipt");
        }

        boolean live(FramedSyncPayloadBudget expected) {
            return owner == expected && !owner.isClosed() && SystemClock.elapsedRealtime() < expires;
        }

        JSObject view() {
            var view = new JSObject().put("phone_key", phoneKey).put("fingerprint", fingerprint);
            if (identityKey != null) view.put("phone_identity_key", identityKey).put("phone_identity_proof", identityProof);
            return view;
        }

        private static byte[] derive(byte[] shared, byte[] digest, String purpose) throws Exception {
            byte[] info = ("WebDAV credential " + purpose).getBytes(StandardCharsets.UTF_8);
            return FolioleCompanionSyncGroupJoinCrypto.hkdf(shared, digest, info, 32);
        }
    }
}
