package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

abstract class FolioleCompanionDatabasePlugin extends Plugin {
    private static final int DATABASE_EXECUTOR_THREADS = 4;

    private final ExecutorService databaseExecutor = Executors.newFixedThreadPool(DATABASE_EXECUTOR_THREADS);
    private final Object databaseHelperLock = new Object();
    private FolioleCompanionDatabaseHelper databaseHelper;

    protected interface DatabaseWork {
        JSObject run(FolioleCompanionDatabaseHelper databaseHelper) throws Exception;
    }

    protected void resolveWithDatabase(PluginCall call, String errorMessage, DatabaseWork work) {
        databaseExecutor.execute(() -> {
            try {
                call.resolve(work.run(getDatabaseHelper()));
            } catch (Exception exception) {
                call.reject(formatPluginError(errorMessage, exception), exception);
            }
        });
    }

    private FolioleCompanionDatabaseHelper getDatabaseHelper() {
        synchronized (databaseHelperLock) {
            if (databaseHelper == null) {
                databaseHelper = new FolioleCompanionDatabaseHelper(getContext().getApplicationContext());
            }
            return databaseHelper;
        }
    }

    protected void closeDatabaseHelperConnection() {
        synchronized (databaseHelperLock) {
            if (databaseHelper != null) {
                databaseHelper.close();
                databaseHelper = null;
            }
        }
    }

    private static String formatPluginError(String errorMessage, Exception exception) {
        String detail = exception.getMessage();
        if (detail == null || detail.trim().isEmpty()) {
            return errorMessage;
        }
        return errorMessage + " " + detail.trim();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        databaseExecutor.shutdown();
        try {
            if (!databaseExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                databaseExecutor.shutdownNow();
            }
        } catch (InterruptedException exception) {
            databaseExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
        closeDatabaseHelperConnection();
    }
}
