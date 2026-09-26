#pragma once

#include <avahi-common/strlst.h>

#include "backend.h"

std::string LinuxServiceName(const char* name, const char* type, const char* domain);
std::map<std::string, std::string> LinuxTxtValues(AvahiStringList* list);
