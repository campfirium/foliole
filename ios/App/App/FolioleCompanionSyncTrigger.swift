import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func beginSyncRun(_ call: CAPPluginCall) {
        guard let reason = call.getString("reason"), ["initial", "automatic", "manual"].contains(reason),
              let runID = call.getString("run_id"), !runID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("Sync command is unavailable.")
            return
        }
        call.resolve(["reason": reason, "run_id": runID, "runtime": "ios"])
    }
}
