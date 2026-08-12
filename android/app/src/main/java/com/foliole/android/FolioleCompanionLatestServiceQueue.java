package com.foliole.android;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;

final class FolioleCompanionLatestServiceQueue<T> {
    private static final String REVISION_SEPARATOR = "-";
    private final Map<String, T> latestByService = new HashMap<>();
    private final Deque<String> serviceOrder = new ArrayDeque<>();

    void offer(String instanceName, T service) {
        String key = stableServiceKey(instanceName);
        if (!latestByService.containsKey(key)) serviceOrder.addLast(key);
        latestByService.put(key, service);
    }

    T poll() {
        String key = serviceOrder.pollFirst();
        return key == null ? null : latestByService.remove(key);
    }

    void clear() {
        latestByService.clear();
        serviceOrder.clear();
    }

    static String stableServiceKey(String instanceName) {
        int separator = instanceName.lastIndexOf(REVISION_SEPARATOR);
        String revision = separator > 0 ? instanceName.substring(separator + 1) : "";
        return separator > 0 && revision.matches("[0-9a-z]{1,7}")
            ? instanceName.substring(0, separator) : instanceName;
    }
}
