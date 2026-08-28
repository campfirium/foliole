#include <arpa/inet.h>
#include <dns_sd.h>
#include <poll.h>

#include <thread>

#include "backend.h"

namespace {

DnsSdEvent ErrorEvent(const char* code, DNSServiceErrorType error) {
  return {code, "error", std::to_string(error), {}};
}

std::vector<uint8_t> EncodeTxt(const std::map<std::string, std::string>& values) {
  std::vector<uint8_t> bytes;
  for (const auto& [key, value] : values) {
    std::string entry = key + "=" + value;
    bytes.push_back(static_cast<uint8_t>(entry.size()));
    bytes.insert(bytes.end(), entry.begin(), entry.end());
  }
  return bytes;
}

class MacBrowse final : public NativeOperation {
 public:
  MacBrowse(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : NativeOperation(std::move(sink)), input_(input) {}

  void Start() override {
    DNSServiceErrorType error = DNSServiceBrowse(&ref_, 0, input_.interface_index,
      input_.type.c_str(), input_.domain.c_str(), BrowseCallback, this);
    if (error != kDNSServiceErr_NoError) {
      active_ = false;
      sink_->Emit(ErrorEvent("desktop_dnssd_browse_failed", error));
      sink_->DrainAndClose();
      return;
    }
    std::thread([self = shared_from_this()] {
      static_cast<MacBrowse*>(self.get())->Run();
    }).detach();
  }

  void Stop() override {
    if (!active_.exchange(false)) return;
    sink_->Close();
  }

 private:
  static void DNSSD_API BrowseCallback(DNSServiceRef, DNSServiceFlags flags,
    uint32_t interface_index, DNSServiceErrorType error, const char* name,
    const char* type, const char* domain, void* context) {
    static_cast<MacBrowse*>(context)->OnBrowse(
      flags, interface_index, error, name, type, domain);
  }

  void Run() {
    while (active_.load()) {
      pollfd descriptor{DNSServiceRefSockFD(ref_), POLLIN, 0};
      if (poll(&descriptor, 1, 50) <= 0 || !(descriptor.revents & POLLIN)) continue;
      DNSServiceErrorType error = DNSServiceProcessResult(ref_);
      if (error == kDNSServiceErr_NoError) continue;
      if (active_.exchange(false)) {
        sink_->Emit(ErrorEvent("desktop_dnssd_browse_failed", error));
        sink_->DrainAndClose();
      }
    }
    DNSServiceRefDeallocate(ref_);
    ref_ = nullptr;
  }

  void OnBrowse(DNSServiceFlags flags, uint32_t interface_index,
    DNSServiceErrorType error, const char* name, const char* type, const char* domain) {
    if (!active_.load()) return;
    if (error != kDNSServiceErr_NoError) {
      sink_->Emit(ErrorEvent("desktop_dnssd_browse_failed", error));
      return;
    }
    DnsSdService service;
    service.domain = domain ? domain : "";
    service.interface_index = interface_index;
    service.name = name ? name : "";
    service.type = type ? type : "";
    char fullname[kDNSServiceMaxDomainName] = {};
    if (DNSServiceConstructFullName(fullname, name, type, domain) == kDNSServiceErr_NoError) {
      service.fqdn = fullname;
    }
    sink_->Emit({{}, flags & kDNSServiceFlagsAdd ? "found" : "lost", {},
      std::move(service)});
  }

  std::atomic<bool> active_{true};
  DnsSdInput input_;
  DNSServiceRef ref_ = nullptr;
};

class MacRegistration final : public NativeOperation {
 public:
  MacRegistration(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : NativeOperation(std::move(sink)), input_(input), txt_(EncodeTxt(input.txt)) {}

  void Start() override {
    DNSServiceErrorType error = DNSServiceRegister(&ref_, 0, input_.interface_index,
      input_.name.c_str(), input_.type.c_str(), input_.domain.c_str(),
      input_.host.empty() ? nullptr : input_.host.c_str(), htons(input_.port),
      txt_.size(), txt_.data(), RegisterCallback, this);
    if (error != kDNSServiceErr_NoError) {
      active_ = false;
      sink_->Emit(ErrorEvent("desktop_dnssd_register_failed", error));
      sink_->DrainAndClose();
      return;
    }
    std::thread([self = shared_from_this()] {
      static_cast<MacRegistration*>(self.get())->Run();
    }).detach();
  }

  void Stop() override {
    if (!active_.exchange(false)) return;
    sink_->Close();
  }

 private:
  static void DNSSD_API RegisterCallback(DNSServiceRef, DNSServiceFlags,
    DNSServiceErrorType error, const char* name, const char* type,
    const char* domain, void* context) {
    static_cast<MacRegistration*>(context)->OnRegister(error, name, type, domain);
  }

  void OnRegister(DNSServiceErrorType error, const char* name,
    const char* type, const char* domain) {
    if (!active_.load()) return;
    if (error != kDNSServiceErr_NoError) {
      sink_->Emit(ErrorEvent("desktop_dnssd_register_failed", error));
      return;
    }
    DnsSdService service;
    service.domain = domain ? domain : "";
    service.name = name ? name : "";
    service.port = input_.port;
    service.txt = input_.txt;
    service.type = type ? type : "";
    char fullname[kDNSServiceMaxDomainName] = {};
    if (DNSServiceConstructFullName(fullname, name, type, domain) == kDNSServiceErr_NoError) {
      service.fqdn = fullname;
    }
    sink_->Emit({{}, "registered", {}, std::move(service)});
  }

  void Run() {
    while (active_.load()) {
      pollfd descriptor{DNSServiceRefSockFD(ref_), POLLIN, 0};
      if (poll(&descriptor, 1, 50) <= 0 || !(descriptor.revents & POLLIN)) continue;
      DNSServiceErrorType error = DNSServiceProcessResult(ref_);
      if (error == kDNSServiceErr_NoError) continue;
      if (active_.exchange(false)) {
        sink_->Emit(ErrorEvent("desktop_dnssd_register_failed", error));
        sink_->DrainAndClose();
      }
    }
    DNSServiceRefDeallocate(ref_);
    ref_ = nullptr;
  }

  std::atomic<bool> active_{true};
  DnsSdInput input_;
  DNSServiceRef ref_ = nullptr;
  std::vector<uint8_t> txt_;
};

}  // namespace

std::shared_ptr<NativeOperation> CreateBrowse(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_shared<MacBrowse>(input, std::move(sink));
}

std::shared_ptr<NativeOperation> CreateRegistration(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_shared<MacRegistration>(input, std::move(sink));
}
