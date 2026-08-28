#include <winsock2.h>
#include <windows.h>
#include <windns.h>

#include <memory>

#include "backend.h"

namespace {

std::string InstanceName(const std::string& fqdn) {
  size_t marker = fqdn.find("._foliole-sync._tcp");
  return marker == std::string::npos ? fqdn : fqdn.substr(0, marker);
}

class WindowsBrowse final : public NativeOperation {
 public:
  WindowsBrowse(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : NativeOperation(std::move(sink)), input_(input),
        query_(DnsSdWide(input.type + "." + input.domain)) {}

  void Start() override {
    self_keep_ = shared_from_this();
    request_.Version = DNS_QUERY_REQUEST_VERSION1;
    request_.InterfaceIndex = input_.interface_index;
    request_.QueryName = query_.c_str();
    request_.pBrowseCallback = BrowseCallback;
    request_.pQueryContext = this;
    DWORD status = DnsServiceBrowse(&request_, &cancel_);
    if (status != DNS_REQUEST_PENDING) Finish(status);
  }

  void Stop() override {
    if (!active_.exchange(false)) return;
    sink_->Close();
    DWORD status = DnsServiceBrowseCancel(&cancel_);
    if (status != ERROR_SUCCESS && status != ERROR_CANCELLED) Finish(status);
  }

 private:
  static void WINAPI BrowseCallback(DWORD status, PVOID context, PDNS_RECORD records) {
    static_cast<WindowsBrowse*>(context)->OnBrowse(status, records);
  }

  void Finish(DWORD status) {
    auto keep = self_keep_;
    if (status != ERROR_SUCCESS && status != ERROR_CANCELLED) {
      sink_->Emit({"desktop_dnssd_browse_failed", "error", std::to_string(status), {}});
      sink_->DrainAndClose();
    } else {
      sink_->Close();
    }
    active_ = false;
    self_keep_.reset();
  }

  void OnBrowse(DWORD status, PDNS_RECORD records) {
    auto keep = self_keep_;
    if (status == ERROR_CANCELLED) {
      Finish(status);
    } else if (status != ERROR_SUCCESS) {
      Finish(status);
    } else if (active_.load()) {
      for (PDNS_RECORD record = records; record; record = record->pNext) {
        if (record->wType != DNS_TYPE_PTR || !record->Data.PTR.pNameHost) continue;
        DnsSdService service;
        service.domain = input_.domain;
        service.fqdn = DnsSdUtf8(record->Data.PTR.pNameHost);
        service.name = InstanceName(service.fqdn);
        service.type = input_.type;
        sink_->Emit({{}, record->dwTtl == 0 ? "lost" : "found", {},
          std::move(service)});
      }
    }
    if (records) DnsRecordListFree(records, DnsFreeRecordList);
  }

  std::atomic<bool> active_{true};
  DNS_SERVICE_CANCEL cancel_{};
  DnsSdInput input_;
  DNS_SERVICE_BROWSE_REQUEST request_{};
  std::wstring query_;
  std::shared_ptr<NativeOperation> self_keep_;
};

}  // namespace

std::shared_ptr<NativeOperation> CreateBrowse(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_shared<WindowsBrowse>(input, std::move(sink));
}
