<?php

return [
    'hub_public_host' => env('ONU_HUB_PUBLIC_HOST', '102.0.15.254'),
    'hub_vpn_host' => env('ONU_HUB_VPN_HOST', '10.88.0.1'),
    'hub_ssh_host' => env('ONU_HUB_SSH_HOST', '102.0.15.254'),
    'hub_ssh_user' => env('ONU_HUB_SSH_USER', 'joram'),
    'hub_ssh_password' => env('ONU_HUB_SSH_PASSWORD', env('HUB_SSH_PASSWORD', '')),
    // Legacy defaults (Faiba 2) — prefer gateways[] by router_id.
    'faiba_wg_ip' => env('ONU_FAIBA_WG_IP', '10.88.0.4'),
    'faiba_wg_pubkey' => env('ONU_FAIBA_WG_PUBKEY', '/dQgvikI50FT1JN6NrgjIUfpayFcF6GhtcWWyLa4w3U='),
    'http_port_base' => (int) env('ONU_HTTP_PORT_BASE', 13000),
    'port_span' => (int) env('ONU_PORT_SPAN', 12000),
    'proxy_mode' => env('ONU_PROXY_MODE', 'nginx'),
    'wg_iface' => env('ONU_NAS_WG_IFACE', 'wg-tcom'),
    // Default customer WAN pools when a gateway omits ppp_cidrs.
    'default_ppp_cidrs' => ['10.10.0.0/16'],
    /**
     * Hub WireGuard next-hop per routers.id (tonycomm.routers).
     * ppp_cidrs = PPPoE remote pools allowed for ONU web on that NAS.
     */
    'gateways' => [
        1 => [ // fiber clients (Main)
            'name' => 'fiber clients',
            'wg_ip' => env('ONU_MAIN_WG_IP', '10.88.0.3'),
            'wg_pubkey' => env('ONU_MAIN_WG_PUBKEY', 'Lrlyqr35Rg1VkpM4hfuCcDhxg2QRPdycrF3SJzZ/2G4='),
            'hosts' => ['102.0.25.70', '102.0.15.94', '102.0.15.249'],
            'ppp_cidrs' => ['10.10.0.0/16'],
        ],
        2 => [ // Fiber 3
            'name' => 'Fiber 3',
            'wg_ip' => env('ONU_FIBER3_WG_IP', '10.88.0.6'),
            'wg_pubkey' => env('ONU_FIBER3_WG_PUBKEY', 'sEc0wfaTDzKtNJkEdbIl0dPObY0y4mhcmRH5yokFPyM='),
            'hosts' => ['102.0.15.252', '102.0.29.196'],
            'ppp_cidrs' => ['10.10.0.0/16'],
        ],
        3 => [ // Faiba 2
            'name' => 'Faiba 2',
            'wg_ip' => env('ONU_FAIBA_WG_IP', '10.88.0.4'),
            'wg_pubkey' => env('ONU_FAIBA_WG_PUBKEY', '/dQgvikI50FT1JN6NrgjIUfpayFcF6GhtcWWyLa4w3U='),
            'hosts' => ['102.0.26.60'],
            'ppp_cidrs' => ['10.10.0.0/16'],
            'base_allowed_ips' => ['10.10.0.0/16', '102.0.15.250/32'],
        ],
        4 => [ // Faiba 4 — FTTX pool 172.168.86.5-254 (not 10.10)
            'name' => 'Faiba 4',
            'wg_ip' => env('ONU_FAIBA4_WG_IP', '10.88.0.7'),
            'wg_pubkey' => env('ONU_FAIBA4_WG_PUBKEY', 'Hpx7Dw3sJw3DZ4z4wtCT2FuHMdQpPcK+jwgQxNmRE3U='),
            'hosts' => ['102.0.15.253'],
            'ppp_cidrs' => ['172.168.86.0/24'],
            'base_allowed_ips' => ['172.168.86.0/24'],
        ],
    ],
];
