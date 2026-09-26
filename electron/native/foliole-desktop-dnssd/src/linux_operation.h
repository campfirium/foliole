#pragma once

#include <avahi-client/client.h>
#include <avahi-common/thread-watch.h>

#include "backend.h"

class LinuxOperation : public NativeOperation {
 public:
  LinuxOperation(std::shared_ptr<EventSink> sink, const char* failure_code);
  ~LinuxOperation() override;
  void Start() override;
  void Stop() override;

 protected:
  virtual void Ready(AvahiClient* client) = 0;
  virtual void Release() = 0;
  void Fail(int error);
  bool active() const { return active_.load(); }
  std::atomic<bool> active_{true};

 private:
  static void ClientCallback(AvahiClient* client, AvahiClientState state, void* context);

  const char* failure_code_;
  AvahiThreadedPoll* poll_ = nullptr;
  AvahiClient* client_ = nullptr;
  bool started_ = false;
};
