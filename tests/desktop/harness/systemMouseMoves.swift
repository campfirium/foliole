import CoreGraphics
import Foundation
guard CGPreflightPostEventAccess() else { fatalError("Input posting is not authorized") }
let x = Double(CommandLine.arguments[1])!
let y = Double(CommandLine.arguments[2])!
let width = Double(CommandLine.arguments[3])!
let height = Double(CommandLine.arguments[4])!
let original = CGEvent(source: nil)!.location
func move(_ point: CGPoint) {
  CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)!.post(tap: .cghidEventTap)
}
var verified = 0
for index in 0..<90 {
  let ratio = Double(index % 15) / 14
  let point = index % 2 == 0
    ? CGPoint(x: x + width * (0.12 + ratio * 0.2), y: y + height * 0.4)
    : CGPoint(x: Double(CommandLine.arguments[5])!, y: Double(CommandLine.arguments[6])!)
  move(point)
  Thread.sleep(forTimeInterval: 0.016)
  let actual = CGEvent(source: nil)!.location
  if abs(actual.x - point.x) <= 2 && abs(actual.y - point.y) <= 2 { verified += 1 }
}
move(original)
print("Posted 90 OS mouse moves; verified \(verified); restored starting cursor (\(original.x),\(original.y))")
if verified == 0 { exit(2) }
