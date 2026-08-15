package com.foliole.android;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

final class FolioleCompanionHttpResponse {
    private FolioleCompanionHttpResponse() {}

    static void json(OutputStream output, int status, JSONObject body) throws Exception {
        bytes(output, status, "application/json; charset=utf-8", body.toString().getBytes(StandardCharsets.UTF_8));
    }

    static void bytes(OutputStream output, int status, String contentType, byte[] body) throws Exception {
        bytes(output, status, contentType, null, body);
    }

    static void bytes(OutputStream output, int status, String contentType, String originalContentType, byte[] body) throws Exception {
        String reason = status == 200 ? "OK" : status == 202 ? "Accepted" : status == 401 ? "Unauthorized" :
            status == 403 ? "Forbidden" : status == 404 ? "Not Found" : status == 409 ? "Conflict" : "Bad Request";
        String headers = "HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: " + contentType +
            (originalContentType == null ? "" : "\r\nX-Foliole-Original-Content-Type: " + originalContentType) +
            "\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n";
        output.write(headers.getBytes(StandardCharsets.US_ASCII));
        output.write(body); output.flush();
    }
}
