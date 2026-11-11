package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import okhttp3.Credentials;
import okhttp3.HttpUrl;
import okhttp3.Request;

final class FolioleWebDavRequestAuthorization {
    private FolioleWebDavRequestAuthorization() {}

    static Request authorize(Context context, Request request, HttpUrl root, String libraryKey, JSONObject reference)
        throws IOException {
        try {
            var scope = scope(libraryKey, root, reference);
            if (!request.url().toString().startsWith(root.toString())) throw unavailable();
            var credentials = new FolioleWebDavCredentialStore(context).load(scope);
            if (credentials == null) throw unavailable();
            return request.newBuilder().header("Authorization",
                Credentials.basic(credentials.username, credentials.password, StandardCharsets.UTF_8)).build();
        } catch (Exception error) {
            throw unavailable();
        }
    }

    private static FolioleWebDavCredentialStore.Scope scope(String libraryKey, HttpUrl root, JSONObject reference)
        throws Exception {
        Object rawVersion = reference.get("version");
        if (!(rawVersion instanceof String) || !((String) rawVersion).matches("[1-9][0-9]{0,15}")) throw unavailable();
        long version = Long.parseLong((String) rawVersion);
        if (version > 9007199254740991L) throw unavailable();
        return new FolioleWebDavCredentialStore.Scope(libraryKey, reference.getString("library_epoch"),
            reference.getString("group_id"), reference.getString("desktop_device_id"),
            reference.getString("phone_device_id"), reference.getString("binding_id"), root.toString(), version);
    }

    private static IOException unavailable() {
        return new IOException("credential_unavailable");
    }
}
