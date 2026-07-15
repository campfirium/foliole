#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>

#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static const useconds_t POLL_INTERVAL_US = 25000;
static const int POLL_ATTEMPTS = 9;
static const int MODIFIER_RELEASE_ATTEMPTS = 20;

static const char *json_bool(bool value) {
  return value ? "true" : "false";
}

static void print_result(const char *permission, bool copy_written) {
  printf(
    "{\"permission\":\"%s\",\"copyWritten\":%s}\n",
    permission,
    json_bool(copy_written)
  );
}

static bool post_command_c(void) {
  CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateCombinedSessionState);
  if (source == NULL) return false;
  CGEventRef key_down = CGEventCreateKeyboardEvent(source, (CGKeyCode)kVK_ANSI_C, true);
  CGEventRef key_up = CGEventCreateKeyboardEvent(source, (CGKeyCode)kVK_ANSI_C, false);
  if (key_down == NULL || key_up == NULL) {
    if (key_down != NULL) CFRelease(key_down);
    if (key_up != NULL) CFRelease(key_up);
    CFRelease(source);
    return false;
  }
  CGEventSetFlags(key_down, kCGEventFlagMaskCommand);
  CGEventSetFlags(key_up, kCGEventFlagMaskCommand);
  CGEventPost(kCGHIDEventTap, key_down);
  CGEventPost(kCGHIDEventTap, key_up);
  CFRelease(key_down);
  CFRelease(key_up);
  CFRelease(source);
  return true;
}

static bool trigger_modifiers_are_down(void) {
  const CGEventSourceStateID state = kCGEventSourceStateHIDSystemState;
  const bool command_down = CGEventSourceKeyState(state, (CGKeyCode)kVK_Command)
    || CGEventSourceKeyState(state, (CGKeyCode)kVK_RightCommand);
  const bool shift_down = CGEventSourceKeyState(state, (CGKeyCode)kVK_Shift)
    || CGEventSourceKeyState(state, (CGKeyCode)kVK_RightShift);
  return command_down || shift_down;
}

static bool wait_for_trigger_modifiers_release(void) {
  for (int attempt = 0; attempt < MODIFIER_RELEASE_ATTEMPTS; attempt += 1) {
    if (!trigger_modifiers_are_down()) return true;
    usleep(POLL_INTERVAL_US);
  }
  return !trigger_modifiers_are_down();
}

static bool wait_for_pasteboard_write(NSInteger baseline) {
  for (int attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    usleep(POLL_INTERVAL_US);
    if ([NSPasteboard generalPasteboard].changeCount != baseline) return true;
  }
  return false;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    const bool preflight_only = argc == 2 && strcmp(argv[1], "--preflight") == 0;
    bool granted = CGPreflightPostEventAccess();
    if (preflight_only) {
      print_result(granted ? "granted" : "denied", false);
      return 0;
    }
    const NSInteger baseline = [NSPasteboard generalPasteboard].changeCount;
    if (!granted) granted = CGRequestPostEventAccess();
    if (!granted) {
      print_result("denied", false);
      return 0;
    }
    if (!wait_for_trigger_modifiers_release()) {
      print_result("unavailable", false);
      return 1;
    }
    if (!post_command_c()) {
      print_result("unavailable", false);
      return 1;
    }
    print_result("granted", wait_for_pasteboard_write(baseline));
    return 0;
  }
}
