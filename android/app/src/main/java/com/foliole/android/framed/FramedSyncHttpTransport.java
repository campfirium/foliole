package com.foliole.android.framed;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;

public final class FramedSyncHttpTransport {
    public static final String CONTENT_TYPE = "application/vnd.foliole.framed-sync";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int ERROR_BODY_LIMIT_BYTES = 4 * 1024;
    private static final String MISSING_PARENT = "framed_sync_node_parent_missing:";
    private static final String SOURCE_CHANGED = "framed_sync_source_changed";
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
            if (status != 200) {
                String detail = readSafeErrorDetail(connection.getErrorStream());
                throw new IllegalStateException(
                    "framed_sync_http_" + status + (detail == null ? "" : ":" + detail));
            }
            requireResponseIdentity(connection, expectedRemoteDeviceId, expectedRemoteLibraryEpoch);
            try (InputStream input = connection.getInputStream()) {
                return responseBody.read(input);
            }
        } finally {
            connection.disconnect();
        }
    }

    private static String readSafeErrorDetail(InputStream input) {
        if (input == null) return null;
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[512];
            for (int count; (count = stream.read(buffer)) >= 0;) {
                if (output.size() + count > ERROR_BODY_LIMIT_BYTES) return null;
                output.write(buffer, 0, count);
            }
            String body = output.toString(StandardCharsets.UTF_8).trim();
            String prefix = "{\"error\":\"";
            if (!body.startsWith(prefix) || !body.endsWith("\"}")) return null;
            String error = body.substring(prefix.length(), body.length() - 2);
            if (SOURCE_CHANGED.equals(error)) return error;
            if (!error.startsWith(MISSING_PARENT)) return null;
            String parentId = error.substring(MISSING_PARENT.length());
            return parentId.matches("[A-Za-z0-9_-]{1,128}") ? error : null;
        } catch (Exception ignored) {
            return null;
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
