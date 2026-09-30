import Foundation

actor FolioleCompanionAttachmentResourceSessions {
    struct Batch {
        let downloaded: [FolioleCompanionDownloadedAttachment]
        let failedIds: [String]
    }

    private var batches: [String: Batch] = [:]
    private var committedIds: [String: [String]] = [:]
    private var stagedCreatedURLs: [String: [URL]] = [:]
    private var stagedManifests: [String: [[String: Any]]] = [:]

    func create(downloaded: [FolioleCompanionDownloadedAttachment], failedIds: [String]) -> String {
        let token = UUID().uuidString
        batches[token] = Batch(downloaded: downloaded, failedIds: failedIds)
        return token
    }

    func load(_ token: String) -> Batch? { batches[token] }
    func committed(_ token: String) -> [String]? { committedIds[token] }
    func staged(_ token: String) -> [[String: Any]]? { stagedManifests[token] }
    func markStaged(_ token: String, result: FolioleCompanionAttachmentFileStage.Result) {
        stagedCreatedURLs[token] = result.createdURLs
        stagedManifests[token] = result.manifest
    }
    func finish(_ token: String, committed: Bool) throws {
        if !committed, let batch = batches[token] {
            try FolioleCompanionAttachmentFileStage.restore(batch, urls: stagedCreatedURLs[token] ?? [])
        }
        batches[token] = nil
        stagedCreatedURLs[token] = nil
        stagedManifests[token] = nil
    }
    func markCommitted(_ token: String, ids: [String]) {
        committedIds[token] = ids
        batches[token] = nil
    }
}
