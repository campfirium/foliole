import Capacitor
import OSLog
import UserNotifications

final class FolioleReminderNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = FolioleReminderNotificationDelegate()

    private let logger = Logger(subsystem: "com.campfirium.foliole", category: "Reminder")
    private let store = UserDefaults.standard
    private var router: NotificationRouter?
    private var deferredResponses: [UNNotificationResponse] = []
    private var tail: Task<Void, Never>?
    private lazy var contract = try? FolioleCompanionContractStore().reminderBackgroundActionContract()

    func attach(_ bridge: CAPBridgeProtocol) {
        router = bridge.notificationRouter
        let center = UNUserNotificationCenter.current()
        for response in deferredResponses {
            router?.userNotificationCenter(center, didReceive: response, withCompletionHandler: {})
        }
        deferredResponses.removeAll()
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completion: @escaping (UNNotificationPresentationOptions) -> Void) {
        DispatchQueue.main.async {
            guard let router = self.router else { completion([.banner, .list, .sound, .badge]); return }
            router.userNotificationCenter(center, willPresent: notification, withCompletionHandler: completion)
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completion: @escaping () -> Void) {
        let actionAt = Date()
        DispatchQueue.main.async {
            let request = response.notification.request
            if let contract = self.contract, request.content.categoryIdentifier == contract.category,
               let minutes = contract.minutes[response.actionIdentifier] {
                let previous = self.tail
                self.tail = Task { @MainActor in
                    await previous?.value
                    defer { completion() }
                    do {
                        try await self.snooze(request, in: center, actionAt: actionAt, minutes: minutes, contract: contract)
                    } catch {
                        self.logger.error("Background reminder snooze failed.")
                    }
                }
            } else if let router = self.router {
                router.userNotificationCenter(center, didReceive: response, withCompletionHandler: completion)
            } else {
                self.deferredResponses.append(response)
                completion()
            }
        }
    }

    private func snooze(_ request: UNNotificationRequest, in center: UNUserNotificationCenter,
                        actionAt: Date, minutes: Int, contract: FolioleReminderBackgroundActionContract) async throws {
        guard var extra = request.content.userInfo["cap_extra"] as? [String: Any],
              extra["owner"] as? String == contract.owner,
              let ruleID = extra["ruleId"] as? String, let revision = extra["revision"] as? String,
              UUID(uuidString: ruleID) != nil, UUID(uuidString: revision) != nil,
              let occurrence = extra["occurrenceAt"] as? NSNumber,
              occurrence.doubleValue > 0, occurrence.doubleValue <= actionAt.timeIntervalSince1970 * 1000 else { return }
        let receiptKey = "foliole-reminder-snooze." + ruleID
        let receipt = store.dictionary(forKey: receiptKey)
        if receipt?["revision"] as? String == revision,
           let consumed = receipt?["occurrenceAt"] as? NSNumber,
           consumed.doubleValue >= occurrence.doubleValue { return }

        let pending = await center.pendingNotificationRequests()
        let delivered = await center.deliveredNotifications()
        let requests = pending + delivered.map(\.request)
        if requests.contains(where: {
            let scheduled = $0.content.userInfo["cap_extra"] as? [String: Any]
            return scheduled?["ruleId"] as? String == ruleID && scheduled?["revision"] as? String == revision
                && scheduled?["snoozedFrom"] as? NSNumber == occurrence
        }) { return }
        let occupied = Set(requests.map(\.identifier))
        var id = 700_000_000
        while occupied.contains(String(id)) { id += 1 }
        let identifier = String(id)
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else { return }
        let at = actionAt.addingTimeInterval(TimeInterval(minutes * 60))
        extra["occurrenceAt"] = Int64(at.timeIntervalSince1970 * 1000)
        extra["snoozedFrom"] = occurrence
        content.userInfo["cap_extra"] = extra
        content.userInfo["cap_schedule"] = ["at": ISO8601DateFormatter().string(from: at), "repeats": false]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, at.timeIntervalSinceNow), repeats: false)
        try await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
        store.set(["revision": revision, "occurrenceAt": occurrence], forKey: receiptKey)
        center.removeDeliveredNotifications(withIdentifiers: [request.identifier])
    }
}

struct FolioleReminderBackgroundActionContract {
    let category: String
    let owner: String
    let minutes: [String: Int]
}
