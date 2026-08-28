#include <arpa/inet.h>
#include <dns_sd.h>
#include <netdb.h>
#include <poll.h>

#include <chrono>
#include <cstring>
#include <set>
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
std::map<std::string, std::string> DecodeTxt(uint16_t length, const unsigned char* bytes) {
  std::map<std::string, std::string> values;
  uint16_t count = TXTRecordGetCount(length, bytes);
  for (uint16_t index = 0; index < count; ++index) {
    char key[64] = {};
    uint8_t value_length = 0;
    const void* value = nullptr;
    if (TXTRecordGetItemAtIndex(length, bytes, index, sizeof(key), key,
        &value_length, &value) != kDNSServiceErr_NoError) continue;
    values.emplace(key, std::string(static_cast<const char*>(value), value_length));
  }
  return values;
}
std::vector<std::string> ResolveIpv4(const std::string& host) {
  addrinfo hints{};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  addrinfo* results = nullptr;
  std::vector<std::string> addresses;
  if (getaddrinfo(host.c_str(), nullptr, &hints, &results) != 0) return addresses;
  for (addrinfo* item = results; item; item = item->ai_next) {
    char text[INET_ADDRSTRLEN] = {};
    auto* address = reinterpret_cast<sockaddr_in*>(item->ai_addr);
    if (inet_ntop(AF_INET, &address->sin_addr, text, sizeof(text))) addresses.emplace_back(text);
  }
  freeaddrinfo(results);
  return addresses;
}
struct ResolveResult {
  bool complete = false;
  DNSServiceErrorType error = kDNSServiceErr_NoError;
  DnsSdService service;
};

void DNSSD_API ResolveCallback(DNSServiceRef, DNSServiceFlags, uint32_t interface_index,
  DNSServiceErrorType error, const char* fullname, const char* host, uint16_t port,
  uint16_t txt_length, const unsigned char* txt, void* context) {
  auto* result = static_cast<ResolveResult*>(context);
  result->error = error;
  result->complete = true;
  if (error != kDNSServiceErr_NoError) return;
  result->service.fqdn = fullname ? fullname : "";
  result->service.host = host ? host : "";
  result->service.interface_index = interface_index;
  result->service.port = ntohs(port);
  result->service.txt = DecodeTxt(txt_length, txt);
  result->service.addresses = ResolveIpv4(result->service.host);
}

class MacBrowse final : public NativeOperation {
 public:
  MacBrowse(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : NativeOperation(std::move(sink)), input_(input) {
    DNSServiceErrorType error = DNSServiceBrowse(&ref_, 0, 0, input.type.c_str(),
      input.domain.c_str(), BrowseCallback, this);
    if (error != kDNSServiceErr_NoError) sink_->Emit(ErrorEvent("desktop_dnssd_browse_failed", error));
    else worker_ = std::thread([this] { Run(); });
  }
  ~MacBrowse() override { Stop(); }
  void Stop() override {
    if (!active_.exchange(false)) return;
    if (worker_.joinable()) worker_.join();
    sink_->Close();
  }

 private:
  static void DNSSD_API BrowseCallback(DNSServiceRef, DNSServiceFlags flags,
    uint32_t interface_index, DNSServiceErrorType error, const char* name,
    const char* type, const char* domain, void* context) {
    static_cast<MacBrowse*>(context)->OnBrowse(flags, interface_index, error, name, type, domain);
  }
  void Run() {
    while (active_.load()) {
      pollfd descriptor{DNSServiceRefSockFD(ref_), POLLIN, 0};
      if (poll(&descriptor, 1, 100) > 0 && (descriptor.revents & POLLIN)) {
        if (DNSServiceProcessResult(ref_) != kDNSServiceErr_NoError) break;
      }
    }
    DNSServiceRefDeallocate(ref_);
    ref_ = nullptr;
  }
  void OnBrowse(DNSServiceFlags flags, uint32_t interface_index, DNSServiceErrorType error,
    const char* name, const char* type, const char* domain) {
    if (!active_.load()) return;
    if (error != kDNSServiceErr_NoError) {
      sink_->Emit(ErrorEvent("desktop_dnssd_browse_failed", error));
      return;
    }
    char fullname[kDNSServiceMaxDomainName] = {};
    DNSServiceConstructFullName(fullname, name, type, domain);
    if (!(flags & kDNSServiceFlagsAdd)) {
      DnsSdService service;
      service.domain = domain; service.fqdn = fullname; service.interface_index = interface_index;
      service.name = name; service.type = type;
      known_.erase(service.fqdn);
      sink_->Emit({{}, "lost", {}, std::move(service)});
      return;
    }
    Resolve(name, type, domain, interface_index);
  }
  void Resolve(const char* name, const char* type, const char* domain, uint32_t interface_index) {
    DNSServiceRef resolve_ref = nullptr;
    ResolveResult result;
    char fullname[kDNSServiceMaxDomainName] = {};
    DNSServiceConstructFullName(fullname, name, type, domain);
    DNSServiceErrorType error = DNSServiceResolve(&resolve_ref, 0, interface_index,
      name, type, domain, ResolveCallback, &result);
    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    while (error == kDNSServiceErr_NoError && active_.load() && !result.complete
      && std::chrono::steady_clock::now() < deadline) {
      pollfd descriptor{DNSServiceRefSockFD(resolve_ref), POLLIN, 0};
      if (poll(&descriptor, 1, 100) > 0 && (descriptor.revents & POLLIN)) {
        error = DNSServiceProcessResult(resolve_ref);
      }
    }
    if (resolve_ref) DNSServiceRefDeallocate(resolve_ref);
    if (error != kDNSServiceErr_NoError || !result.complete
      || result.error != kDNSServiceErr_NoError || result.service.addresses.empty()) {
      if (known_.contains(fullname)) return;
      sink_->Emit(ErrorEvent("desktop_dnssd_resolve_failed",
        error != kDNSServiceErr_NoError ? error : result.error));
      return;
    }
    result.service.domain = domain; result.service.name = name; result.service.type = type;
    bool inserted = known_.insert(result.service.fqdn).second;
    sink_->Emit({{}, inserted ? "found" : "changed", {}, std::move(result.service)});
  }

  std::atomic<bool> active_{true};
  DnsSdInput input_;
  std::set<std::string> known_;
  DNSServiceRef ref_ = nullptr;
  std::thread worker_;
};

class MacRegistration final : public NativeOperation {
 public:
  MacRegistration(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : NativeOperation(std::move(sink)), input_(input), txt_(EncodeTxt(input.txt)) {
    DNSServiceErrorType error = DNSServiceRegister(&ref_, 0, 0, input.name.c_str(),
      input.type.c_str(), input.domain.c_str(), input.host.empty() ? nullptr : input.host.c_str(),
      htons(input.port), txt_.size(), txt_.data(), RegisterCallback, this);
    if (error != kDNSServiceErr_NoError) sink_->Emit(ErrorEvent("desktop_dnssd_register_failed", error));
    else worker_ = std::thread([this] { Run(); });
  }
  ~MacRegistration() override { Stop(); }
  void Stop() override {
    if (!active_.exchange(false)) return;
    if (worker_.joinable()) worker_.join();
    sink_->Close();
  }

 private:
  static void DNSSD_API RegisterCallback(DNSServiceRef, DNSServiceFlags, DNSServiceErrorType error,
    const char* name, const char* type, const char* domain, void* context) {
    auto* self = static_cast<MacRegistration*>(context);
    if (!self->active_.load()) return;
    if (error != kDNSServiceErr_NoError) {
      self->sink_->Emit(ErrorEvent("desktop_dnssd_register_failed", error));
      return;
    }
    DnsSdService service;
    service.domain = domain; service.name = name; service.port = self->input_.port;
    service.txt = self->input_.txt; service.type = type;
    char fullname[kDNSServiceMaxDomainName] = {};
    DNSServiceConstructFullName(fullname, name, type, domain);
    service.fqdn = fullname;
    self->sink_->Emit({{}, "registered", {}, std::move(service)});
  }
  void Run() {
    while (active_.load()) {
      pollfd descriptor{DNSServiceRefSockFD(ref_), POLLIN, 0};
      if (poll(&descriptor, 1, 100) > 0 && (descriptor.revents & POLLIN)) {
        if (DNSServiceProcessResult(ref_) != kDNSServiceErr_NoError) break;
      }
    }
    DNSServiceRefDeallocate(ref_);
    ref_ = nullptr;
  }

  std::atomic<bool> active_{true};
  DnsSdInput input_;
  DNSServiceRef ref_ = nullptr;
  std::thread worker_;
  std::vector<uint8_t> txt_;
};

}  // namespace

std::unique_ptr<NativeOperation> StartBrowse(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_unique<MacBrowse>(input, std::move(sink));
}

std::unique_ptr<NativeOperation> StartRegistration(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_unique<MacRegistration>(input, std::move(sink));
}
