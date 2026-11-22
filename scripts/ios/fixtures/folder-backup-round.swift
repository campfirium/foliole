import Foundation

func check(_ value: Bool, _ message: String, line: Int = #line) {
    if !value { FileHandle.standardError.write("line \(line): \(message)\n".data(using: .utf8)!); exit(1) }
}

func rejected(_ action: () throws -> Void) -> String? {
    do { try action(); return nil } catch { return error.localizedDescription }
}

@main
struct FolderBackupRoundFixture {
    static var saved: [String] = []

    static func round(_ phase: String? = "saved") -> FolioleFolderBackupRound {
        saved = []
        return FolioleFolderBackupRound(resumed: phase) { saved.append("\($0):\($1 ?? "nil")") }
    }

    static func ended(_ round: FolioleFolderBackupRound, _ phase: String, _ error: String?, line: Int = #line) {
        check(round.request == nil && !round.running, "round still open", line: line)
        check(round.phase == phase, "phase \(round.phase), expected \(phase)", line: line)
        check(round.errorMessage == error, "error \(round.errorMessage ?? "nil"), expected \(error ?? "nil")", line: line)
        check(saved.last == "\(phase):\(error ?? "nil")", "persisted \(saved.last ?? "nothing")", line: line)
    }

    static func committed(_ epoch: String, _ request: String) throws -> FolioleFolderBackupRound {
        let value = round()
        _ = try value.open(epoch, reclaim: true)
        try value.begin(epoch, request: request)
        value.started()
        check(value.databaseEnded(request, committed: true, cleanupPending: false), "committed round closed before attachments")
        check(saved.last == "working:nil", "durable phase left working before attachments ended")
        return value
    }

    static func main() throws {
        // A page reloads while the previous page's round waits on attachments: the new page reclaims it at once.
        var value = try committed("page-1", "r1")
        check(try value.open("page-2", reclaim: true), "reload waited without a running operation")
        ended(value, "pending", FolioleFolderBackupRound.reloaded)
        try value.begin("page-2", request: "r2")
        check(value.owns("r2"), "Back up now after a reload did not start")

        // A reload during the picker or database operation waits for it, then reports the reload instead of its result.
        for exit in ["committed", "cancelled", "picker"] {
            value = round()
            _ = try value.open("page-1", reclaim: true)
            try value.begin("page-1", request: "r1")
            if exit != "picker" { value.started() }
            check(try !value.open("page-2", reclaim: true), "reload did not wait for \(exit)")
            check(rejected { try value.begin("page-2", request: "r9") } == "A backup is already running.", "running round accepted a request")
            switch exit {
            case "committed": check(!value.databaseEnded("r1", committed: true, cleanupPending: false), "reclaimed round stayed open")
            case "cancelled": value.databaseFailed("r1", message: "Backup cancelled.")
            default: value.pickerCancelled("r1")
            }
            ended(value, "pending", FolioleFolderBackupRound.reloaded)
            check(try value.open("page-2", reclaim: true), "waiting owner was not registered after \(exit)")
            try value.begin("page-2", request: "r2")
        }

        // A reload with nothing left over keeps the last result.
        value = round()
        _ = try value.open("page-1", reclaim: true)
        check(try value.open("page-2", reclaim: true), "idle reload waited")
        check(value.phase == "saved" && saved.isEmpty, "idle reload changed the result")

        // Within one page a second owner is still refused and a foreign request never ends the open round.
        value = try committed("page-1", "r1")
        check(rejected { _ = try value.open("other", reclaim: false) } == "Previous database owner is still open.", "second owner")
        check(!value.cancel("r2", failure: "other failure"), "foreign cancel released the round")
        check(value.owns("r1"), "foreign cancel ended the round")

        // Every caller exit lands in a final, persisted phase with its real error.
        value = try committed("page-1", "r1"); check(value.cancel("r1", failure: "confirm write refused"), "cancel")
        ended(value, "failed", "confirm write refused")
        value = try committed("page-1", "r1"); check(value.cancel("r1", failure: nil), "release")
        ended(value, "saved", nil)
        value = try committed("page-1", "r1"); value.finished(failure: nil, pending: 0); ended(value, "saved", nil)
        value = try committed("page-1", "r1"); value.finished(failure: nil, pending: 2); ended(value, "pending", nil)
        value = try committed("page-1", "r1"); value.finished(failure: "provider refused copy", pending: 1)
        ended(value, "failed", "provider refused copy")
        value = round(); _ = try value.open("page-1", reclaim: true); try value.begin("page-1", request: "r1"); value.started()
        check(!value.databaseEnded("r1", committed: false, cleanupPending: true), "uncommitted round stayed open")
        ended(value, "pending", nil)
        value = round(); _ = try value.open("page-1", reclaim: true); try value.begin("page-1", request: "r1"); value.started()
        value.databaseFailed("r1", message: "Cannot read backup directory.")
        ended(value, "failed", "Cannot read backup directory.")
        value = round(); _ = try value.open("page-1", reclaim: true); try value.begin("page-1", request: "r1")
        value.pickerCancelled("r1")
        check(value.request == nil && !value.running && value.phase == "saved" && saved.isEmpty, "picker cancel changed the result")
        value = round(); _ = try value.open("page-1", reclaim: true); check(value.close("page-1"), "close")
        check(rejected { try value.begin("page-1", request: "r1") } == "Database owner is closed.", "closed owner")

        // A process killed mid-round reopens as an interrupted retry, through the durable profile.
        let root = URL(fileURLWithPath: CommandLine.arguments[1])
        let store = FolioleFolderBackupProfileStore(file: root.appendingPathComponent("private/profile.json"))
        try store.save(FolioleFolderBackupProfile(bookmark: Data(), label: "Backup"))
        let persist: (String, String?) -> Void = { phase, error in
            guard let id = try? store.load()?.id else { return }
            try? store.update(id: id) { $0.phase = phase; $0.attachmentError = error }
        }
        let killed = FolioleFolderBackupRound(resumed: try store.load()?.phase, save: persist)
        _ = try killed.open("page-1", reclaim: true)
        try killed.begin("page-1", request: "r1")
        killed.started()
        check(try store.load()?.phase == "working", "running round was not persisted")
        let reopened = FolioleFolderBackupRound(resumed: try store.load()?.phase, save: persist)
        check(reopened.phase == "pending" && reopened.errorMessage == FolioleFolderBackupRound.interrupted, "killed round reopened as \(reopened.phase)")
        check(try store.load()?.phase == "pending" && store.load()?.attachmentError == FolioleFolderBackupRound.interrupted,
              "interrupted result was not persisted")
        let again = FolioleFolderBackupRound(resumed: try store.load()?.phase, save: persist)
        check(again.phase == "pending", "interrupted result was lost on the next launch")
        try again.clear()
        check(again.phase == "idle", "forgetting the folder kept the phase")
        // Profiles written before the phase was persisted reopen idle, as before.
        var encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(
            FolioleFolderBackupProfile(bookmark: Data(), label: "Backup"))) as! [String: Any]
        encoded.removeValue(forKey: "phase")
        let legacy = try JSONDecoder().decode(FolioleFolderBackupProfile.self, from: JSONSerialization.data(withJSONObject: encoded))
        check(FolioleFolderBackupRound(resumed: legacy.phase) { _, _ in }.phase == "idle", "legacy profile phase")
        print("folder-backup-round-passed")
    }
}
