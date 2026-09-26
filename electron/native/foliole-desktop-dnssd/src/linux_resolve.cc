#include <avahi-client/lookup.h>
#include <avahi-common/address.h>

#include "linux_operation.h"
#include "linux_service.h"

namespace {

class LinuxResolve final : public LinuxOperation {
 public:
  LinuxResolve(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : LinuxOperation(std::move(sink), "desktop_dnssd_resolve_failed"), input_(input) {}
  ~LinuxResolve() override { Stop(); }

 private:
  void Ready(AvahiClient* client) override {
    if (resolver_) return;
    resolver_ = avahi_service_resolver_new(client,
      input_.interface_index ? static_cast<AvahiIfIndex>(input_.interface_index) : AVAHI_IF_UNSPEC,
      AVAHI_PROTO_INET, input_.name.c_str(), input_.type.c_str(), input_.domain.c_str(),
      AVAHI_PROTO_INET, static_cast<AvahiLookupFlags>(0), ResolveCallback, this);
    if (!resolver_) Fail(avahi_client_errno(client));
  }

  void Release() override {
    if (resolver_) avahi_service_resolver_free(resolver_);
    resolver_ = nullptr;
  }

  static void ResolveCallback(AvahiServiceResolver* resolver, AvahiIfIndex interface,
    AvahiProtocol, AvahiResolverEvent event, const char* name, const char* type,
    const char* domain, const char* host, const AvahiAddress* address, uint16_t port,
    AvahiStringList* txt, AvahiLookupResultFlags, void* context) {
    auto* self = static_cast<LinuxResolve*>(context);
    if (!self->active()) return;
    if (event != AVAHI_RESOLVER_FOUND || !address) {
      self->Fail(avahi_client_errno(avahi_service_resolver_get_client(resolver)));
      return;
    }
    char address_text[AVAHI_ADDRESS_STR_MAX] = {};
    avahi_address_snprint(address_text, sizeof(address_text), address);
    DnsSdService service;
    service.addresses.emplace_back(address_text);
    service.domain = domain ? domain : "";
    service.fqdn = LinuxServiceName(name, type, domain);
    service.host = host ? host : "";
    service.interface_index = static_cast<uint32_t>(interface);
    service.name = name ? name : "";
    service.port = port;
    service.txt = LinuxTxtValues(txt);
    service.type = self->input_.type;
    self->sink_->Emit({{}, "found", {}, std::move(service)});
    self->sink_->DrainAndClose();
  }

  DnsSdInput input_;
  AvahiServiceResolver* resolver_ = nullptr;
};

}  // namespace

std::shared_ptr<NativeOperation> CreateResolve(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_shared<LinuxResolve>(input, std::move(sink));
}
