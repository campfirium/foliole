package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** A bounded page over one immutable source snapshot; a lost snapshot invalidates the view. */
final class FolioleCompanionSyncPackDependencySource {
    private static final String INITIAL_DIGEST = digest("foliole-sync-pack-dependencies-v1");
    private static final ConcurrentHashMap<String, Session> SESSIONS = new ConcurrentHashMap<>();

    private FolioleCompanionSyncPackDependencySource() {}

    static Session start(String snapshotPath, String peer, String groupId, String sourcePeerId,
            int from, int to, int frontier, String epoch, JSONObject index,
            String versionBits, String parentBits, String reviewBits) throws Exception {
        if (index.getInt("from_state_seq") != from || index.getInt("to_state_seq") != to ||
                index.getInt("frontier_state_seq") != frontier ||
                !epoch.equals(index.getString("source_epoch"))) {
            throw new IllegalArgumentException("sync_pack_fact_index_changed");
        }
        return startInternal(snapshotPath, peer, groupId, sourcePeerId, from, to,
            frontier, epoch, UUID.randomUUID().toString(), index,
            versionBits, parentBits, reviewBits, null);
    }

    static Session startPaged(String snapshotPath, String peer, String groupId,
            String sourcePeerId, FolioleCompanionSyncPackFactPages.Session fact) throws Exception {
        return startInternal(snapshotPath, peer, groupId, sourcePeerId,
            fact.from, fact.to, fact.frontier, fact.epoch, fact.viewId,
            null, null, null, null, fact.claims);
    }

    private static Session startInternal(String snapshotPath, String peer, String groupId,
            String sourcePeerId, int from, int to, int frontier, String epoch,
            String viewId, JSONObject index, String versionBits,
            String parentBits, String reviewBits,
            FolioleCompanionSyncPackFactClaims pagedClaims) throws Exception {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(snapshotPath, null, SQLiteDatabase.OPEN_READONLY);
        try {
            Selection selected = selectedNode(db, from, to);
            List<String> nodeIds = ancestors(db, selected.objectId);
            JSONObject transfer = new JSONObject().put("groupId", groupId).put("peerId", sourcePeerId)
                .put("sourceViewId", viewId).put("sourceEpoch", epoch)
                .put("objectType", selected.objectType).put("objectId", selected.objectId)
                .put("nodeIds", new JSONArray(nodeIds)).put("fromStateSeq", from)
                .put("objectStateSeq", selected.objectType.equals("node_review")
                    ? selected.stateSeq : nodeState(db, selected.objectId))
                .put("frontierStateSeq", frontier);
            Session session = new Session(snapshotPath, peer, from, to, frontier,
                epoch, index, versionBits, parentBits, reviewBits, transfer, nodeIds, pagedClaims);
            session.describe(db);
            SESSIONS.put(peer, session);
            return session;
        } finally { db.close(); }
    }

    static Session open(String peer, String viewId) {
        Session session = SESSIONS.get(peer);
        if (session == null || !session.transfer.optString("sourceViewId").equals(viewId) ||
                !new java.io.File(session.snapshotPath).isFile()) {
            throw new IllegalArgumentException("sync_pack_source_view_unavailable");
        }
        if (session.pagedClaims != null) FolioleCompanionSyncPackFactPages.open(peer, viewId);
        return session;
    }

    static final class Session {
        final String snapshotPath;
        final String peer;
        final int from, to, frontier;
        final String epoch, versionBits, parentBits, reviewBits;
        final JSONObject index, transfer;
        final FolioleCompanionSyncPackFactClaims pagedClaims;
        final List<String> nodeIds;
        final Set<String> heldVersions, heldParents, heldReviews;
        int expectedRows;
        String expectedDigest;

        Session(String snapshotPath, String peer, int from, int to, int frontier, String epoch,
                JSONObject index, String versionBits, String parentBits, String reviewBits,
                JSONObject transfer, List<String> nodeIds,
                FolioleCompanionSyncPackFactClaims pagedClaims) throws Exception {
            this.snapshotPath = snapshotPath; this.peer = peer; this.from = from; this.to = to;
            this.frontier = frontier; this.epoch = epoch; this.index = index;
            this.versionBits = versionBits; this.parentBits = parentBits; this.reviewBits = reviewBits;
            this.transfer = transfer; this.nodeIds = nodeIds; this.pagedClaims = pagedClaims;
            heldVersions = index == null ? new HashSet<>() :
                FolioleCompanionSyncPackDependencyRows.held(index.getJSONArray("versions"), versionBits, "version_id");
            heldParents = index == null ? new HashSet<>() :
                FolioleCompanionSyncPackDependencyRows.held(index.getJSONArray("parents"), parentBits, null);
            heldReviews = index == null ? new HashSet<>() :
                FolioleCompanionSyncPackDependencyRows.held(index.getJSONArray("reviews"), reviewBits, "op_id");
        }

        void describe(SQLiteDatabase db) throws Exception {
            final String[] state = { INITIAL_DIGEST };
            final int[] count = { 0 };
            FolioleCompanionSyncPackDependencyRows.each(db, transfer, nodeIds,
                heldVersions, heldParents, heldReviews, pagedClaims,
                row -> { state[0] = advance(state[0], row); count[0]++; return true; });
            expectedRows = count[0]; expectedDigest = state[0];
            transfer.put("expectedRows", expectedRows).put("expectedDigest", expectedDigest);
            if (expectedRows == 0 && pagedClaims == null) {
                throw new IllegalArgumentException("sync_pack_dependency_object_unavailable");
            }
        }

        JSONObject page(int afterRow, String beforeDigest) throws Exception {
            if (afterRow < 0 || afterRow > expectedRows) {
                throw new IllegalArgumentException("sync_pack_dependency_page_not_contiguous");
            }
            SQLiteDatabase db = SQLiteDatabase.openDatabase(snapshotPath, null, SQLiteDatabase.OPEN_READONLY);
            try {
                final int[] count = { 0 };
                final int[] bytes = { 0 };
                final String[] digest = { INITIAL_DIGEST };
                JSONArray rows = new JSONArray();
                FolioleCompanionSyncPackDependencyRows.each(db, transfer, nodeIds,
                    heldVersions, heldParents, heldReviews, pagedClaims, row -> {
                    if (count[0] < afterRow) {
                        digest[0] = advance(digest[0], row); count[0]++;
                        return true;
                    }
                    if (count[0] == afterRow && !digest[0].equals(beforeDigest)) {
                        throw new IllegalArgumentException("sync_pack_dependency_prefix_changed");
                    }
                    int size = row.getString("json").getBytes(StandardCharsets.UTF_8).length;
                    if (size > 2 * 1024 * 1024) {
                        throw new IllegalArgumentException("sync_pack_dependency_row_exceeds_budget");
                    }
                    if (rows.length() >= 128 || bytes[0] + size > 2 * 1024 * 1024) return false;
                    rows.put(row); bytes[0] += size;
                    digest[0] = advance(digest[0], row); count[0]++;
                    return true;
                });
                if (!digest[0].equals(beforeDigest) && rows.length() == 0 && afterRow == expectedRows) {
                    throw new IllegalArgumentException("sync_pack_dependency_prefix_changed");
                }
                if (afterRow == expectedRows) return null;
                if (rows.length() == 0) throw new IllegalArgumentException("sync_pack_dependency_page_not_contiguous");
                return new JSONObject().put("transfer", transfer).put("afterRow", afterRow)
                    .put("beforeDigest", beforeDigest).put("afterDigest", digest[0]).put("rows", rows);
            } finally { db.close(); }
        }

        void assertFinal(int afterRow, String digest) {
            if (afterRow != expectedRows || !expectedDigest.equals(digest)) {
                throw new IllegalArgumentException("sync_pack_dependency_prefix_changed");
            }
        }

        String initialDigest() { return INITIAL_DIGEST; }

    }

    private static Selection selectedNode(SQLiteDatabase db, int from, int to) {
        try (Cursor row = db.rawQuery("SELECT coalesce(a.node_id,s.object_id),s.object_type,s.state_seq " +
                "FROM sync_object_state s LEFT JOIN node_text_alternatives a " +
                "ON s.object_type = 'node_text_alternative' AND a.alternative_id = s.object_id " +
                "WHERE s.state_seq > ? AND s.state_seq <= ? AND s.object_type IN " +
                "('node','node_open_state','node_reading','node_review'," +
                "'parent_child_order','node_text_alternative') ORDER BY s.state_seq LIMIT 1",
                new String[] { String.valueOf(from), String.valueOf(to) })) {
            if (!row.moveToFirst()) throw new IllegalArgumentException("sync_pack_dependency_object_unavailable");
            return new Selection(row.getString(0),
                "node_review".equals(row.getString(1)) ? "node_review" : "node", row.getInt(2));
        }
    }

    private static final class Selection {
        final String objectId, objectType;
        final int stateSeq;
        Selection(String objectId, String objectType, int stateSeq) {
            this.objectId = objectId; this.objectType = objectType; this.stateSeq = stateSeq;
        }
    }

    private static int nodeState(SQLiteDatabase db, String id) {
        try (Cursor row = db.rawQuery("SELECT state_seq FROM sync_object_state " +
                "WHERE object_type = 'node' AND object_id = ?", new String[] { id })) {
            if (!row.moveToFirst()) throw new IllegalArgumentException("sync_pack_dependency_object_unavailable");
            return row.getInt(0);
        }
    }

    private static List<String> ancestors(SQLiteDatabase db, String id) {
        List<String> result = new ArrayList<>();
        try (Cursor rows = db.rawQuery("WITH RECURSIVE ancestors(id,parent_id) AS (" +
                "SELECT id,parent_id FROM nodes WHERE id = ? UNION SELECT p.id,p.parent_id FROM nodes p " +
                "JOIN ancestors child ON child.parent_id = p.id) SELECT id FROM ancestors LIMIT 129",
                new String[] { id })) {
            while (rows.moveToNext()) result.add(rows.getString(0));
        }
        if (result.isEmpty() || result.size() > 128) {
            throw new IllegalArgumentException("sync_pack_dependency_ancestry_over_budget");
        }
        return result;
    }

    private static String advance(String previous, JSONObject row) throws Exception {
        JSONObject key = row.getJSONObject("key");
        return digest(new JSONArray().put(previous).put(row.getString("table"))
            .put(key.getString("key")).put(key.getInt("ordinal"))
            .put(row.getString("json")).toString().replace("\\/", "/"));
    }

    private static String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte part : bytes) out.append(String.format("%02x", part & 0xff));
            return out.toString();
        } catch (Exception error) { throw new IllegalStateException(error); }
    }

}
