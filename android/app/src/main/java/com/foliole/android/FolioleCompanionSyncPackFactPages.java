package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Small fact pages bound to the native provider's immutable snapshot. */
final class FolioleCompanionSyncPackFactPages {
    private static final Map<String, Session> SESSIONS = new ConcurrentHashMap<>();
    private static final String[] KINDS = { "versions", "parents", "reviews" };
    private static final String[] REVIEW_COLUMNS = { "id", "op_id", "host_name", "node_id", "grade",
        "scheduler_version", "reviewed_at", "due_before", "stability_before", "difficulty_before",
        "due_after", "stability_after", "difficulty_after" };

    private FolioleCompanionSyncPackFactPages() {}

    static Session start(Context context, String snapshotPath, String peer, int from,
            Integer requestedFrontier, String requestedEpoch) throws Exception {
        SQLiteDatabase source = SQLiteDatabase.openDatabase(snapshotPath, null, SQLiteDatabase.OPEN_READONLY);
        int frontier, to;
        String epoch;
        try {
            try (Cursor row = source.rawQuery("SELECT high_water, source_epoch FROM " +
                    "sync_state_sequence WHERE singleton_id = 1", null)) {
                if (!row.moveToFirst()) throw new IllegalArgumentException("sync_pack_source_epoch_missing");
                frontier = requestedFrontier == null ? row.getInt(0) : requestedFrontier;
                epoch = row.getString(1);
                if (frontier < from || frontier > row.getInt(0) || from < 0 ||
                        requestedEpoch != null && !requestedEpoch.equals(epoch)) {
                    throw new IllegalArgumentException("sync_pack_source_view_changed");
                }
            }
            try (Cursor row = source.rawQuery("SELECT state_seq FROM sync_object_state WHERE " +
                    "state_seq > ? AND state_seq <= ? ORDER BY state_seq LIMIT 1",
                    new String[] { String.valueOf(from), String.valueOf(frontier) })) {
                to = row.moveToFirst() ? row.getInt(0) : frontier;
            }
        } finally { source.close(); }
        Session previous = SESSIONS.remove(peer);
        if (previous != null) previous.claims.close();
        FolioleCompanionSyncPackFactClaims claims = FolioleCompanionSyncPackFactClaims.create(context, peer);
        try {
            Session session = new Session(context, snapshotPath, peer, UUID.randomUUID().toString(),
                from, to, frontier, epoch, claims);
            session.current = session.page(null);
            SESSIONS.put(peer, session);
            return session;
        } catch (Exception error) {
            claims.close();
            throw error;
        }
    }

    static Session open(String peer, String viewId) {
        Session session = SESSIONS.get(peer);
        if (session == null || !session.viewId.equals(viewId) ||
                !new File(session.snapshotPath).isFile()) {
            throw new IllegalArgumentException("sync_pack_source_view_unavailable");
        }
        return session;
    }

    static final class Session {
        final Context context;
        final String snapshotPath, peer, viewId, epoch;
        final FolioleCompanionSyncPackFactClaims claims;
        final int from, to, frontier;
        Page current;
        String lastIndexId, lastBits;
        boolean ready;

        Session(Context context, String snapshotPath, String peer, String viewId,
                int from, int to, int frontier, String epoch,
                FolioleCompanionSyncPackFactClaims claims) {
            this.context = context; this.snapshotPath = snapshotPath; this.peer = peer;
            this.viewId = viewId; this.from = from; this.to = to;
            this.frontier = frontier; this.epoch = epoch; this.claims = claims;
        }

        synchronized JSONObject read(String previousId, String versions, String parents,
                String reviews) throws Exception {
            if (previousId != null) {
                String bits = new JSONArray().put(versions).put(parents).put(reviews).toString();
                if (previousId.equals(lastIndexId) && bits.equals(lastBits)) {
                    // A response can be lost after the claims were accepted.
                } else if (!ready && previousId.equals(current.index.getString("index_id"))) {
                    claims.accept(current.index, versions, parents, reviews);
                    lastIndexId = previousId; lastBits = bits;
                    if (current.complete) ready = true;
                    else current = page(current.next);
                } else throw new IllegalArgumentException("sync_pack_fact_page_not_contiguous");
            } else if (versions != null || parents != null || reviews != null) {
                throw new IllegalArgumentException("sync_pack_fact_page_not_contiguous");
            }
            if (ready) return new JSONObject().put("source_view_id", viewId)
                .put("complete", true).put("ready", true).put("from_state_seq", from)
                .put("to_state_seq", to).put("frontier_state_seq", frontier)
                .put("source_epoch", epoch);
            return current.response(viewId);
        }

        private Page page(Position after) throws Exception {
            File file = File.createTempFile("foliole-fact-page-", ".db", context.getCacheDir());
            SQLiteDatabase pack = SQLiteDatabase.openOrCreateDatabase(file, null);
            try {
                FolioleCompanionSyncPackProvider.createPack(pack,
                    FolioleCompanionSyncPackProviderDefinitions.load(context), snapshotPath, from, to);
                JSONArray[] facts = { new JSONArray(), new JSONArray(), new JSONArray() };
                int bytes = 0, count = 0;
                Position next = after;
                boolean complete = true;
                for (int kind = after == null ? 0 : after.kind; kind < KINDS.length; kind++) {
                    try (Cursor cursor = pack.rawQuery(query(kind, after != null && after.kind == kind ? after : null),
                            after != null && after.kind == kind ? after.params() : null)) {
                        while (cursor.moveToNext()) {
                            JSONObject fact = fact(kind, cursor);
                            int size = fact.toString().getBytes(StandardCharsets.UTF_8).length;
                            if (size > 256 * 1024 || count == 0 && bytes + size > 256 * 1024) {
                                throw new IllegalArgumentException("sync_pack_fact_row_exceeds_budget");
                            }
                            if (count >= 128 || bytes + size > 256 * 1024) {
                                complete = false; break;
                            }
                            facts[kind].put(fact); bytes += size; count++;
                            next = new Position(kind, kind == 0 ? fact.getString("version_id")
                                : kind == 1 ? fact.getString("version_id") : fact.getString("op_id"),
                                kind == 1 ? fact.getInt("ordinal") : -1);
                        }
                    }
                    if (!complete) break;
                }
                JSONObject index = new JSONObject().put("from_state_seq", from)
                    .put("to_state_seq", to).put("frontier_state_seq", frontier)
                    .put("source_epoch", epoch).put("versions", facts[0])
                    .put("parents", facts[1]).put("reviews", facts[2]);
                index.put("index_id", sha(index.toString().replace("\\/", "/")));
                return new Page(index, next, complete);
            } finally {
                pack.close();
                if (!file.delete()) file.deleteOnExit();
            }
        }
    }

    private static String query(int kind, Position after) {
        String where = after == null ? "" : kind == 1
            ? " WHERE version_id > ? OR (version_id = ? AND ordinal > ?)"
            : " WHERE " + (kind == 0 ? "version_id" : "op_id") + " > ?";
        if (kind == 0) return "SELECT version_id, object_id, parent_version_id, host_name, " +
            "created_at, content_hash, body_text, snapshot_json FROM node_sync_versions" + where +
            " ORDER BY version_id";
        if (kind == 1) return "SELECT version_id, parent_version_id, ordinal " +
            "FROM node_sync_version_parents" + where + " ORDER BY version_id, ordinal";
        return "SELECT " + String.join(",", REVIEW_COLUMNS) + " FROM review_log" + where +
            " ORDER BY op_id";
    }

    static JSONObject fact(int kind, Cursor row) throws Exception {
        if (kind == 0) {
            JSONObject snapshot = new JSONObject(row.getString(7));
            String body = row.isNull(6) ? (snapshot.has("content")
                ? (snapshot.isNull("content") ? null : snapshot.getString("content")) : "") : row.getString(6);
            snapshot.remove("content");
            return new JSONObject().put("version_id", row.getString(0))
                .put("object_id", row.getString(1))
                .put("parent_version_id", row.isNull(2) ? JSONObject.NULL : row.getString(2))
                .put("host_name", row.getString(3)).put("created_at", row.getString(4))
                .put("content_hash", row.getString(5))
                .put("body_hash", body == null ? JSONObject.NULL : sha(body))
                .put("snapshot_metadata", snapshot.toString().replace("\\/", "/"));
        }
        if (kind == 1) return new JSONObject().put("version_id", row.getString(0))
            .put("parent_version_id", row.getString(1)).put("ordinal", row.getInt(2));
        JSONObject fact = new JSONObject();
        for (int i = 0; i < REVIEW_COLUMNS.length; i++) {
            Object value = row.isNull(i) ? JSONObject.NULL : i == 4 ? row.getInt(i) :
                i == 8 || i == 9 || i == 11 || i == 12 ? row.getDouble(i) : row.getString(i);
            fact.put(REVIEW_COLUMNS[i], value);
        }
        return fact;
    }

    private static String sha(String value) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256")
            .digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder();
        for (byte part : bytes) out.append(String.format("%02x", part & 0xff));
        return out.toString();
    }

    private static final class Position {
        final int kind, ordinal;
        final String key;
        Position(int kind, String key, int ordinal) {
            this.kind = kind; this.key = key; this.ordinal = ordinal;
        }
        String[] params() { return kind == 1
            ? new String[] { key, key, String.valueOf(ordinal) } : new String[] { key }; }
        JSONObject json() throws Exception { return new JSONObject().put("kind", KINDS[kind])
            .put("key", key).put("ordinal", ordinal); }
    }

    private static final class Page {
        final JSONObject index;
        final Position next;
        final boolean complete;
        Page(JSONObject index, Position next, boolean complete) {
            this.index = index; this.next = next; this.complete = complete;
        }
        JSONObject response(String viewId) throws Exception {
            return new JSONObject().put("source_view_id", viewId).put("index", index)
                .put("next", next == null ? JSONObject.NULL : next.json())
                .put("complete", complete);
        }
    }
}
