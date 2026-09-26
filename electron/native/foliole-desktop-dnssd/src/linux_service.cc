#include <avahi-common/domain.h>
#include <avahi-common/malloc.h>

#include "linux_service.h"

std::string LinuxServiceName(const char* name, const char* type, const char* domain) {
  char fullname[1024] = {};
  return avahi_service_name_join(fullname, sizeof(fullname), name, type, domain) < 0
    ? std::string() : std::string(fullname);
}

std::map<std::string, std::string> LinuxTxtValues(AvahiStringList* list) {
  std::map<std::string, std::string> values;
  for (auto* item = list; item; item = avahi_string_list_get_next(item)) {
    char* key = nullptr;
    char* value = nullptr;
    size_t size = 0;
    if (avahi_string_list_get_pair(item, &key, &value, &size) >= 0 && key && value) {
      values.emplace(key, std::string(value, size));
    }
    avahi_free(key);
    avahi_free(value);
  }
  return values;
}
