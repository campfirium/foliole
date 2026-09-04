import Capacitor
import UIKit

private enum FolioleCompanionSyncParticipation {
    private static let enabledKey = "foliole.syncGroup.syncEnabled"
    private static let pausedKey = "foliole.syncGroup.syncPaused"

    static func load() -> JSObject {
        let defaults = UserDefaults.standard
        let enabled = defaults.object(forKey: enabledKey) as? Bool ?? true
        let paused = defaults.object(forKey: pausedKey) as? Bool ?? false
        let lifecycleActive = UIApplication.shared.applicationState == .active
        return snapshot(enabled: enabled, paused: paused, lifecycleActive: lifecycleActive)
    }

    static func setEnabled(_ enabled: Bool) -> JSObject {
        UserDefaults.standard.set(enabled, forKey: enabledKey)
        return load()
    }

    static func setPaused(_ paused: Bool) -> JSObject {
        UserDefaults.standard.set(paused, forKey: pausedKey)
        return load()
    }

    private static func snapshot(enabled: Bool, paused: Bool, lifecycleActive: Bool) -> JSObject {
        [
            "lifecycle_active": lifecycleActive,
            "sync_enabled": enabled,
            "sync_paused": paused,
            "participating": lifecycleActive && enabled && !paused
        ]
    }
}

extension FolioleCompanionSyncPlugin {
    @objc func loadSyncParticipationState(_ call: CAPPluginCall) {
        Task { @MainActor in
            call.resolve(FolioleCompanionSyncParticipation.load())
        }
    }

    @objc func setSyncEnabled(_ call: CAPPluginCall) {
        guard let value = call.getBool("sync_enabled") else {
            call.reject("sync_enabled is required")
            return
        }
        Task { @MainActor in
            call.resolve(FolioleCompanionSyncParticipation.setEnabled(value))
        }
    }

    @objc func setSyncPaused(_ call: CAPPluginCall) {
        guard let value = call.getBool("sync_paused") else {
            call.reject("sync_paused is required")
            return
        }
        Task { @MainActor in
            call.resolve(FolioleCompanionSyncParticipation.setPaused(value))
        }
    }
}
