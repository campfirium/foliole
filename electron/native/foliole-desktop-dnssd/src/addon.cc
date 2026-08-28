#include <napi.h>

#include "backend.h"

namespace {

std::string StringField(const Napi::Object& object, const char* key, bool optional = false) {
  Napi::Value value = object.Get(key);
  if (optional && (value.IsUndefined() || value.IsNull())) return {};
  if (!value.IsString()) throw Napi::TypeError::New(object.Env(), "desktop_dnssd_input_invalid");
  return value.As<Napi::String>().Utf8Value();
}

DnsSdInput ReadInput(const Napi::CallbackInfo& info, bool registration) {
  if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsFunction()) {
    throw Napi::TypeError::New(info.Env(), "desktop_dnssd_input_invalid");
  }
  Napi::Object object = info[0].As<Napi::Object>();
  DnsSdInput input;
  input.domain = StringField(object, "domain");
  input.type = StringField(object, "type");
  if (!registration) return input;
  input.host = StringField(object, "host", true);
  input.name = StringField(object, "name");
  input.port = object.Get("port").As<Napi::Number>().Uint32Value();
  Napi::Object txt = object.Get("txt").As<Napi::Object>();
  Napi::Array keys = txt.GetPropertyNames();
  for (uint32_t index = 0; index < keys.Length(); ++index) {
    Napi::Value keyValue = keys.Get(index);
    std::string key = keyValue.As<Napi::String>().Utf8Value();
    input.txt.emplace(key, txt.Get(key).As<Napi::String>().Utf8Value());
  }
  return input;
}

Napi::Object ServiceObject(Napi::Env env, const DnsSdService& service) {
  Napi::Object value = Napi::Object::New(env);
  Napi::Array addresses = Napi::Array::New(env, service.addresses.size());
  for (size_t index = 0; index < service.addresses.size(); ++index) {
    addresses.Set(index, service.addresses[index]);
  }
  Napi::Object txt = Napi::Object::New(env);
  for (const auto& [key, entry] : service.txt) txt.Set(key, entry);
  value.Set("addresses", addresses);
  value.Set("domain", service.domain);
  value.Set("fqdn", service.fqdn);
  value.Set("host", service.host);
  value.Set("interfaceIndex", service.interface_index);
  value.Set("name", service.name);
  value.Set("port", service.port);
  value.Set("txt", txt);
  value.Set("type", service.type);
  return value;
}

void DeliverEvent(Napi::Env env, Napi::Function callback, DnsSdEvent* event) {
  std::unique_ptr<DnsSdEvent> owned(event);
  if (!env || !callback) return;
  Napi::Object value = Napi::Object::New(env);
  value.Set("kind", owned->kind);
  if (owned->kind == "error") {
    value.Set("code", owned->code);
    value.Set("message", owned->message);
  } else {
    value.Set("service", ServiceObject(env, owned->service));
  }
  callback.Call({value});
}

Napi::Object WrapOperation(Napi::Env env, std::unique_ptr<NativeOperation> operation) {
  NativeOperation* raw = operation.release();
  Napi::Object result = Napi::Object::New(env);
  auto external = Napi::External<NativeOperation>::New(env, raw,
    [](Napi::Env, NativeOperation* value) { value->Stop(); delete value; });
  result.Set("_native", external);
  result.Set("stop", Napi::Function::New(env,
    [raw](const Napi::CallbackInfo&) { raw->Stop(); }));
  return result;
}

Napi::Value Begin(const Napi::CallbackInfo& info, bool registration) {
  DnsSdInput input = ReadInput(info, registration);
  auto callback = Napi::ThreadSafeFunction::New(
    info.Env(), info[1].As<Napi::Function>(), "foliole-desktop-dnssd", 64, 1);
  auto sink = std::make_shared<EventSink>(std::move(callback));
  return WrapOperation(info.Env(), registration
    ? StartRegistration(input, sink) : StartBrowse(input, sink));
}

}  // namespace

EventSink::EventSink(Napi::ThreadSafeFunction callback) : callback_(std::move(callback)) {}
EventSink::~EventSink() { Close(); }

void EventSink::Emit(DnsSdEvent event) {
  if (!active_.load()) return;
  auto* copy = new DnsSdEvent(std::move(event));
  napi_status status = callback_.NonBlockingCall(copy, DeliverEvent);
  if (status != napi_ok) delete copy;
}

void EventSink::Close() {
  if (!active_.exchange(false)) return;
  callback_.Abort();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("browse", Napi::Function::New(env,
    [](const Napi::CallbackInfo& info) { return Begin(info, false); }));
  exports.Set("register", Napi::Function::New(env,
    [](const Napi::CallbackInfo& info) { return Begin(info, true); }));
  return exports;
}

NODE_API_MODULE(foliole_desktop_dnssd, Init)
