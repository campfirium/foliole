import CoreGraphics

guard CGPreflightPostEventAccess() else { fatalError("Input posting is not authorized") }
let rKey: CGKeyCode = 15
for keyDown in [true, false] {
  let event = CGEvent(keyboardEventSource: nil, virtualKey: rKey, keyDown: keyDown)!
  event.flags = .maskAlternate
  event.post(tap: .cghidEventTap)
}
