#include <winsock2.h>
#include <windows.h>
#include <windns.h>

#include <memory>

#include "backend.h"

namespace {

std::wstring QueryName(const DnsSdInput& input) {
  std::string suffix = "." + input.type + "." + input.domain;
  return DnsSdWide(input.name.ends_with(suffix) ? input.name : input.name + suffix);
}

class WindowsResolve final : public NativeOperation {
 public:
  WindowsResolve(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : NativeOperation(std::move(sink)), input_(input), query_(QueryName(input)) {}

  void Start() override {
    self_keep_ = shared_from_this();
    request_.Version = DNS_QUERY_REQUEST_VERSION1;
    request_.InterfaceIndex = input_.interface_index;
    request_.QueryName = query_.data();
    request_.pResolveCompletionCallback = ResolveCallback;
    request_.pQueryContext = this;
    DWORD status = DnsServiceResolve(&request_, &cancel_);
    if (status != DNS_REQUEST_PENDING) Finish(status, nullptr);
  }

  void Stop() override {
    if (!active_.exchange(false)) return;
    sink_->Close();
    DWORD status = DnsServiceResolveCancel(&cancel_);
    if (status != ERROR_SUCCESS && status != ERROR_CANCELLED) Finish(status, nullptr);
  }

 private:
  static void WINAPI ResolveCallback(
    DWORD status, PVOID context, PDNS_SERVICE_INSTANCE instance) {
    static_cast<WindowsResolve*>(context)->Finish(status, instance);
  }

  void Finish(DWORD status, PDNS_SERVICE_INSTANCE instance) {
    auto keep = self_keep_;
    bool deliver = active_.exchange(false);
    bool emitted = false;
    if (deliver && status == ERROR_SUCCESS && instance) {
      DnsSdService service = DnsSdServiceFromInstance(instance);
      service.domain = input_.domain;
      service.type = input_.type;
      sink_->Emit({{}, "found", {}, std::move(service)});
      emitted = true;
    } else if (deliver && status != ERROR_CANCELLED) {
      sink_->Emit({"desktop_dnssd_resolve_failed", "error", std::to_string(status), {}});
      emitted = true;
    }
    if (instance) DnsServiceFreeInstance(instance);
    if (emitted) sink_->DrainAndClose(); else sink_->Close();
    self_keep_.reset();
  }

  std::atomic<bool> active_{true};
  DNS_SERVICE_CANCEL cancel_{};
  DnsSdInput input_;
  std::wstring query_;
  DNS_SERVICE_RESOLVE_REQUEST request_{};
  std::shared_ptr<NativeOperation> self_keep_;
};

}  // namespace

std::shared_ptr<NativeOperation> CreateResolve(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_shared<WindowsResolve>(input, std::move(sink));
}
