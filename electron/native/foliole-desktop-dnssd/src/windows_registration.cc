#include <winsock2.h>
#include <windows.h>
#include <windns.h>

#include <memory>

#include "backend.h"

namespace {

std::wstring RegistrationHost(const std::string& requested) {
  if (!requested.empty()) return DnsSdWindowsName(requested);
  wchar_t value[MAX_COMPUTERNAME_LENGTH + 1] = {};
  DWORD size = MAX_COMPUTERNAME_LENGTH + 1;
  return GetComputerNameW(value, &size)
    ? std::wstring(value, size) + L".local" : std::wstring();
}

class WindowsRegistration final : public NativeOperation {
 public:
  WindowsRegistration(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : NativeOperation(std::move(sink)), input_(input),
        name_(DnsSdWindowsName(input.name + "." + input.type + "." + input.domain)),
        host_(RegistrationHost(input.host)) {
    for (const auto& [key, value] : input.txt) {
      keys_.push_back(DnsSdWide(key));
      values_.push_back(DnsSdWide(value));
    }
    for (auto& key : keys_) key_ptrs_.push_back(key.c_str());
    for (auto& value : values_) value_ptrs_.push_back(value.c_str());
  }

  ~WindowsRegistration() override {
    if (instance_) DnsServiceFreeInstance(instance_);
  }

  void Start() override {
    if (host_.empty()) {
      Finish(ERROR_INVALID_DATA, nullptr);
      return;
    }
    instance_ = DnsServiceConstructInstance(name_.c_str(),
      host_.c_str(), nullptr, nullptr, input_.port,
      0, 0, key_ptrs_.size(), key_ptrs_.data(), value_ptrs_.data());
    if (!instance_) {
      Finish(ERROR_INVALID_DATA, nullptr);
      return;
    }
    self_keep_ = shared_from_this();
    request_.Version = DNS_QUERY_REQUEST_VERSION1;
    request_.InterfaceIndex = input_.interface_index;
    request_.pServiceInstance = instance_;
    request_.pRegisterCompletionCallback = RegisterCallback;
    request_.pQueryContext = this;
    DWORD status = DnsServiceRegister(&request_, &cancel_);
    if (status != DNS_REQUEST_PENDING) Finish(status, nullptr);
  }

  void Stop() override {
    if (!active_.exchange(false)) return;
    sink_->Close();
    DWORD status = registered_
      ? DnsServiceDeRegister(&request_, nullptr)
      : DnsServiceRegisterCancel(&cancel_);
    if (status != DNS_REQUEST_PENDING && status != ERROR_SUCCESS
        && status != ERROR_CANCELLED) {
      Finish(status, nullptr);
    }
  }

 private:
  static void WINAPI RegisterCallback(
    DWORD status, PVOID context, PDNS_SERVICE_INSTANCE instance) {
    static_cast<WindowsRegistration*>(context)->OnCallback(status, instance);
  }

  void Finish(DWORD status, PDNS_SERVICE_INSTANCE callback_instance) {
    auto keep = self_keep_;
    if (callback_instance) DnsServiceFreeInstance(callback_instance);
    if (status != ERROR_SUCCESS && status != ERROR_CANCELLED) {
      sink_->Emit({"desktop_dnssd_register_failed", "error", std::to_string(status), {}});
      sink_->DrainAndClose();
    } else {
      sink_->Close();
    }
    active_ = false;
    self_keep_.reset();
  }

  void OnCallback(DWORD status, PDNS_SERVICE_INSTANCE callback_instance) {
    auto keep = self_keep_;
    if (!active_.load() || registered_ || status != ERROR_SUCCESS) {
      Finish(status, callback_instance);
      return;
    }
    if (callback_instance) DnsServiceFreeInstance(callback_instance);
    registered_ = true;
    DnsSdService service;
    service.domain = input_.domain;
    service.fqdn = DnsSdUtf8(name_.c_str());
    service.host = input_.host;
    service.name = input_.name;
    service.port = input_.port;
    service.txt = input_.txt;
    service.type = input_.type;
    sink_->Emit({{}, "registered", {}, std::move(service)});
  }

  std::atomic<bool> active_{true};
  DNS_SERVICE_CANCEL cancel_{};
  std::wstring host_;
  DnsSdInput input_;
  PDNS_SERVICE_INSTANCE instance_ = nullptr;
  std::vector<std::wstring> keys_, values_;
  std::vector<PCWSTR> key_ptrs_, value_ptrs_;
  std::wstring name_;
  bool registered_ = false;
  DNS_SERVICE_REGISTER_REQUEST request_{};
  std::shared_ptr<NativeOperation> self_keep_;
};

}  // namespace

std::shared_ptr<NativeOperation> CreateRegistration(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_shared<WindowsRegistration>(input, std::move(sink));
}
