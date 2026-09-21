import Social
import UniformTypeIdentifiers

final class ShareViewController: SLComposeServiceViewController {
    override func isContentValid() -> Bool { true }
    override func configurationItems() -> [Any]! { [] }

    override func didSelectPost() {
        Task {
            do {
                let parts = try await loadParts()
                try FolioleShareInboxQueue.stage(parts: parts)
                await MainActor.run { extensionContext?.completeRequest(returningItems: nil) }
            } catch {
                await MainActor.run { extensionContext?.cancelRequest(withError: error) }
            }
        }
    }

    private func loadParts() async throws -> [FolioleShareInboxPart] {
        var parts: [FolioleShareInboxPart] = []
        for case let item as NSExtensionItem in extensionContext?.inputItems ?? [] {
            append(item.attributedTitle?.string, kind: "title", to: &parts)
            append(item.attributedContentText?.string, kind: "text", to: &parts)
            for provider in item.attachments ?? [] {
                parts.append(contentsOf: try await loadParts(provider))
            }
        }
        append(contentText, kind: "text", to: &parts)
        return parts
    }

    private func loadParts(_ provider: NSItemProvider) async throws -> [FolioleShareInboxPart] {
        var parts: [FolioleShareInboxPart] = []
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            append(try await loadValue(provider, type: .url), kind: "url", to: &parts)
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            append(try await loadValue(provider, type: .plainText), kind: "text", to: &parts)
        }
        return parts
    }

    private func loadValue(_ provider: NSItemProvider, type: UTType) async throws -> String? {
        try await withCheckedThrowingContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type.identifier) { item, error in
                if let error { continuation.resume(throwing: error); return }
                if let url = item as? URL { continuation.resume(returning: url.absoluteString); return }
                if let text = item as? String { continuation.resume(returning: text); return }
                if let text = item as? NSAttributedString { continuation.resume(returning: text.string); return }
                continuation.resume(returning: nil)
            }
        }
    }

    private func append(_ value: String?, kind: String, to parts: inout [FolioleShareInboxPart]) {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        parts.append(FolioleShareInboxPart(kind: kind, value: value))
    }
}
