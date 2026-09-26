#include <avahi-client/lookup.h>

#include "linux_operation.h"
#include "linux_service.h"

namespace {

class LinuxBrowse final : public LinuxOperation {
 public:
  LinuxBrowse(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : LinuxOperation(std::move(sink), "desktop_dnssd_browse_failed"), input_(input) {}
  ~LinuxBrowse() override { Stop(); }

 private:
  void Ready(AvahiClient* client) override {
    if (browser_) return;
    browser_ = avahi_service_browser_new(client,
      input_.interface_index ? static_cast<AvahiIfIndex>(input_.interface_index) : AVAHI_IF_UNSPEC,
      AVAHI_PROTO_INET, input_.type.c_str(), input_.domain.c_str(),
      static_cast<AvahiLookupFlags>(0), BrowseCallback, this);
    if (!browser_) Fail(avahi_client_errno(client));
  }

  void Release() override {
    if (browser_) avahi_service_browser_free(browser_);
    browser_ = nullptr;
  }

  static void BrowseCallback(AvahiServiceBrowser* browser, AvahiIfIndex interface,
    AvahiProtocol, AvahiBrowserEvent event, const char* name, const char* type,
    const char* domain, AvahiLookupResultFlags, void* context) {
    auto* self = static_cast<LinuxBrowse*>(context);
    if (!self->active()) return;
    if (event == AVAHI_BROWSER_FAILURE) {
      self->Fail(avahi_client_errno(avahi_service_browser_get_client(browser)));
      return;
    }
    if (event != AVAHI_BROWSER_NEW && event != AVAHI_BROWSER_REMOVE) return;
    DnsSdService service;
    service.domain = domain ? domain : "";
    service.fqdn = LinuxServiceName(name, type, domain);
    service.interface_index = static_cast<uint32_t>(interface);
    service.name = name ? name : "";
    service.type = self->input_.type;
    self->sink_->Emit({{}, event == AVAHI_BROWSER_NEW ? "found" : "lost", {},
      std::move(service)});
  }

  AvahiServiceBrowser* browser_ = nullptr;
  DnsSdInput input_;
};

}  // namespace

std::shared_ptr<NativeOperation> CreateBrowse(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_shared<LinuxBrowse>(input, std::move(sink));
}
