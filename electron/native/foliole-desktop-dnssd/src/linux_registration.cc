#include <avahi-client/publish.h>
#include <avahi-common/alternative.h>
#include <avahi-common/domain.h>
#include <avahi-common/malloc.h>
#include <avahi-common/strlst.h>

#include "linux_operation.h"
#include "linux_service.h"

namespace {

class LinuxRegistration final : public LinuxOperation {
 public:
  LinuxRegistration(const DnsSdInput& input, std::shared_ptr<EventSink> sink)
      : LinuxOperation(std::move(sink), "desktop_dnssd_register_failed"), input_(input),
        name_(input.name) {}
  ~LinuxRegistration() override { Stop(); }

 private:
  void Ready(AvahiClient* client) override {
    if (!group_) group_ = avahi_entry_group_new(client, GroupCallback, this);
    if (!group_) return Fail(avahi_client_errno(client));
    Publish();
  }

  void Publish() {
    if (!avahi_entry_group_is_empty(group_)) return;
    AvahiStringList* txt = nullptr;
    for (const auto& [key, value] : input_.txt) {
      txt = avahi_string_list_add_pair(txt, key.c_str(), value.c_str());
      if (!txt) return Fail(-1);
    }
    int result = avahi_entry_group_add_service_strlst(group_,
      input_.interface_index ? static_cast<AvahiIfIndex>(input_.interface_index) : AVAHI_IF_UNSPEC,
      AVAHI_PROTO_UNSPEC, static_cast<AvahiPublishFlags>(0), name_.c_str(),
      input_.type.c_str(), input_.domain.c_str(),
      input_.host.empty() ? nullptr : input_.host.c_str(), input_.port, txt);
    avahi_string_list_free(txt);
    if (result >= 0) result = avahi_entry_group_commit(group_);
    if (result < 0) Fail(result);
  }

  void Release() override {
    if (group_) avahi_entry_group_free(group_);
    group_ = nullptr;
  }

  static void GroupCallback(AvahiEntryGroup* group, AvahiEntryGroupState state,
    void* context) {
    auto* self = static_cast<LinuxRegistration*>(context);
    if (!self->active()) return;
    if (state == AVAHI_ENTRY_GROUP_FAILURE) {
      self->Fail(avahi_client_errno(avahi_entry_group_get_client(group)));
      return;
    }
    if (state == AVAHI_ENTRY_GROUP_COLLISION) {
      char* alternative = avahi_alternative_service_name(self->name_.c_str());
      if (!alternative) return self->Fail(-1);
      self->name_ = alternative;
      avahi_free(alternative);
      avahi_entry_group_reset(group);
      self->Publish();
      return;
    }
    if (state != AVAHI_ENTRY_GROUP_ESTABLISHED) return;
    AvahiClient* client = avahi_entry_group_get_client(group);
    DnsSdService service;
    service.domain = self->input_.domain;
    service.fqdn = LinuxServiceName(self->name_.c_str(), self->input_.type.c_str(),
      self->input_.domain.c_str());
    const char* host = avahi_client_get_host_name_fqdn(client);
    service.host = host ? host : "";
    service.name = self->name_;
    service.port = self->input_.port;
    service.txt = self->input_.txt;
    service.type = self->input_.type;
    self->sink_->Emit({{}, "registered", {}, std::move(service)});
  }

  AvahiEntryGroup* group_ = nullptr;
  DnsSdInput input_;
  std::string name_;
};

}  // namespace

std::shared_ptr<NativeOperation> CreateRegistration(
  const DnsSdInput& input, std::shared_ptr<EventSink> sink) {
  return std::make_shared<LinuxRegistration>(input, std::move(sink));
}
