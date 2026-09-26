#include "linux_operation.h"

LinuxOperation::LinuxOperation(std::shared_ptr<EventSink> sink, const char* failure_code)
    : NativeOperation(std::move(sink)), failure_code_(failure_code) {}

LinuxOperation::~LinuxOperation() = default;

void LinuxOperation::Start() {
  poll_ = avahi_threaded_poll_new();
  if (!poll_) return Fail(-1);
  int error = 0;
  client_ = avahi_client_new(avahi_threaded_poll_get(poll_),
    static_cast<AvahiClientFlags>(0),
    ClientCallback, this, &error);
  if (!client_) return Fail(error);
  if (avahi_threaded_poll_start(poll_) < 0) return Fail(-1);
  started_ = true;
}

void LinuxOperation::Stop() {
  if (!active_.exchange(false)) return;
  sink_->Close();
  if (started_) avahi_threaded_poll_stop(poll_);
  Release();
  if (client_) avahi_client_free(client_);
  if (poll_) avahi_threaded_poll_free(poll_);
  client_ = nullptr;
  poll_ = nullptr;
}

void LinuxOperation::Fail(int error) {
  if (!active()) return;
  sink_->Emit({failure_code_, "error", std::to_string(error), {}});
  sink_->DrainAndClose();
}

void LinuxOperation::ClientCallback(
  AvahiClient* client, AvahiClientState state, void* context) {
  auto* operation = static_cast<LinuxOperation*>(context);
  if (!operation->active()) return;
  if (state == AVAHI_CLIENT_S_RUNNING) operation->Ready(client);
  else if (state == AVAHI_CLIENT_FAILURE) {
    operation->Fail(avahi_client_errno(client));
  }
}
