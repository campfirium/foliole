import { describe, expect, it } from 'vitest';

import { resolveCompanionMdnsDiscoveryInterfaces } from './companionMdnsNetworkInterfaces.js';

describe('companion mDNS discovery interfaces', () => {
  it('listens on the default route and every external IPv4 interface', () => {
    expect(resolveCompanionMdnsDiscoveryInterfaces({
      ethernet: [
        { address: '192.168.0.11', cidr: '192.168.0.11/24', family: 'IPv4', internal: false,
          mac: '00:00:00:00:00:01', netmask: '255.255.255.0' },
        { address: '127.0.0.1', cidr: '127.0.0.1/8', family: 'IPv4', internal: true,
          mac: '00:00:00:00:00:00', netmask: '255.0.0.0' }
      ],
      vpn: [
        { address: '198.18.0.1', cidr: '198.18.0.1/15', family: 'IPv4', internal: false,
          mac: '00:00:00:00:00:02', netmask: '255.254.0.0' }
      ]
    })).toEqual([undefined, '192.168.0.11', '198.18.0.1']);
  });
});
