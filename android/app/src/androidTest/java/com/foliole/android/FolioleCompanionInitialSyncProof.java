package com.foliole.android;

import android.app.Instrumentation;
import android.database.sqlite.SQLiteReadOnlyDatabaseException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.concurrent.TimeUnit;

final class FolioleCompanionInitialSyncProof {
    private FolioleCompanionInitialSyncProof() {}

    static JSONObject waitForTerminal(
        Instrumentation instrumentation, String expectedGroupId, long joinStartedAtMillis,
        String resourceNodeId, String availableHash, String recoveringHash
    ) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(2);
        JSONObject latest = new JSONObject();
        int reads = 0;
        int readConflicts = 0;
        long longestReadMillis = 0;
        while (System.nanoTime() < deadline) {
            long readStartedAt = System.nanoTime();
            try {
                reads += 1;
                latest = FolioleAcceptanceSyncEventProjection.read(
                    instrumentation.getTargetContext()
                );
                if (!expectedGroupId.equals(latest.optString("group_id"))) {
                    throw new IllegalStateException("Initial Sync group identity changed: " + latest);
                }
                String runId = startedRunId(latest.getJSONArray("source_runs"), joinStartedAtMillis);
                JSONArray events = latest.getJSONArray("events");
                for (int index = 0; index < events.length(); index += 1) {
                    JSONObject event = events.getJSONObject(index);
                    if (!runId.equals(event.optString("run_id"))) continue;
                    boolean completed = "completed".equals(event.optString("status"))
                        && "completed".equals(event.optString("result"));
                    boolean partial = "skipped".equals(event.optString("status"))
                        && "partial".equals(event.optString("result"));
                    if (completed || partial) {
                        if (!resourceNodeId.isEmpty()) {
                            event.put("resourceProof", FolioleCompanionInitialResourceProof.read(
                                instrumentation.getTargetContext(), latest, expectedGroupId,
                                resourceNodeId, availableHash, recoveringHash, partial
                            ));
                        } else if (partial) {
                            throw new IllegalStateException("Unattributed initial partial: " + event);
                        }
                        return event;
                    }
                    throw new IllegalStateException("Initial Sync did not reach an expected terminal: "
                        + event);
                }
            } catch (SQLiteReadOnlyDatabaseException readConflict) {
                readConflicts += 1;
            } finally {
                longestReadMillis = Math.max(longestReadMillis,
                    TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - readStartedAt));
            }
            Thread.sleep(30_000);
        }
        throw new IllegalStateException("Timed out waiting for initial Sync terminal: reads="
            + reads + " readConflicts=" + readConflicts + " longestReadMillis="
            + longestReadMillis + " projection=" + latest);
    }

    private static String startedRunId(JSONArray sourceRuns, long joinStartedAtMillis)
        throws Exception {
        String runId = "";
        for (int index = 0; index < sourceRuns.length(); index += 1) {
            JSONObject event = sourceRuns.getJSONObject(index);
            if (!"run_started".equals(event.optString("kind"))
                || !"initial".equals(event.optString("trigger_reason"))) continue;
            String startedAt = event.optString("started_at");
            if (startedAt.isEmpty()) throw new IllegalStateException("Initial start time missing");
            if (Instant.parse(startedAt).toEpochMilli() < joinStartedAtMillis) continue;
            if (!runId.isEmpty() && !runId.equals(event.optString("run_id"))) {
                throw new IllegalStateException("Ambiguous initial Sync runs after join: " + sourceRuns);
            }
            runId = event.getString("run_id");
        }
        return runId;
    }
}
