#include <arpa/inet.h>
#include <dns_sd.h>
#include <poll.h>

#include <chrono>
#include <thread>

#include "backend.h"

namespace {

std::map<std::string, std::string> DecodeTxt(
  uint16_t length, const unsigned char* bytes) {
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

void DNSSD_API AddressCallback(DNSServiceRef, DNSServiceFlags flags, uint32_t,
  DNSServiceErrorType error, const char*, const sockaddr* address, uint32_t, void* context) {
  auto* addresses = static_cast<std::vector<std::string>*>(context);
  if (error != kDNSServiceErr_NoError || !(flags & kDNSServiceFlagsAdd)
      || addresses->size() >= 16) return;
  char text[INET6_ADDRSTRLEN] = {};
  const void* raw = nullptr;
  if (address->sa_family == AF_INET) {
    raw = &reinterpret_cast<const sockaddr_in*>(address)->sin_addr;
  } else if (address->sa_family == AF_INET6) {
    raw = &reinterpret_cast<const sockaddr_in6*>(address)->sin6_addr;
  }
  if (raw && inet_ntop(address->sa_family, raw, text, sizeof(text))) {
    addresses->emplace_back(text);
  }
}

class MacResolve final : public NativeOperation {
 public:
  MacResolve(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : NativeOperation(std::move(sink)), input_(input),
        regtype_(input.type.ends_with(".") ? input.type : input.type + ".") {}

  void Start() override {
    DNSServiceErrorType error = DNSServiceResolve(&ref_, 0, input_.interface_index,
      input_.name.c_str(), regtype_.c_str(), input_.domain.c_str(),
      ResolveCallback, this);
    if (error != kDNSServiceErr_NoError) {
      FinishError(error);
      return;
    }
    std::thread([self = shared_from_this()] {
      static_cast<MacResolve*>(self.get())->Run();
    }).detach();
  }

  void Stop() override {
    if (!active_.exchange(false)) return;
    sink_->Close();
  }

 private:
  static void DNSSD_API ResolveCallback(DNSServiceRef, DNSServiceFlags,
    uint32_t interface_index, DNSServiceErrorType error, const char* fullname,
    const char* host, uint16_t port, uint16_t txt_length,
    const unsigned char* txt, void* context) {
    static_cast<MacResolve*>(context)->OnResolve(
      interface_index, error, fullname, host, port, txt_length, txt);
  }

  void FinishError(DNSServiceErrorType error) {
    active_ = false;
    sink_->Emit({"desktop_dnssd_resolve_failed", "error", std::to_string(error), {}});
    sink_->DrainAndClose();
  }

  void OnResolve(uint32_t interface_index, DNSServiceErrorType error,
    const char* fullname, const char* host, uint16_t port, uint16_t txt_length,
    const unsigned char* txt) {
    if (!active_.load()) return;
    if (error != kDNSServiceErr_NoError) {
      resolve_error_ = error;
      resolved_ = true;
      return;
    }
    service_.domain = input_.domain;
    service_.fqdn = fullname ? fullname : "";
    service_.host = host ? host : "";
    service_.interface_index = interface_index;
    service_.name = input_.name;
    service_.port = ntohs(port);
    service_.txt = DecodeTxt(txt_length, txt);
    service_.type = input_.type;
    resolved_ = true;
  }

  void Process(DNSServiceRef ref) {
    pollfd descriptor{DNSServiceRefSockFD(ref), POLLIN, 0};
    if (poll(&descriptor, 1, 50) > 0 && (descriptor.revents & POLLIN)) {
      DNSServiceProcessResult(ref);
    }
  }

  void ResolveAddresses() {
    DNSServiceRef address_ref = nullptr;
    DNSServiceErrorType error = DNSServiceGetAddrInfo(&address_ref, 0,
      service_.interface_index, kDNSServiceProtocol_IPv4 | kDNSServiceProtocol_IPv6,
      service_.host.c_str(), AddressCallback, &service_.addresses);
    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
    while (error == kDNSServiceErr_NoError && active_.load()
        && service_.addresses.empty() && std::chrono::steady_clock::now() < deadline) {
      Process(address_ref);
    }
    if (address_ref) DNSServiceRefDeallocate(address_ref);
    if (!active_.exchange(false)) return;
    if (error != kDNSServiceErr_NoError || service_.addresses.empty()) {
      sink_->Emit({"desktop_dnssd_address_failed", "error", std::to_string(error), {}});
    } else {
      sink_->Emit({{}, "found", {}, std::move(service_)});
    }
    sink_->DrainAndClose();
  }

  void Run() {
    while (active_.load() && !resolved_) Process(ref_);
    DNSServiceRefDeallocate(ref_);
    ref_ = nullptr;
    if (!active_.load()) return;
    if (resolve_error_ != kDNSServiceErr_NoError) {
      FinishError(resolve_error_);
      return;
    }
    ResolveAddresses();
  }

  std::atomic<bool> active_{true};
  DnsSdInput input_;
  DNSServiceRef ref_ = nullptr;
  std::string regtype_;
  bool resolved_ = false;
  DNSServiceErrorType resolve_error_ = kDNSServiceErr_NoError;
  DnsSdService service_;
};

}  // namespace

std::shared_ptr<NativeOperation> CreateResolve(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_shared<MacResolve>(input, std::move(sink));
}
