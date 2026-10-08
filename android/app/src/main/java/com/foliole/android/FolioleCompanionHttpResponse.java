package com.foliole.android;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncReceiptBody;
import com.foliole.android.framed.FramedSyncPreamble;
import com.foliole.android.framed.FramedSyncWireHeader;

final class FolioleCompanionHttpResponse {
    private FolioleCompanionHttpResponse() {}

    static void json(OutputStream output, int status, JSONObject body) throws Exception {
        bytes(output, status, "application/json; charset=utf-8", body.toString().getBytes(StandardCharsets.UTF_8));
    }

    static void bytes(OutputStream output, int status, String contentType, byte[] body) throws Exception {
        bytes(output, status, contentType, null, body);
    }

    static void framed(
        OutputStream output, byte[] body, String deviceId, String libraryEpoch
    ) throws Exception {
        framedHeaders(output, body.length, deviceId, libraryEpoch);
        output.write(body);
        output.flush();
    }

    static void framed(OutputStream output, FramedSyncReceiptBody body, String deviceId, String libraryEpoch)
        throws Exception {
        framedHeaders(output, body.length(), deviceId, libraryEpoch);
        body.copyTo(output);
    }

    static void framed(OutputStream output,
        com.foliole.android.framed.FramedSyncSessionFile body, String deviceId, String libraryEpoch
    ) throws Exception {
        framedHeaders(output, body.length(), deviceId, libraryEpoch);
        body.copyTo(output);
    }

    static void framed(OutputStream output, java.io.File body, String deviceId, String libraryEpoch)
        throws Exception {
        framedHeaders(output, body.length(), deviceId, libraryEpoch);
        try (var input = new java.io.FileInputStream(body)) {
            byte[] buffer = new byte[64 * 1024];
            for (int count; (count = input.read(buffer)) >= 0;) output.write(buffer, 0, count);
        }
        output.flush();
    }

    static void framed(OutputStream output, java.io.File body, String deviceId, String libraryEpoch,
        FramedSyncPayloadBudget budget, FramedSyncPayloadBudget.Lane lane) throws Exception {
        if (lane == FramedSyncPayloadBudget.Lane.RECEIPT && body.length() > FramedSyncPayloadBudget.RECEIPT_BYTES +
            FramedSyncPreamble.BYTES + FramedSyncWireHeader.BYTES) {
            throw new IllegalArgumentException("framed_sync_receipt_frame_limit_exceeded");
        }
        framedSequence(output, body, deviceId, libraryEpoch, budget, lane);
    }

    static void framedSequence(OutputStream output, java.io.File body, String deviceId, String libraryEpoch,
        FramedSyncPayloadBudget budget, FramedSyncPayloadBudget.Lane lane) throws Exception {
        framedHeaders(output, body.length(), deviceId, libraryEpoch);
        try (var input = new java.io.FileInputStream(body)) {
            while (true) {
                try (var loan = budget.acquire(FramedSyncPayloadBudget.Direction.OUTBOUND, lane)) {
                    byte[] buffer = new byte[64 * 1024];
                    int count = input.read(buffer);
                    if (count < 0) break;
                    output.write(buffer, 0, count);
                }
            }
        }
        output.flush();
    }

    private static void framedHeaders(OutputStream output, long length, String deviceId, String epoch)
        throws Exception {
        String headers = "HTTP/1.1 200 OK\r\n" +
            "Content-Type: application/vnd.foliole.framed-sync\r\n" +
            "X-Foliole-Device-Id: " + deviceId + "\r\n" +
            "X-Foliole-Library-Epoch: " + epoch + "\r\n" +
            "Content-Length: " + length + "\r\nConnection: close\r\n\r\n";
        output.write(headers.getBytes(StandardCharsets.US_ASCII));
    }

    static void bytes(OutputStream output, int status, String contentType, String originalContentType, byte[] body) throws Exception {
        bytes(output, status, contentType, originalContentType, body, -1);
    }

    static void bytes(OutputStream output, int status, String contentType, String originalContentType,
                      byte[] body, long totalBytes) throws Exception {
        String reason = status == 200 ? "OK" : status == 202 ? "Accepted" : status == 401 ? "Unauthorized" :
            status == 403 ? "Forbidden" : status == 404 ? "Not Found" : status == 409 ? "Conflict" : "Bad Request";
        String headers = "HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: " + contentType +
            (originalContentType == null ? "" : "\r\nX-Foliole-Original-Content-Type: " + originalContentType) +
            (totalBytes < 0 ? "" : "\r\nX-Foliole-Resource-Total-Bytes: " + totalBytes) +
            "\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n";
        output.write(headers.getBytes(StandardCharsets.US_ASCII));
        output.write(body); output.flush();
    }
}
