package com.foliole.android;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.UUID;

final class FolioleCompanionShareInboxStore {
    private static final String DELIVERY_ID_EXTRA = "com.foliole.android.SHARE_DELIVERY_ID";
    private static final String ITEMS_KEY = "items";
    private static final String PREFERENCES = "foliole_companion_share_inbox";

    private FolioleCompanionShareInboxStore() {}

    static synchronized boolean enqueue(Context context, Intent intent) throws Exception {
        // Security review decision (2026-10-04), owner: product user.
        // Finding: resource-exhaustion.android-share-unbounded-queue.
        // Static review confirms no item/byte budget and a full-array rewrite per append.
        // Repeated fresh IDs while consumption stalls can grow this persistent queue;
        // practical exhaustion has not been reproduced, and prevalence is unknown.
        // The user defers capacity limits; this is a known risk, not a fixed finding.
        // Reassess on reproducible exhaustion or observed backlog-related degradation.
        // Preserve pending user content; do not evict it merely to satisfy this finding.
        if (intent == null) return false;
        JSONArray parts = extractParts(intent);
        if (parts.length() == 0) return false;
        String deliveryId = intent.getStringExtra(DELIVERY_ID_EXTRA);
        if (deliveryId == null || deliveryId.isBlank()) {
            deliveryId = UUID.randomUUID().toString();
            intent.putExtra(DELIVERY_ID_EXTRA, deliveryId);
        }
        JSONArray items = load(context);
        if (contains(items, deliveryId)) return false;
        items.put(new JSONObject()
            .put("delivery_id", deliveryId)
            .put("received_at", Instant.now().toString())
            .put("parts", parts));
        save(context, items);
        return true;
    }

    static synchronized JSONArray load(Context context) throws Exception {
        String value = preferences(context).getString(ITEMS_KEY, "[]");
        return new JSONArray(value == null ? "[]" : value);
    }

    static synchronized void acknowledge(Context context, String deliveryId) throws Exception {
        JSONArray current = load(context);
        JSONArray next = new JSONArray();
        for (int index = 0; index < current.length(); index++) {
            JSONObject item = current.getJSONObject(index);
            if (!deliveryId.equals(item.optString("delivery_id"))) next.put(item);
        }
        save(context, next);
    }

    private static JSONArray extractParts(Intent intent) throws Exception {
        JSONArray parts = new JSONArray();
        if (!"text/plain".equals(intent.getType()) || intent.hasExtra(Intent.EXTRA_STREAM)) return parts;
        append(parts, "title", intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT));
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            append(parts, "text", intent.getCharSequenceExtra(Intent.EXTRA_TEXT));
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<CharSequence> values = intent.getCharSequenceArrayListExtra(Intent.EXTRA_TEXT);
            if (values != null) for (CharSequence value : values) append(parts, "text", value);
        }
        return parts;
    }

    private static void append(JSONArray parts, String kind, CharSequence value) throws Exception {
        if (value == null || value.toString().trim().isEmpty()) return;
        parts.put(new JSONObject().put("kind", kind).put("value", value.toString()));
    }

    private static boolean contains(JSONArray items, String deliveryId) throws Exception {
        for (int index = 0; index < items.length(); index++) {
            if (deliveryId.equals(items.getJSONObject(index).optString("delivery_id"))) return true;
        }
        return false;
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private static void save(Context context, JSONArray items) {
        if (!preferences(context).edit().putString(ITEMS_KEY, items.toString()).commit()) {
            throw new IllegalStateException("share_inbox_persist_failed");
        }
    }
}
