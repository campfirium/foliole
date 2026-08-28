#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

#include "backend.h"

std::wstring DnsSdWide(const std::string& value) {
  if (value.empty()) return {};
  int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
    value.data(), static_cast<int>(value.size()), nullptr, 0);
  if (size <= 0) return {};
  std::wstring result(size, L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
    static_cast<int>(value.size()), result.data(), size);
  return result;
}

std::string DnsSdUtf8(const wchar_t* value) {
  if (!value || !*value) return {};
  int length = static_cast<int>(wcslen(value));
  int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS,
    value, length, nullptr, 0, nullptr, nullptr);
  if (size <= 0) return {};
  std::string result(size, '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value, length,
    result.data(), size, nullptr, nullptr);
  return result;
}

DnsSdService DnsSdServiceFromInstance(PDNS_SERVICE_INSTANCE instance) {
  DnsSdService service;
  if (!instance) return service;
  service.fqdn = DnsSdUtf8(instance->pszInstanceName);
  service.host = DnsSdUtf8(instance->pszHostName);
  service.interface_index = instance->dwInterfaceIndex;
  service.port = instance->wPort;
  service.domain = "local.";
  service.type = "_foliole-sync._tcp";
  size_t marker = service.fqdn.find("._foliole-sync._tcp");
  service.name = marker == std::string::npos ? service.fqdn : service.fqdn.substr(0, marker);
  if (instance->ip4Address) {
    IN_ADDR address{};
    address.S_un.S_addr = *instance->ip4Address;
    char text[INET_ADDRSTRLEN] = {};
    if (InetNtopA(AF_INET, &address, text, sizeof(text))) service.addresses.emplace_back(text);
  }
  for (DWORD index = 0; index < instance->dwPropertyCount && index < 32; ++index) {
    service.txt.emplace(DnsSdUtf8(instance->keys[index]), DnsSdUtf8(instance->values[index]));
  }
  return service;
}
