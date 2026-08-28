#include <winsock2.h>
#include <windows.h>
#include <windns.h>

#include <algorithm>
#include <condition_variable>
#include <mutex>
#include <thread>

#include "backend.h"

namespace {

DnsSdEvent ErrorEvent(const char* code, DWORD status) {
  return {code, "error", std::to_string(status), {}};
}

struct ResolveContext;

class WindowsBrowse final : public NativeOperation {
 public:
  WindowsBrowse(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : NativeOperation(std::move(sink)), query_(DnsSdWide(input.type + "." + input.domain)) {
    request_.Version = DNS_QUERY_REQUEST_VERSION1;
    request_.QueryName = query_.c_str();
    request_.pBrowseCallback = BrowseCallback;
    request_.pQueryContext = this;
    DWORD status = DnsServiceBrowse(&request_, &cancel_);
    if (status != DNS_REQUEST_PENDING) {
      browse_done_ = true;
      sink_->Emit(ErrorEvent("desktop_dnssd_browse_failed", status));
    }
  }
  ~WindowsBrowse() override { Stop(); }
  void Stop() override;
  void Emit(DnsSdEvent event) { sink_->Emit(std::move(event)); }
  void ResolveFinished(ResolveContext* context);

 private:
  static void WINAPI BrowseCallback(DWORD status, PVOID context, PDNS_RECORD records);
  void OnBrowse(DWORD status, PDNS_RECORD records);
  void Resolve(const std::wstring& fqdn, DWORD interface_index);

  std::atomic<bool> active_{true};
  bool browse_done_ = false;
  DNS_SERVICE_CANCEL cancel_{};
  std::condition_variable cv_;
  std::mutex mutex_;
  std::vector<ResolveContext*> resolves_;
  DNS_SERVICE_BROWSE_REQUEST request_{};
  std::wstring query_;
};

struct ResolveContext {
  DNS_SERVICE_CANCEL cancel{};
  std::wstring fqdn;
  WindowsBrowse* owner = nullptr;
  DNS_SERVICE_RESOLVE_REQUEST request{};
};

void WINAPI ResolveCallback(DWORD status, PVOID raw, PDNS_SERVICE_INSTANCE instance) {
  auto* context = static_cast<ResolveContext*>(raw);
  WindowsBrowse* owner = context->owner;
  if (status == ERROR_SUCCESS && instance) {
    owner->Emit({{}, "found", {}, DnsSdServiceFromInstance(instance)});
  } else if (status != ERROR_CANCELLED) {
    owner->Emit(ErrorEvent("desktop_dnssd_resolve_failed", status));
  }
  if (instance) DnsServiceFreeInstance(instance);
  owner->ResolveFinished(context);
}

void WindowsBrowse::Resolve(const std::wstring& fqdn, DWORD interface_index) {
  auto* context = new ResolveContext();
  context->fqdn = fqdn;
  context->owner = this;
  context->request.Version = DNS_QUERY_REQUEST_VERSION1;
  context->request.InterfaceIndex = interface_index;
  context->request.QueryName = context->fqdn.data();
  context->request.pResolveCompletionCallback = ResolveCallback;
  context->request.pQueryContext = context;
  {
    std::lock_guard lock(mutex_);
    if (!active_.load()) { delete context; return; }
    resolves_.push_back(context);
  }
  DWORD status = DnsServiceResolve(&context->request, &context->cancel);
  if (status != DNS_REQUEST_PENDING) {
    sink_->Emit(ErrorEvent("desktop_dnssd_resolve_failed", status));
    ResolveFinished(context);
  }
}

void WindowsBrowse::ResolveFinished(ResolveContext* context) {
  {
    std::lock_guard lock(mutex_);
    resolves_.erase(std::remove(resolves_.begin(), resolves_.end(), context), resolves_.end());
  }
  delete context;
  cv_.notify_all();
}

void WINAPI WindowsBrowse::BrowseCallback(DWORD status, PVOID context, PDNS_RECORD records) {
  static_cast<WindowsBrowse*>(context)->OnBrowse(status, records);
}

void WindowsBrowse::OnBrowse(DWORD status, PDNS_RECORD records) {
  if (status == ERROR_CANCELLED) {
    { std::lock_guard lock(mutex_); browse_done_ = true; }
    cv_.notify_all();
  } else if (status != ERROR_SUCCESS) {
    sink_->Emit(ErrorEvent("desktop_dnssd_browse_failed", status));
  } else if (active_.load()) {
    for (PDNS_RECORD record = records; record; record = record->pNext) {
      if (record->wType != DNS_TYPE_PTR || !record->Data.PTR.pNameHost) continue;
      std::wstring fqdn = record->Data.PTR.pNameHost;
      if (record->dwTtl == 0) {
        DnsSdService service;
        service.fqdn = DnsSdUtf8(fqdn.c_str());
        service.interface_index = 0;
        sink_->Emit({{}, "lost", {}, std::move(service)});
      } else {
        Resolve(fqdn, 0);
      }
    }
  }
  if (records) DnsRecordListFree(records, DnsFreeRecordList);
}

void WindowsBrowse::Stop() {
  if (!active_.exchange(false)) return;
  DnsServiceBrowseCancel(&cancel_);
  std::vector<ResolveContext*> resolves;
  {
    std::lock_guard lock(mutex_);
    resolves = resolves_;
  }
  for (ResolveContext* context : resolves) DnsServiceResolveCancel(&context->cancel);
  std::unique_lock lock(mutex_);
  cv_.wait(lock, [this] { return browse_done_ && resolves_.empty(); });
  lock.unlock();
  sink_->Close();
}

class WindowsRegistration final : public NativeOperation {
 public:
  WindowsRegistration(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : NativeOperation(std::move(sink)), input_(input), name_(DnsSdWide(input.name + "." + input.type + "." + input.domain)),
        host_(DnsSdWide(input.host)) {
    for (const auto& [key, value] : input.txt) { keys_.push_back(DnsSdWide(key)); values_.push_back(DnsSdWide(value)); }
    for (auto& key : keys_) key_ptrs_.push_back(key.c_str());
    for (auto& value : values_) value_ptrs_.push_back(value.c_str());
    instance_ = DnsServiceConstructInstance(name_.c_str(), host_.empty() ? nullptr : host_.c_str(),
      nullptr, nullptr, input.port, 0, 0, key_ptrs_.size(), key_ptrs_.data(), value_ptrs_.data());
    request_.Version = DNS_QUERY_REQUEST_VERSION1;
    request_.pServiceInstance = instance_;
    request_.pRegisterCompletionCallback = RegisterCallback;
    request_.pQueryContext = this;
    DWORD status = instance_ ? DnsServiceRegister(&request_, &cancel_) : ERROR_INVALID_DATA;
    if (status != DNS_REQUEST_PENDING) { done_ = true; sink_->Emit(ErrorEvent("desktop_dnssd_register_failed", status)); }
  }
  ~WindowsRegistration() override { Stop(); }
  void Stop() override {
    if (!active_.exchange(false)) return;
    if (registered_) DnsServiceDeRegister(&request_, nullptr); else DnsServiceRegisterCancel(&cancel_);
    std::unique_lock lock(mutex_);
    cv_.wait(lock, [this] { return done_; });
    lock.unlock();
    if (instance_) DnsServiceFreeInstance(instance_);
    sink_->Close();
  }

 private:
  static void WINAPI RegisterCallback(DWORD status, PVOID context, PDNS_SERVICE_INSTANCE instance) {
    auto* self = static_cast<WindowsRegistration*>(context);
    if (instance) DnsServiceFreeInstance(instance);
    if (self->active_.load() && status == ERROR_SUCCESS) {
      self->registered_ = true;
      DnsSdService service; service.domain = self->input_.domain; service.fqdn = DnsSdUtf8(self->name_.c_str());
      service.host = self->input_.host; service.name = self->input_.name; service.port = self->input_.port;
      service.txt = self->input_.txt; service.type = self->input_.type;
      self->sink_->Emit({{}, "registered", {}, std::move(service)});
      return;
    }
    if (status != ERROR_SUCCESS && status != ERROR_CANCELLED) self->sink_->Emit(ErrorEvent("desktop_dnssd_register_failed", status));
    { std::lock_guard lock(self->mutex_); self->done_ = true; }
    self->cv_.notify_all();
  }

  std::atomic<bool> active_{true};
  DNS_SERVICE_CANCEL cancel_{};
  std::condition_variable cv_;
  bool done_ = false;
  std::wstring host_;
  DnsSdInput input_;
  PDNS_SERVICE_INSTANCE instance_ = nullptr;
  std::vector<std::wstring> keys_, values_;
  std::vector<PCWSTR> key_ptrs_, value_ptrs_;
  std::mutex mutex_;
  std::wstring name_;
  bool registered_ = false;
  DNS_SERVICE_REGISTER_REQUEST request_{};
};

}  // namespace

std::unique_ptr<NativeOperation> StartBrowse(const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_unique<WindowsBrowse>(input, std::move(sink));
}
std::unique_ptr<NativeOperation> StartRegistration(const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_unique<WindowsRegistration>(input, std::move(sink));
}
