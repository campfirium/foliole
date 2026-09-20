package com.foliole.android;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

final class FolioleCompanionContentBlobBatchStore {
    private FolioleCompanionContentBlobBatchStore() {}

    static JSObject downloadBlobs(Context context, String url, JSONObject headers, String body) throws Exception {
        long startedAt = System.nanoTime();
        List<String> requestedHashes = requestedHashes(body);
        long httpStartedAt = System.nanoTime();
        FolioleCompanionDesktopHttpClient.BinaryResponse response = FolioleCompanionDesktopHttpClient.requestBinary(
            context, FolioleCompanionContentBlobBatchText.requireText(url,
                FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context)), "POST", headers, body);
        long httpElapsedMs = elapsedMs(httpStartedAt);
        long parseStartedAt = System.nanoTime();
        List<FolioleCompanionContentBlobMultipartBatch.Blob> parsed = parseBlobs(context, response);
        List<FolioleCompanionContentBlobMultipartBatch.Blob> accepted = new ArrayList<>();
        JSONObject errors = new JSONObject();
        for (String hash : requestedHashes) {
            List<FolioleCompanionContentBlobMultipartBatch.Blob> matches = new ArrayList<>();
            for (FolioleCompanionContentBlobMultipartBatch.Blob blob : parsed) if (blob.hash.equals(hash)) matches.add(blob);
            if (matches.isEmpty()) errors.put(hash, "missing_file");
            else if (matches.size() != 1) errors.put(hash, "protocol_error");
            else if (!hash.equals(FolioleCompanionContentBlobCasRules.digestHex(context, matches.get(0).bytes))) {
                errors.put(hash, "checksum_mismatch");
            } else accepted.add(matches.get(0));
        }
        long parseElapsedMs = elapsedMs(parseStartedAt);
        JSObject result = downloadResponse(context, accepted, failedHashes(requestedHashes, accepted),
            httpElapsedMs, parseElapsedMs, elapsedMs(startedAt));
        result.put(batchResponseKey(context, "failedHashErrors"), errors);
        return result;
    }

    private static List<String> requestedHashes(String body) throws Exception {
        JSONArray hashes = new JSONObject(body).getJSONArray("hashes");
        List<String> result = new ArrayList<>();
        for (int index = 0; index < hashes.length(); index += 1) {
            result.add(hashes.getString(index));
        }
        return result;
    }

    private static List<FolioleCompanionContentBlobMultipartBatch.Blob> parseBlobs(
        Context context, FolioleCompanionDesktopHttpClient.BinaryResponse response
    ) throws Exception {
        return FolioleCompanionContentBlobMultipartBatch.parse(response.body, response.contentType,
            FolioleCompanionHostBridgeContractDefinitions.contentBlobBatchBlobHashResponseHeaderKey(context),
            FolioleCompanionBridgeContractDefinitions.resourceHashRequestKey(context), context);
    }

    private static List<String> failedHashes(
        List<String> requestedHashes,
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs
    ) {
        List<String> failed = new ArrayList<>(requestedHashes);
        for (FolioleCompanionContentBlobMultipartBatch.Blob blob : blobs) {
            failed.remove(blob.hash);
        }
        return failed;
    }

    private static JSObject downloadResponse(
        Context context,
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs,
        List<String> failedHashes,
        long httpElapsedMs,
        long parseElapsedMs,
        long totalElapsedMs
    ) throws Exception {
        File pack = FolioleCompanionContentBlobPack.create(context, blobs);
        String token = FolioleCompanionContentBlobBatchSessions.create(pack, failedHashes);
        JSObject result = new JSObject();
        result.put(batchResponseKey(context, "batchToken"), token);
        result.put(batchResponseKey(context, "packPath"), pack.getAbsolutePath());
        result.put(batchResponseKey(context, "syncedHashes"), blobHashes(blobs));
        result.put(batchResponseKey(context, "failedHashes"), strings(failedHashes));
        result.put(batchResponseKey(context, "httpElapsedMs"), httpElapsedMs);
        result.put(batchResponseKey(context, "parseElapsedMs"), parseElapsedMs);
        result.put(batchResponseKey(context, "totalElapsedMs"), totalElapsedMs);
        return result;
    }

    private static JSArray blobHashes(List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs) {
        JSArray result = new JSArray();
        for (FolioleCompanionContentBlobMultipartBatch.Blob blob : blobs) result.put(blob.hash);
        return result;
    }

    private static JSArray strings(List<String> values) {
        JSArray result = new JSArray();
        for (String value : values) result.put(value);
        return result;
    }

    private static long elapsedMs(long startedAt) {
        return Math.max(0L, (System.nanoTime() - startedAt) / 1_000_000L);
    }

    private static String batchResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobBatchResponseKey(context, key);
    }
}
