package com.foliole.android;

import org.json.JSONObject;
import org.json.JSONArray;

import java.util.Map;

/** Host preflight for v21; shared DbPort apply verifies the full page and row facts. */
final class FolioleCompanionIdentityPackValidator {
    private FolioleCompanionIdentityPackValidator() {}

    static Map<String, Integer> validateManifest(
        JSONObject manifest, FolioleCompanionSyncPackContract contract,
        String expectedPeerId, String expectedSourcePeerId
    ) throws Exception {
        if (!contract.format().equals(manifest.getString("format")) ||
            manifest.getInt("format_version") != 21 ||
            !contract.compression().equals(manifest.getString("compression")) ||
            !contract.databaseEntry().equals(manifest.getString("database_file"))) {
            throw invalid("unsupported_sync_identity_pack_format");
        }
        int schema = manifest.getInt("schema_version");
        if (schema < contract.minimumSchemaVersion() || schema > contract.maximumSchemaVersion()) {
            throw invalid("unsupported_sync_pack_schema_version");
        }
        if (!expectedPeerId.equals(manifest.getString("to_peer_id")) ||
            !expectedSourcePeerId.equals(manifest.getString("from_peer_id"))) {
            throw invalid("sync_identity_pack_peer_mismatch");
        }
        if (!"global-id-v1".equals(manifest.getString("contract")) ||
            !"global-id-v1".equals(manifest.getJSONObject("identity_page").getString("contract"))) {
            throw invalid("sync_identity_pack_contract_unsupported");
        }
        JSONObject page = manifest.getJSONObject("identity_page");
        if (!expectedPeerId.equals(page.getString("target_peer_id")) ||
            !expectedSourcePeerId.equals(page.getString("source_peer_id")) ||
            page.getString("page_id").isEmpty() || manifest.getString("pack_id").isEmpty() ||
            hasSequenceFields(manifest)) {
            throw invalid("sync_identity_pack_manifest_invalid");
        }
        FolioleCompanionIdentityPageContract.validate(page, manifest);
        return FolioleCompanionSyncPackEnvelopeValidator.validateTableManifest(
            manifest.getJSONArray("tables"), contract.manifestTableNames());
    }

    static void assertInnerMatches(JSONObject inner, JSONObject outer) throws Exception {
        FolioleCompanionIdentityPageContract.validate(inner.getJSONObject("identity_page"), inner);
        FolioleCompanionIdentityPageContract.validate(outer.getJSONObject("identity_page"), outer);
        if (!"global-id-v1".equals(inner.getString("contract")) || hasSequenceFields(inner) ||
            !FolioleCompanionIdentityPageContract.same(inner.getJSONObject("identity_page"), outer.getJSONObject("identity_page")) ||
            inner.has("fact_chunk") != outer.has("fact_chunk") ||
            inner.has("fact_chunk") && !FolioleCompanionIdentityPageContract.same(inner.getJSONObject("fact_chunk"), outer.getJSONObject("fact_chunk")) ||
            inner.has("fact_tail") != outer.has("fact_tail") ||
            inner.has("fact_tail") && !FolioleCompanionIdentityPageContract.same(inner.getJSONObject("fact_tail"), outer.getJSONObject("fact_tail")) ||
            !outer.getString("pack_id").equals(inner.getString("pack_id")) ||
            !outer.getJSONObject("identity_page").getString("page_id").equals(
                inner.getJSONObject("identity_page").getString("page_id")) ||
            !sameDependencies(inner.optJSONArray("dependencies"), outer.optJSONArray("dependencies")) ||
            !FolioleCompanionSyncPackDatabaseValidator.tableCounts(
                outer.getJSONArray("tables")).equals(
                FolioleCompanionSyncPackDatabaseValidator.tableCounts(inner.getJSONArray("tables")))) {
            throw invalid("sync_identity_pack_inner_manifest_mismatch");
        }
    }

    private static boolean sameDependencies(JSONArray left, JSONArray right) throws Exception {
        if (left == null || right == null) return left == null && right == null;
        if (left.length() != right.length()) return false;
        for (int index = 0; index < left.length(); index++) {
            JSONObject item = left.getJSONObject(index);
            JSONObject expected = right.getJSONObject(index);
            for (String key : new String[] { "object_type", "object_id", "fingerprint" }) {
                if (!item.getString(key).equals(expected.getString(key))) return false;
            }
        }
        return true;
    }

    private static boolean hasSequenceFields(JSONObject manifest) {
        return manifest.has("from_state_seq") || manifest.has("to_state_seq") ||
            manifest.has("frontier_state_seq");
    }

    private static IllegalArgumentException invalid(String code) {
        return new IllegalArgumentException(code);
    }
}
