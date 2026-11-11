#include "notification_permissions.h"

#import <UserNotifications/UserNotifications.h>

static const char *StatusName(UNAuthorizationStatus status) {
  switch (status) {
    case UNAuthorizationStatusNotDetermined: return "notDetermined";
    case UNAuthorizationStatusDenied: return "denied";
    case UNAuthorizationStatusAuthorized:
    case UNAuthorizationStatusProvisional: return "allowed";
    default: return "unavailable";
  }
}

static void ResolveStatus(napi_env env, napi_value, void *context, void *data) {
  if (!env) return;
  napi_value value;
  napi_create_string_utf8(env, static_cast<const char *>(data), NAPI_AUTO_LENGTH, &value);
  napi_resolve_deferred(env, static_cast<napi_deferred>(context), value);
}

static void FinishStatus(napi_threadsafe_function callback, const char *status) {
  napi_call_threadsafe_function(callback, const_cast<char *>(status), napi_tsfn_nonblocking);
  napi_release_threadsafe_function(callback, napi_tsfn_release);
}

static napi_value ReadStatus(napi_env env, bool request) {
  napi_deferred deferred;
  napi_value promise;
  napi_value resource;
  napi_create_promise(env, &deferred, &promise);
  napi_create_string_utf8(env, "foliole:notification-permissions", NAPI_AUTO_LENGTH, &resource);

  napi_threadsafe_function callback;
  if (napi_create_threadsafe_function(env, nullptr, nullptr, resource, 0, 1, nullptr, nullptr,
                                      deferred, ResolveStatus, &callback) != napi_ok) {
    ResolveStatus(env, nullptr, deferred, const_cast<char *>("unavailable"));
    return promise;
  }

  UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    if (!request || settings.authorizationStatus != UNAuthorizationStatusNotDetermined) {
      FinishStatus(callback, StatusName(settings.authorizationStatus));
      return;
    }
    [center requestAuthorizationWithOptions:UNAuthorizationOptionAlert | UNAuthorizationOptionSound
      completionHandler:^(BOOL granted, NSError *error) {
        [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *updated) {
          const char *status = error && updated.authorizationStatus == UNAuthorizationStatusNotDetermined
            ? "unavailable" : StatusName(updated.authorizationStatus);
          FinishStatus(callback, status);
        }];
      }];
  }];
  return promise;
}

static napi_value NotificationStatus(napi_env env, napi_callback_info) {
  return ReadStatus(env, false);
}

static napi_value RequestNotificationPermission(napi_env env, napi_callback_info) {
  return ReadStatus(env, true);
}

void RegisterNotificationPermissions(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    { "notificationStatus", nullptr, NotificationStatus, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "requestNotificationPermission", nullptr, RequestNotificationPermission, nullptr, nullptr, nullptr,
      napi_default, nullptr }
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
}
