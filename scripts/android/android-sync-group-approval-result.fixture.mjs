export const approvalFixtureSources = {
  'android/content/Context.java': `package android.content;
public class Context { public Context getApplicationContext() { return this; } }`,
  'android/app/Activity.java': 'package android.app; public class Activity {}',
  'org/json/JSONObject.java': `package org.json;
public class JSONObject {
  public static final Object NULL = new Object();
  private final java.util.Map<String,Object> values = new java.util.HashMap<>();
  public JSONObject put(String key, Object value) { values.put(key, value); return this; }
  public String getString(String key) { return (String) values.get(key); }
  public String optString(String key) { return (String) values.getOrDefault(key, ""); }
  public JSONObject getJSONObject(String key) { return (JSONObject) values.get(key); }
  public JSONObject optJSONObject(String key) { return getJSONObject(key); }
  public Object get(String key) { return values.get(key); }
}`,
  'org/json/JSONArray.java': 'package org.json; public class JSONArray {}',
  'com/getcapacitor/JSObject.java': `package com.getcapacitor;
public class JSObject extends org.json.JSONObject {}`,
  'com/getcapacitor/PluginCall.java': `package com.getcapacitor;
public class PluginCall {
  public org.json.JSONObject getObject(String key) { return null; }
  public String getString(String key) { return "request"; }
}`,
  'com/foliole/android/ApprovalFixture.java': `package com.foliole.android;
import android.content.Context;
import android.app.Activity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.JSONObject;
import org.json.JSONArray;

public class ApprovalFixture {
  static boolean registered;
  static boolean notified;
  static void field(String name, Object value) throws Exception {
    var field = FolioleCompanionSyncGroupProvider.class.getDeclaredField(name);
    field.setAccessible(true); field.set(null, value);
  }
  public static void main(String[] args) throws Exception {
    var joins = new FolioleCompanionJoinRequestProvider(new JSONObject());
    field("joinProvider", joins);
    field("server", new FolioleCompanionSyncGroupServer(null, null, null, null, null));
    field("activeConfig", new JSONObject().put("sync_group", new JSONObject().put("group_id", "group")));
    field("dataBridge", new FolioleCompanionSyncGroupDataBridge());
    field("stateListener", (Runnable) () -> notified = true);
    var result = FolioleCompanionSyncGroupProvider.accept(new Context(), new PluginCall());
    if (!registered || !joins.accepted || !notified) throw new AssertionError("approval not completed");
    if (!(result.get("pending_requests") instanceof JSONArray)) {
      throw new AssertionError("approval must return provider pending_requests");
    }
    if (!"running".equals(result.getString("state"))) throw new AssertionError("provider state missing");
    if (result.get("encrypted_group_info") != null) throw new AssertionError("wire acceptance leaked into UI state");
    System.out.println("Approval returns complete provider state after registering the device.");
  }
}
class FolioleCompanionNsdAdvertisement {
  static FolioleCompanionNsdAdvertisement start(Context c,int p,JSONObject j) { return null; }
  String state() { return "registered"; } void stop() {}
}
class FolioleCompanionSyncGroupDataBridge {
  interface Dispatcher {}
  static FolioleCompanionSyncGroupDataBridge current() { return null; }
  void replaceDispatcher(Dispatcher d) {}
  JSONObject request(String operation, JSONObject value) {
    ApprovalFixture.registered = "register_device".equals(operation); return new JSONObject();
  }
}
class FolioleCompanionJoinRequestProvider {
  boolean accepted;
  FolioleCompanionJoinRequestProvider(JSONObject j) {}
  FolioleCompanionJoinRequest request(String id,long now) { return new FolioleCompanionJoinRequest(); }
  JSObject accept(String id,long now) {
    if (!ApprovalFixture.registered) throw new AssertionError("accept before registration");
    accepted = true; var result = new JSObject(); result.put("encrypted_group_info", "sealed"); return result;
  }
  void reject(String id,long now) {} JSONArray pending(long now) { return new JSONArray(); }
}
class FolioleCompanionJoinRequest {
  String deviceIdentityKey() { return "device"; }
  JSONObject registeredDevice(String key) { return new JSONObject(); }
}
class FolioleCompanionSyncGroupServer {
  FolioleCompanionSyncGroupServer(Context c,JSONObject j,FolioleCompanionJoinRequestProvider p,
    FolioleCompanionSyncGroupDataBridge b,Runnable r) {}
  int port() { return 38641; } void stop() {}
}
class FolioleCompanionCurrentGroupCredential {
  String deviceId; String workgroupKey;
  static FolioleCompanionCurrentGroupCredential load(String id) { return null; }
}
class FolioleCompanionSyncPackProviderDefinitions {
  static FolioleCompanionSyncPackProviderDefinitions load(Context c) { return null; }
  int protocol() { return 24; }
}
class FolioleCompanionSyncGroupCrypto { static String groupTag(String key) { return key; } }
class FolioleCompanionSyncScreenAwake { static void attach(Activity a) {} static void clear() {} }
class FolioleCompanionHostBridgeContractDefinitions {
  static String syncGroupProviderRequestKey(Context c,String name) { return name; }
}`
};
