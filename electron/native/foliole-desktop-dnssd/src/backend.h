#pragma once

#include <napi.h>

#include <atomic>
#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <vector>

struct DnsSdInput {
  std::string domain;
  std::string host;
  std::string name;
  uint16_t port = 0;
  std::map<std::string, std::string> txt;
  std::string type;
};

struct DnsSdService {
  std::vector<std::string> addresses;
  std::string domain;
  std::string fqdn;
  std::string host;
  uint32_t interface_index = 0;
  std::string name;
  uint16_t port = 0;
  std::map<std::string, std::string> txt;
  std::string type;
};

struct DnsSdEvent {
  std::string code;
  std::string kind;
  std::string message;
  DnsSdService service;
};

class EventSink {
 public:
  explicit EventSink(Napi::ThreadSafeFunction callback);
  ~EventSink();
  void Close();
  void Emit(DnsSdEvent event);

 private:
  std::atomic<bool> active_{true};
  Napi::ThreadSafeFunction callback_;
};

class NativeOperation {
 public:
  explicit NativeOperation(std::shared_ptr<EventSink> sink) : sink_(std::move(sink)) {}
  virtual ~NativeOperation() = default;
  virtual void Stop() = 0;

 protected:
  std::shared_ptr<EventSink> sink_;
};

std::unique_ptr<NativeOperation> StartBrowse(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink);
std::unique_ptr<NativeOperation> StartRegistration(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink);

#ifdef _WIN32
#include <windns.h>
std::wstring DnsSdWide(const std::string& value);
std::string DnsSdUtf8(const wchar_t* value);
DnsSdService DnsSdServiceFromInstance(PDNS_SERVICE_INSTANCE instance);
#endif
