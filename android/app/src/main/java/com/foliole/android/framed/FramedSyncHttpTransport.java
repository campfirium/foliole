package com.foliole.android.framed;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.Map;

public final class FramedSyncHttpTransport {
    public static final String CONTENT_TYPE = "application/vnd.foliole.framed-sync";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;

    public interface RequestBody {
        void write(FramedSyncStreamWriter writer) throws Exception;
    }

    public interface ResponseBody<T> {
        T read(FramedSyncStreamReader reader) throws Exception;
    }

    public interface RawResponseBody<T> {
        T read(InputStream input) throws Exception;
    }

    private FramedSyncHttpTransport() {}

    public static <T> T post(
        URL url,
        String groupId,
        String expectedRemoteDeviceId,
        String expectedRemoteLibraryEpoch,
        Map<String, String> memberAuthHeaders,
        RequestBody requestBody,
        ResponseBody<T> responseBody
    ) throws Exception {
        return postStream(url, groupId, expectedRemoteDeviceId, expectedRemoteLibraryEpoch,
            memberAuthHeaders, requestBody,
            input -> responseBody.read(new FramedSyncStreamReader(input)));
    }

    public static <T> T postStream(
        URL url,
        String groupId,
        String expectedRemoteDeviceId,
        String expectedRemoteLibraryEpoch,
        Map<String, String> memberAuthHeaders,
        RequestBody requestBody,
        RawResponseBody<T> responseBody
    ) throws Exception {
        requireText(groupId, "sync_group_id_required");
        requireText(expectedRemoteDeviceId, "remote_device_id_required");
        requireText(expectedRemoteLibraryEpoch, "remote_library_epoch_required");
        requireMemberAuth(memberAuthHeaders, groupId);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setChunkedStreamingMode(64 * 1024);
        connection.setRequestProperty("Accept", CONTENT_TYPE);
        connection.setRequestProperty("Content-Type", CONTENT_TYPE);
        for (Map.Entry<String, String> header : memberAuthHeaders.entrySet()) {
            connection.setRequestProperty(header.getKey(), header.getValue());
        }
        connection.setRequestProperty("X-Sync-Group-Id", groupId);
        try {
            try (OutputStream output = connection.getOutputStream()) {
                FramedSyncStreamWriter writer = new FramedSyncStreamWriter(output);
                requestBody.write(writer);
                writer.flush();
            }
            int status = connection.getResponseCode();
            if (status != 200) throw new IllegalStateException("framed_sync_http_" + status);
            requireResponseIdentity(connection, expectedRemoteDeviceId, expectedRemoteLibraryEpoch);
            try (InputStream input = connection.getInputStream()) {
                return responseBody.read(input);
            }
        } finally {
            connection.disconnect();
        }
    }

    public static void postNoResponse(
        URL url,
        String groupId,
        String expectedRemoteDeviceId,
        String expectedRemoteLibraryEpoch,
        Map<String, String> memberAuthHeaders,
        RequestBody requestBody
    ) throws Exception {
        postStream(url, groupId, expectedRemoteDeviceId, expectedRemoteLibraryEpoch,
            memberAuthHeaders, requestBody, input -> {
                byte[] buffer = new byte[8192];
                while (input.read(buffer) != -1) {}
                return null;
            });
    }

    private static void requireMemberAuth(Map<String, String> headers, String groupId) {
        if (headers == null) throw new SecurityException("member_auth_headers_required");
        requireHeader(headers, "x-device-id");
        requireHeader(headers, "x-nonce");
        requireHeader(headers, "x-signature");
        requireHeader(headers, "x-timestamp");
        String signedGroup = header(headers, "x-sync-group-id");
        if (signedGroup != null && !groupId.equals(signedGroup)) {
            throw new SecurityException("sync_group_identity_mismatch");
        }
    }

    private static void requireResponseIdentity(
        HttpURLConnection connection,
        String expectedDeviceId,
        String expectedLibraryEpoch
    ) {
        String contentType = connection.getContentType();
        if (contentType == null || !CONTENT_TYPE.equals(
            contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT))) {
            throw new SecurityException("framed_sync_response_content_type_invalid");
        }
        if (!expectedDeviceId.equals(connection.getHeaderField("X-Foliole-Device-Id")) ||
            !expectedLibraryEpoch.equals(connection.getHeaderField("X-Foliole-Library-Epoch"))) {
            throw new SecurityException("framed_sync_response_identity_mismatch");
        }
    }

    private static void requireHeader(Map<String, String> headers, String name) {
        if (header(headers, name) == null) throw new SecurityException("member_auth_headers_required");
    }

    private static String header(Map<String, String> headers, String name) {
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (name.equals(entry.getKey().toLowerCase(Locale.ROOT)) &&
                entry.getValue() != null && !entry.getValue().trim().isEmpty()) {
                return entry.getValue().trim();
            }
        }
        return null;
    }

    private static void requireText(String value, String error) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(error);
    }
}
