package com.foliole.android;

import static org.junit.Assert.assertEquals;

import com.foliole.sync.v22.InventoryEntry;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class FolioleCompanionFramedSyncInventoryTest {
    @Test public void decodesTheSharedActiveDatabaseInventory() throws Exception {
        JSONObject value = new JSONObject().put("entries", new JSONArray().put(new JSONObject()
            .put("object_type", "node").put("global_id", "node-1")
            .put("shared_state_hash", repeat("11", 32))
            .put("frontier_fact_ids", new JSONArray().put("version-1"))
            .put("required_relation_ids", new JSONArray().put("[\"version-1\",\"version-0\",2]"))
            .put("review_fact_ids", new JSONArray().put("review-1"))
            .put("resource_hashes", new JSONArray().put(repeat("22", 32)))));

        List<InventoryEntry> entries = FolioleCompanionFramedSyncInventory.read(value);

        assertEquals(1, entries.size());
        assertEquals("version-1", entries.get(0).getFrontierFactIds(0));
        assertEquals("[\"version-1\",\"version-0\",2]", entries.get(0).getRequiredRelationIds(0));
        assertEquals("review-1", entries.get(0).getReviewFactIds(0));
    }

    private static String repeat(String value, int count) {
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < count; index++) result.append(value);
        return result.toString();
    }
}
