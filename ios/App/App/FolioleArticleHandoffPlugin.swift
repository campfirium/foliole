import Capacitor
import UIKit

@objc(FolioleArticleHandoffPlugin)
public final class FolioleArticleHandoffPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleArticleHandoffPlugin"
    public let jsName = "FolioleArticleHandoff"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)]

    @objc func open(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), !html.isEmpty else {
            call.reject("article_html_required")
            return
        }
        let files = FileManager.default
        let directory = files.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let file = directory.appendingPathComponent("Article.html")
        do {
            try files.createDirectory(at: directory, withIntermediateDirectories: false)
            try Data(html.utf8).write(to: file, options: .atomic)
        } catch {
            try? files.removeItem(at: directory)
            call.reject("article_handoff_failed")
            return
        }
        DispatchQueue.main.async {
            self.presentArticle(call, file: file, directory: directory)
        }
    }

    private func presentArticle(_ call: CAPPluginCall, file: URL, directory: URL) {
        guard let presenter = bridge?.viewController, presenter.viewIfLoaded?.window != nil,
              presenter.presentedViewController == nil else {
            try? FileManager.default.removeItem(at: directory)
            call.reject("article_handoff_failed")
            return
        }
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        sheet.completionWithItemsHandler = { _, completed, _, error in
            try? FileManager.default.removeItem(at: directory)
            if error != nil {
                call.reject("article_handoff_failed")
            } else {
                call.resolve(["status": completed ? "presented" : "cancelled"])
            }
        }
        presenter.present(sheet, animated: true)
    }
}
