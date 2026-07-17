import AppKit
import Darwin
import Dispatch
import Foundation

guard CommandLine.arguments.count == 3,
      let timeoutMilliseconds = Int(CommandLine.arguments[2]),
      timeoutMilliseconds > 0 else {
  fputs("usage: wait-for-app-exit <bundle-id> <timeout-ms>\n", stderr)
  Darwin.exit(1)
}

let bundleIdentifier = CommandLine.arguments[1]
let applications = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier)
guard !applications.isEmpty else { Darwin.exit(0) }

final class ExitMonitor {
  var source: DispatchSourceProcess?
  private let group: DispatchGroup
  private let lock = NSLock()
  private var finished = false

  init(group: DispatchGroup) {
    self.group = group
  }

  func complete() {
    lock.lock()
    guard !finished else {
      lock.unlock()
      return
    }
    finished = true
    lock.unlock()
    group.leave()
    source?.cancel()
  }
}

let group = DispatchGroup()
let queue = DispatchQueue(label: "com.campfirium.foliole.internal-exit", attributes: .concurrent)
var monitors: [ExitMonitor] = []

for application in applications {
  group.enter()
  let monitor = ExitMonitor(group: group)
  let source = DispatchSource.makeProcessSource(
    identifier: application.processIdentifier,
    eventMask: .exit,
    queue: queue
  )
  monitor.source = source
  source.setEventHandler { monitor.complete() }
  source.activate()
  monitors.append(monitor)
  if kill(application.processIdentifier, 0) == -1 && errno == ESRCH {
    monitor.complete()
  }
}

for application in applications {
  _ = application.terminate()
}

if group.wait(timeout: .now() + .milliseconds(timeoutMilliseconds)) == .timedOut {
  fputs("timed out waiting for Foliole to exit\n", stderr)
  Darwin.exit(2)
}
