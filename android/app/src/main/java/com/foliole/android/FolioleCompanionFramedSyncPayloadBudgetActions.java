package com.foliole.android;

import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncPayloadBudgetRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.Locale;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class FolioleCompanionFramedSyncPayloadBudgetActions {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile FramedSyncPayloadBudget configured;
    private FolioleCompanionFramedSyncDocumentLifecycle document;

    void configureAsync(PluginCall call) {
        FolioleCompanionSyncAsync.run(executor, call, "Failed to configure Sync payload budget.", () -> configure(call));
    }

    void closeAsync(PluginCall call) {
        FolioleCompanionSyncAsync.run(executor, call, "Failed to close Sync payload budget.", () -> close(call));
    }

    void validateNow(PluginCall call) {
        try { call.resolve(validate(call)); }
        catch (Exception error) { call.reject("Sync payload loan is invalid.", error); }
    }

    void releaseNow(PluginCall call) {
        try {
            FramedSyncPayloadBudgetRegistry.releaseProducer(required(call, "library_key"),
                required(call, "generation_id"), required(call, "loan_id"),
                FramedSyncPayloadBudget.Direction.valueOf(required(call, "direction").toUpperCase(Locale.ROOT)),
                FramedSyncPayloadBudget.Lane.valueOf(required(call, "lane").toUpperCase(Locale.ROOT)),
                call.getInt("capacity_bytes", -1));
            call.resolve();
        } catch (Exception error) { call.reject("Sync payload loan release is invalid.", error); }
    }

    FramedSyncPayloadBudget configuredOwner() { return configured; }

    void attach(com.getcapacitor.Bridge bridge) {
        document = new FolioleCompanionFramedSyncDocumentLifecycle(this, FolioleCompanionSyncGroupDataBridge.current());
        bridge.addWebViewListener(document);
    }

    void webViewDestroyed() { if (document != null) document.destroyed(); }

    void destroy() {
        FramedSyncPayloadBudget owner = configured;
        if (owner != null) owner.cancel();
        executor.shutdown();
    }

    JSObject configure(PluginCall call) throws Exception {
        configured = FramedSyncPayloadBudgetRegistry.configure(required(call, "library_key"), required(call, "generation_id"));
        return new JSObject();
    }

    static JSObject close(PluginCall call) throws Exception {
        FramedSyncPayloadBudgetRegistry.close(required(call, "library_key"), required(call, "generation_id"));
        return new JSObject();
    }

    static JSObject validate(PluginCall call) {
        FramedSyncPayloadBudget.Direction direction = FramedSyncPayloadBudget.Direction.valueOf(
            required(call, "direction").toUpperCase(Locale.ROOT));
        FramedSyncPayloadBudget.Lane lane = FramedSyncPayloadBudget.Lane.valueOf(
            required(call, "lane").toUpperCase(Locale.ROOT));
        if (direction != FramedSyncPayloadBudget.Direction.OUTBOUND || lane != FramedSyncPayloadBudget.Lane.PAYLOAD ||
            call.getInt("capacity_bytes", -1) != FramedSyncPayloadBudget.PAYLOAD_BYTES) {
            throw new IllegalArgumentException("framed_sync_payload_loan_invalid");
        }
        boolean valid = FramedSyncPayloadBudgetRegistry.current().validate(required(call, "library_key"),
            required(call, "generation_id"), required(call, "loan_id"), direction, lane,
            call.getInt("capacity_bytes", -1));
        if (!valid) throw new IllegalArgumentException("framed_sync_payload_loan_invalid");
        return new JSObject().put("valid", true);
    }

    static JSONObject description(FramedSyncPayloadBudget.Loan loan) throws Exception {
        return new JSONObject().put("library_key", loan.libraryKey()).put("generation_id", loan.generationId())
            .put("loan_id", loan.id()).put("direction", loan.direction().name().toLowerCase(Locale.ROOT))
            .put("lane", loan.lane().name().toLowerCase(Locale.ROOT)).put("capacity_bytes", loan.capacityBytes());
    }

    private static String required(PluginCall call, String key) {
        String value = call.getString(key);
        if (value == null || value.isEmpty()) throw new IllegalArgumentException("framed_sync_payload_loan_invalid");
        return value;
    }
}
