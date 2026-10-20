package com.foliole.android;

import android.util.Log;
import java.net.URL;
import java.util.Set;

/** Request metadata only: never include query strings, headers, file names or body content. */
final class FolioleRequestSyncTiming {
    private final String prefix;
    private long requestBytes;

    FolioleRequestSyncTiming(String requestId, URL url) {
        String operation = "unknown";
        String query = url.getQuery();
        if (query != null) for (String item : query.split("&")) {
            if (!item.startsWith("request=")) continue;
            String value = item.substring("request=".length());
            if (Set.of("inventory", "pull", "object", "pulls", "objects", "attachments", "round_finish").contains(value)) {
                operation = value;
            }
        }
        prefix = "request_id=" + requestId + " origin=" + url.getProtocol() + "://" + url.getHost()
            + ":" + url.getPort() + " operation=" + operation;
    }

    void chunk(String phase, int index, int bytes, long nanos) {
        if ("write".equals(phase)) requestBytes += bytes;
        emit(phase, nanos, " chunk=" + index + " bytes=" + bytes + " request_bytes=" + requestBytes);
    }

    void phase(String phase, long nanos) { emit(phase, nanos, " request_bytes=" + requestBytes); }

    private void emit(String phase, long nanos, String detail) {
        Log.d("FolioleSyncHttp", prefix + " phase=" + phase + " duration_ms=" + nanos / 1_000_000.0 + detail);
    }
}
