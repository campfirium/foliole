#include <node_api.h>

#include "legacy_safe_storage.h"

#import <Foundation/Foundation.h>

static NSMutableDictionary<NSNumber *, NSURL *> *activeUrls;
static uint32_t nextHandle = 1;

static napi_value BoolValue(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

static napi_value String(napi_env env, NSString *value) {
  napi_value result;
  const char *utf8 = value.UTF8String ?: "";
  napi_create_string_utf8(env, utf8, NAPI_AUTO_LENGTH, &result);
  return result;
}

static void Set(napi_env env, napi_value object, const char *key, napi_value value) {
  napi_set_named_property(env, object, key, value);
}

static napi_value Failure(napi_env env, NSString *code, NSString *message) {
  napi_value result;
  napi_create_object(env, &result);
  Set(env, result, "ok", BoolValue(env, false));
  Set(env, result, "errorCode", String(env, code));
  Set(env, result, "message", String(env, message));
  return result;
}

static napi_value Success(
  napi_env env,
  NSURL *url,
  NSData *bookmark,
  uint32_t handle,
  bool stale
) {
  napi_value result;
  napi_value handleValue;
  napi_create_object(env, &result);
  napi_create_uint32(env, handle, &handleValue);
  Set(env, result, "ok", BoolValue(env, true));
  Set(env, result, "bookmark", String(env, [bookmark base64EncodedStringWithOptions:0]));
  Set(env, result, "handle", handleValue);
  Set(env, result, "resolvedPath", String(env, url.path));
  Set(env, result, "stale", BoolValue(env, stale));
  return result;
}

static NSString *ReadString(napi_env env, napi_value value) {
  size_t size = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &size) != napi_ok) return nil;
  NSMutableData *data = [NSMutableData dataWithLength:size + 1];
  if (napi_get_value_string_utf8(env, value, static_cast<char *>(data.mutableBytes), size + 1, &size) != napi_ok) {
    return nil;
  }
  return [[NSString alloc] initWithBytes:data.bytes length:size encoding:NSUTF8StringEncoding];
}

static bool ReadSingleStringArgument(
  napi_env env,
  napi_callback_info info,
  NSString **value
) {
  size_t argc = 1;
  napi_value argv[1];
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc != 1) return false;
  napi_valuetype type;
  if (napi_typeof(env, argv[0], &type) != napi_ok || type != napi_string) return false;
  *value = ReadString(env, argv[0]);
  return *value != nil;
}

static napi_value StartUrl(napi_env env, NSURL *url, NSData *bookmark, bool stale) {
  if (![url startAccessingSecurityScopedResource]) {
    return Failure(env, @"access_failed", @"The security-scoped resource could not be activated.");
  }
  uint32_t handle = nextHandle++;
  activeUrls[@(handle)] = url;
  return Success(env, url, bookmark, handle, stale);
}

static napi_value CreateAndStart(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    NSString *filePath;
    if (!ReadSingleStringArgument(env, info, &filePath)) {
      return Failure(env, @"invalid_argument", @"A file path string is required.");
    }
    NSURL *url = [NSURL fileURLWithPath:filePath];
    NSError *error = nil;
    NSData *bookmark = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope
                         includingResourceValuesForKeys:nil
                                          relativeToURL:nil
                                                  error:&error];
    if (!bookmark) {
      return Failure(env, @"create_failed", error.localizedDescription ?: @"Bookmark creation failed.");
    }
    return StartUrl(env, url, bookmark, false);
  }
}

static napi_value ResolveAndStart(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    NSString *encoded;
    if (!ReadSingleStringArgument(env, info, &encoded)) {
      return Failure(env, @"invalid_argument", @"A bookmark string is required.");
    }
    NSData *bookmark = [[NSData alloc] initWithBase64EncodedString:encoded options:0];
    if (!bookmark) return Failure(env, @"invalid_bookmark", @"Bookmark data is not valid Base64.");
    BOOL stale = NO;
    NSError *error = nil;
    NSURL *url = [NSURL URLByResolvingBookmarkData:bookmark
                                           options:NSURLBookmarkResolutionWithSecurityScope | NSURLBookmarkResolutionWithoutUI
                                     relativeToURL:nil
                               bookmarkDataIsStale:&stale
                                             error:&error];
    if (!url) {
      return Failure(env, @"resolve_failed", error.localizedDescription ?: @"Bookmark resolution failed.");
    }
    return StartUrl(env, url, bookmark, stale);
  }
}

static napi_value StopHandle(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  uint32_t handle = 0;
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok ||
      argc != 1 ||
      napi_get_value_uint32(env, argv[0], &handle) != napi_ok) {
    return BoolValue(env, false);
  }
  NSURL *url = activeUrls[@(handle)];
  if (!url) return BoolValue(env, false);
  [url stopAccessingSecurityScopedResource];
  [activeUrls removeObjectForKey:@(handle)];
  return BoolValue(env, true);
}

static napi_value AppGroupContainerPath(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    NSString *identifier;
    if (!ReadSingleStringArgument(env, info, &identifier)) {
      return Failure(env, @"invalid_argument", @"An App Group identifier is required.");
    }
    NSURL *url = [NSFileManager.defaultManager
      containerURLForSecurityApplicationGroupIdentifier:identifier];
    if (!url) return Failure(env, @"container_unavailable", @"The App Group container is unavailable.");
    napi_value result;
    napi_create_object(env, &result);
    Set(env, result, "ok", BoolValue(env, true));
    Set(env, result, "path", String(env, url.path));
    return result;
  }
}

static napi_value Initialize(napi_env env, napi_value exports) {
  activeUrls = [NSMutableDictionary dictionary];
  napi_property_descriptor properties[] = {
    { "createAndStart", nullptr, CreateAndStart, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "appGroupContainerPath", nullptr, AppGroupContainerPath, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "decryptLegacyMasSafeStorage", nullptr, DecryptLegacyMasSafeStorage, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "resolveAndStart", nullptr, ResolveAndStart, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "stop", nullptr, StopHandle, nullptr, nullptr, nullptr, napi_default, nullptr }
  };
  napi_define_properties(env, exports, 5, properties);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
