<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

/**
 * Hub public ONU access via nginx reverse proxy.
 *
 * Plain DNAT breaks because ONU portals redirect browsers to private
 * https://10.10.x.x/ — nginx rewrites Location + HTML so clients stay on
 * http://{hub}:{port}/.
 *
 * Huawei HG8546M often serves the real UI on https://WAN:80 (TLS on port 80)
 * with legacy renegotiation; plain http://WAN/ is only a JS bounce that
 * infinite-loops if rewritten onto the same public HTTP URL.
 */
class HubOnuProxyService
{
    public function ensureBaseHubRules(): void
    {
        $password = config('onu.hub_ssh_password');
        if ($password === '') {
            return;
        }

        $host = config('onu.hub_public_host');
        $faibaWgIp = config('onu.faiba_wg_ip');
        $faibaPubkey = config('onu.faiba_wg_pubkey');
        $portBase = (int) config('onu.http_port_base');
        $portEnd = $portBase + (int) config('onu.port_span') + 1;
        $sudoPass = addslashes($password);

        $remote = <<<BASH
echo '{$sudoPass}' | sudo -S bash -lc '
set -e
export DEBIAN_FRONTEND=noninteractive
if ! command -v nginx >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq nginx
fi
if [ ! -f /etc/nginx/onu-proxy.crt ]; then
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/onu-proxy.key -out /etc/nginx/onu-proxy.crt \
    -subj "/CN={$host}" >/dev/null 2>&1
fi
# OpenSSL 3 blocks Huawei legacy renegotiation unless enabled.
cat > /etc/nginx/onu-legacy-ssl.cnf <<EOF
openssl_conf = openssl_init
[openssl_init]
ssl_conf = ssl_sect
[ssl_sect]
system_default = system_default_sect
[system_default_sect]
Options = UnsafeLegacyRenegotiation
CipherString = DEFAULT:@SECLEVEL=0
EOF
mkdir -p /etc/nginx/onu-proxies.d
if ! grep -q "onu-proxies.d" /etc/nginx/nginx.conf; then
  sed -i "/http {{/a\\    include /etc/nginx/onu-proxies.d/*.conf;" /etc/nginx/nginx.conf
fi
if ! grep -q "Environment=OPENSSL_CONF=/etc/nginx/onu-legacy-ssl.cnf" /lib/systemd/system/nginx.service 2>/dev/null \\
   && ! grep -q "onu-legacy-ssl.cnf" /etc/systemd/system/nginx.service.d/*.conf 2>/dev/null; then
  mkdir -p /etc/systemd/system/nginx.service.d
  printf "%s\\n" "[Service]" "Environment=OPENSSL_CONF=/etc/nginx/onu-legacy-ssl.cnf" \\
    > /etc/systemd/system/nginx.service.d/onu-legacy-ssl.conf
  systemctl daemon-reload
fi

# Remove legacy DNAT for ONU publish ports (nginx listens directly).
for chain in PREROUTING OUTPUT; do
  while true; do
    line=\$(iptables -t nat -L "\$chain" -n --line-numbers 2>/dev/null | awk -v b={$portBase} -v e={$portEnd} "
      /DNAT/ && /{$host}/ {{
        for (i = 1; i <= NF; i++) if (\$i ~ /^dpt:/) {{
          split(\$i, a, \":\"); p = a[2] + 0;
          if (p >= b && p <= e) {{ print \$1; exit }}
        }}
      }}")
    [ -z "\$line" ] && break
    iptables -t nat -D "\$chain" "\$line"
  done
done

ip route replace 10.10.0.0/16 via {$faibaWgIp} dev wg0
wg set wg0 peer {$faibaPubkey} allowed-ips {$faibaWgIp}/32,102.0.15.250/32,10.10.0.0/16 2>/dev/null || true
iptables -C INPUT -p tcp -d {$host} --dport {$portBase}:{$portEnd} -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp -d {$host} --dport {$portBase}:{$portEnd} -j ACCEPT
if command -v ufw >/dev/null 2>&1; then
  ufw status | grep -q "{$portBase}:{$portEnd}/tcp" || ufw allow {$portBase}:{$portEnd}/tcp comment 'ONU nginx proxies'
fi
iptables -C FORWARD -o wg0 -d 10.10.0.0/16 -p tcp -m multiport --dports 80,443 -j ACCEPT 2>/dev/null || iptables -A FORWARD -o wg0 -d 10.10.0.0/16 -p tcp -m multiport --dports 80,443 -j ACCEPT
iptables -C FORWARD -i wg0 -s 10.10.0.0/16 -p tcp -m multiport --sports 80,443 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || iptables -A FORWARD -i wg0 -s 10.10.0.0/16 -p tcp -m multiport --sports 80,443 -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -t nat -C POSTROUTING -o wg0 -d 10.10.0.0/16 -p tcp -m multiport --dports 80,443 -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -o wg0 -d 10.10.0.0/16 -p tcp -m multiport --dports 80,443 -j MASQUERADE
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx
echo OK onu-nginx-base
'
BASH;

        $this->runSsh($remote, 180);
    }

    /**
     * Hub-side port probe. Prefer https80 (Huawei) over plain http bounce pages.
     *
     * @return array{http:bool,https:bool,https80:bool,mode:string}
     */
    public function probeUpstreamWeb(string $targetIp): array
    {
        $password = config('onu.hub_ssh_password');
        if ($password === '' || !filter_var($targetIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return ['http' => false, 'https' => true, 'https80' => false, 'mode' => 'https'];
        }

        $sudoPass = addslashes($password);
        $remote = <<<BASH
echo '{$sudoPass}' | sudo -S bash -lc '
http=0; https=0; https80=0
if [ -f /etc/nginx/onu-legacy-ssl.cnf ]; then export OPENSSL_CONF=/etc/nginx/onu-legacy-ssl.cnf; fi
if [ -z "\$OPENSSL_CONF" ]; then
  cat > /tmp/onu_legacy_ssl.cnf <<EOF
openssl_conf = openssl_init
[openssl_init]
ssl_conf = ssl_sect
[ssl_sect]
system_default = system_default_sect
[system_default_sect]
Options = UnsafeLegacyRenegotiation
CipherString = DEFAULT:@SECLEVEL=0
EOF
  export OPENSSL_CONF=/tmp/onu_legacy_ssl.cnf
fi
# Parallel probes (Huawei often only answers https://WAN:80).
curl -sS -m 2 -o /dev/null -w "%{http_code}" --connect-timeout 1 "http://{$targetIp}/" >/tmp/p_http 2>/dev/null &
curl -sS -m 2 -o /dev/null -w "%{http_code}" -k --connect-timeout 1 "https://{$targetIp}/" >/tmp/p_https 2>/dev/null &
curl -sS -m 3 -o /dev/null -w "%{http_code}" -k --connect-timeout 2 "https://{$targetIp}:80/" >/tmp/p_https80 2>/dev/null &
wait
code=\$(cat /tmp/p_http 2>/dev/null || true); [ -n "\$code" ] && [ "\$code" != "000" ] && http=1
code=\$(cat /tmp/p_https 2>/dev/null || true); [ -n "\$code" ] && [ "\$code" != "000" ] && https=1
code=\$(cat /tmp/p_https80 2>/dev/null || true); [ -n "\$code" ] && [ "\$code" != "000" ] && https80=1
mode=none
[ "\$http" = 1 ] && mode=http
[ "\$https" = 1 ] && mode=https
[ "\$https80" = 1 ] && mode=https80
echo "PROBE http=\$http https=\$https https80=\$https80 mode=\$mode"
'
BASH;

        try {
            $result = $this->runSsh($remote, 30);
            $out = trim($result->output() . "\n" . $result->errorOutput());
            $http = (bool) preg_match('/PROBE http=1/', $out);
            $https = (bool) preg_match('/PROBE https=1/', $out);
            $https80 = (bool) preg_match('/PROBE https80=1/', $out);
            $mode = 'http';
            if (preg_match('/mode=(https80|https|http|none)/', $out, $m)) {
                $mode = $m[1];
            }

            return [
                'http' => $http,
                'https' => $https,
                'https80' => $https80,
                'mode' => $mode,
            ];
        } catch (\Throwable $e) {
            Log::warning('ONU hub probe failed', ['ip' => $targetIp, 'error' => $e->getMessage()]);

            return ['http' => false, 'https' => true, 'https80' => false, 'mode' => 'https'];
        }
    }

    /**
     * Install hub /32 route + WireGuard allowed-ips for this customer WAN IP.
     * More-specific /32 beats another peer's /16 so Main/Faiba/Fiber3 coexist.
     *
     * @param  array{wg_ip:string,wg_pubkey:string,base_allowed_ips?:array<int,string>}  $gateway
     */
    public function ensureCustomerPath(string $targetIp, array $gateway): array
    {
        if (!filter_var($targetIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return ['ok' => false, 'message' => 'Invalid customer WAN IP.'];
        }

        $wgIp = $gateway['wg_ip'] ?? '';
        $pubkey = $gateway['wg_pubkey'] ?? '';
        if ($wgIp === '' || $pubkey === '' || !filter_var($wgIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return ['ok' => false, 'message' => 'Router has no WireGuard hub path configured for ONU access.'];
        }

        $password = config('onu.hub_ssh_password');
        if ($password === '') {
            return ['ok' => false, 'message' => 'Hub SSH is not configured (ONU_HUB_SSH_PASSWORD).'];
        }

        $base = $gateway['base_allowed_ips'] ?? [];
        if (!is_array($base)) {
            $base = [];
        }
        // Always keep tunnel IP; optional sticky nets (e.g. Faiba 10.10.0.0/16).
        $baseList = array_values(array_unique(array_filter(array_merge(
            [$wgIp . '/32'],
            $base,
            [$targetIp . '/32']
        ))));
        $baseCsv = implode(',', $baseList);

        $sudoPass = addslashes($password);
        $pubEsc = addslashes($pubkey);
        // Space-separated sticky nets for shell looping (avoid fragile bash functions).
        $baseSpace = implode(' ', $baseList);
        $remote = <<<BASH
echo '{$sudoPass}' | sudo -S bash -lc '
set -e
PUB="{$pubEsc}"
IP="{$targetIp}"
VIA="{$wgIp}"
# Tab field 2 = current allowed-ips (space-separated).
CUR=\$(wg show wg0 allowed-ips | grep -F "\$PUB" | cut -f2- | tr "," " ")
MERGED=\$(printf "%s\\n" \$CUR {$baseSpace} | sed "/^\$/d" | sort -u | paste -sd,)
wg set wg0 peer "\$PUB" allowed-ips "\$MERGED"
ip route replace "\$IP/32" via "\$VIA" dev wg0
echo OK path \$IP via \$VIA merged=\$MERGED
'
BASH;

        try {
            $result = $this->runSsh($remote, 45);
            $out = trim($result->output() . "\n" . $result->errorOutput());
            if (!$result->successful() || !str_contains($out, 'OK path')) {
                Log::warning('ONU hub path failed', ['ip' => $targetIp, 'via' => $wgIp, 'output' => $out]);

                return ['ok' => false, 'message' => 'Could not install hub WireGuard route to customer WAN.', 'hub_output' => $out];
            }

            return ['ok' => true, 'via' => $wgIp, 'hub_output' => $out];
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => 'Hub path SSH failed: ' . $e->getMessage()];
        }
    }

    /**
     * @param  string  $upstreamMode  http|https|https80
     * @param  array{wg_ip?:string,wg_pubkey?:string}|null  $gateway
     */
    public function ensureCustomerProxy(int $serviceId, string $targetIp, string $upstreamMode = 'https', ?array $gateway = null): array
    {
        // Base hub (nginx/UFW/WG/legacy SSL) is provisioned by ops — skip heavy loops here.

        $host = config('onu.hub_public_host');
        $httpPort = $this->httpPort($serviceId);
        $httpsPort = $httpPort + 1;

        if (!filter_var($targetIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return ['ok' => false, 'message' => 'Invalid customer WAN IP.'];
        }

        $password = config('onu.hub_ssh_password');
        if ($password === '') {
            return [
                'ok' => false,
                'message' => 'Hub SSH is not configured (ONU_HUB_SSH_PASSWORD).',
                'http_port' => $httpPort,
                'https_port' => $httpsPort,
            ];
        }

        if (!in_array($upstreamMode, ['http', 'https', 'https80'], true)) {
            $upstreamMode = 'https';
        }

        if ($gateway) {
            $path = $this->ensureCustomerPath($targetIp, $gateway);
            if (!($path['ok'] ?? false)) {
                return array_merge($path, [
                    'http_port' => $httpPort,
                    'https_port' => $httpsPort,
                ]);
            }
        }

        $this->ensureLegacySslOnHub();

        $conf = $this->buildNginxConf($host, $httpPort, $httpsPort, $targetIp, $upstreamMode, $serviceId);
        $b64 = base64_encode($conf);
        $sudoPass = addslashes($password);
        $confPath = "/etc/nginx/onu-proxies.d/svc-{$serviceId}.conf";
        $via = $gateway['wg_ip'] ?? config('onu.faiba_wg_ip');

        $remote = <<<BASH
echo '{$sudoPass}' | sudo -S bash -lc '
set -e
mkdir -p /etc/nginx/onu-proxies.d
# Apache owns :80/:443 on this hub — never let nginx default site fight it.
rm -f /etc/nginx/sites-enabled/default
# Bulk all.conf duplicates per-service listeners; keep it disabled.
[ -f /etc/nginx/onu-proxies.d/all.conf ] && mv /etc/nginx/onu-proxies.d/all.conf /etc/nginx/onu-proxies.d/all.conf.disabled || true
echo {$b64} | base64 -d > {$confPath}
# Prefer /32 (installed by ensureCustomerPath). Keep Faiba /16 only as soft fallback.
ip route replace {$targetIp}/32 via {$via} dev wg0 2>/dev/null || true
nginx -t
systemctl reload nginx || systemctl restart nginx
echo OK onu-svc-{$serviceId} {$targetIp} ports {$httpPort}/{$httpsPort} mode={$upstreamMode} via={$via}
'
BASH;

        try {
            $result = $this->runSsh($remote, 120);
        } catch (\Throwable $e) {
            Log::warning('ONU hub proxy: SSH failed', ['service_id' => $serviceId, 'error' => $e->getMessage()]);

            return [
                'ok' => false,
                'message' => 'Could not configure hub public proxy: ' . $e->getMessage(),
                'http_port' => $httpPort,
                'https_port' => $httpsPort,
            ];
        }

        $output = trim($result->output() . "\n" . $result->errorOutput());
        if (!$result->successful() || !str_contains($output, 'OK onu-svc-' . $serviceId)) {
            Log::warning('ONU hub proxy: hub command failed', [
                'service_id' => $serviceId,
                'output' => $output,
            ]);

            return [
                'ok' => false,
                'message' => 'Hub nginx proxy update failed.',
                'http_port' => $httpPort,
                'https_port' => $httpsPort,
                'hub_output' => $output,
            ];
        }

        return [
            'ok' => true,
            'mode' => 'nginx',
            'upstream_mode' => $upstreamMode,
            'http_port' => $httpPort,
            'https_port' => $httpsPort,
            'https_available' => in_array($upstreamMode, ['https', 'https80'], true),
            'public_url' => "http://{$host}:{$httpPort}/",
        ];
    }

    public function httpPort(int $serviceId): int
    {
        return (int) config('onu.http_port_base') + $serviceId;
    }

    /** Idempotent: OPENSSL_CONF for nginx so Huawei TLS-on-80 works. */
    private function ensureLegacySslOnHub(): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;

        $password = config('onu.hub_ssh_password');
        if ($password === '') {
            return;
        }
        $sudoPass = addslashes($password);
        $remote = <<<BASH
echo '{$sudoPass}' | sudo -S bash -lc '
set -e
cat > /etc/nginx/onu-legacy-ssl.cnf <<EOF
openssl_conf = openssl_init
[openssl_init]
ssl_conf = ssl_sect
[ssl_sect]
system_default = system_default_sect
[system_default_sect]
Options = UnsafeLegacyRenegotiation
CipherString = DEFAULT:@SECLEVEL=0
EOF
mkdir -p /etc/systemd/system/nginx.service.d
if ! grep -q onu-legacy-ssl.cnf /etc/systemd/system/nginx.service.d/*.conf 2>/dev/null; then
  printf "%s\\n" "[Service]" "Environment=OPENSSL_CONF=/etc/nginx/onu-legacy-ssl.cnf" \\
    > /etc/systemd/system/nginx.service.d/onu-legacy-ssl.conf
  systemctl daemon-reload
  systemctl restart nginx
  echo OK legacy-ssl-installed
else
  echo OK legacy-ssl-present
fi
'
BASH;
        try {
            $this->runSsh($remote, 60);
        } catch (\Throwable $e) {
            Log::warning('ONU hub legacy SSL setup failed', ['error' => $e->getMessage()]);
        }
    }

    private function buildNginxConf(
        string $host,
        int $httpPort,
        int $httpsPort,
        string $targetIp,
        string $upstreamMode,
        int $serviceId
    ): string {
        $pubHttp = "http://{$host}:{$httpPort}";
        $pubHttps = "https://{$host}:{$httpsPort}";

        if ($upstreamMode === 'https80') {
            $upstream = "https://{$targetIp}:80";
            $sslVerify = "proxy_ssl_verify off;\n        proxy_ssl_server_name on;\n        proxy_ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;";
        } elseif ($upstreamMode === 'https') {
            $upstream = "https://{$targetIp}";
            $sslVerify = "proxy_ssl_verify off;\n        proxy_ssl_server_name on;\n        proxy_ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;";
        } else {
            $upstream = "http://{$targetIp}";
            $sslVerify = '';
        }

        // Escaped-dot form used in Huawei JS: 10\x2e10\x2e...
        $escapedIp = str_replace('.', '\\x2e', $targetIp);

        $common = <<<NGINX
        proxy_http_version 1.1;
        proxy_connect_timeout 4s;
        proxy_send_timeout 45s;
        proxy_read_timeout 45s;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_set_header Host {$targetIp};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host {$host}:\$server_port;
        proxy_set_header Accept-Encoding "";
        {$sslVerify}
        proxy_redirect http://{$targetIp}/ {$pubHttp}/;
        proxy_redirect https://{$targetIp}/ {$pubHttp}/;
        proxy_redirect http://{$targetIp}:80/ {$pubHttp}/;
        proxy_redirect https://{$targetIp}:80/ {$pubHttp}/;
        proxy_redirect https://{$targetIp}:443/ {$pubHttp}/;
        proxy_redirect ~^https?://{$targetIp}(?::\\d+)?(/.*)?\$ {$pubHttp}\$1;
        sub_filter 'https://{$targetIp}:443' '{$pubHttp}';
        sub_filter 'https://{$targetIp}:80' '{$pubHttp}';
        sub_filter 'http://{$targetIp}:80' '{$pubHttp}';
        sub_filter 'https://{$targetIp}' '{$pubHttp}';
        sub_filter 'http://{$targetIp}' '{$pubHttp}';
        sub_filter '{$targetIp}' '{$host}:{$httpPort}';
        sub_filter '{$escapedIp}' '{$host}';
        sub_filter 'window.location="https://" + SSLHostIp + ":" + SSLPort;' '/* hub-proxy: upstream already HTTPS */';
        sub_filter_once off;
        sub_filter_types text/css text/javascript application/javascript application/json;
        proxy_pass {$upstream};
NGINX;

        return <<<NGINX
# ONU svc {$serviceId} → {$targetIp} upstream={$upstreamMode}
server {
    listen {$httpPort};
    listen [::]:{$httpPort};
    server_name {$host};
    location / {
{$common}
    }
}
server {
    listen {$httpsPort} ssl;
    listen [::]:{$httpsPort} ssl;
    server_name {$host};
    ssl_certificate /etc/nginx/onu-proxy.crt;
    ssl_certificate_key /etc/nginx/onu-proxy.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / {
        proxy_http_version 1.1;
        proxy_connect_timeout 4s;
        proxy_send_timeout 45s;
        proxy_read_timeout 45s;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_set_header Host {$targetIp};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host {$host}:{$httpsPort};
        proxy_set_header Accept-Encoding "";
        {$sslVerify}
        proxy_redirect http://{$targetIp}/ {$pubHttps}/;
        proxy_redirect https://{$targetIp}/ {$pubHttps}/;
        proxy_redirect http://{$targetIp}:80/ {$pubHttps}/;
        proxy_redirect https://{$targetIp}:80/ {$pubHttps}/;
        proxy_redirect https://{$targetIp}:443/ {$pubHttps}/;
        proxy_redirect ~^https?://{$targetIp}(?::\\d+)?(/.*)?\$ {$pubHttps}\$1;
        sub_filter 'https://{$targetIp}:443' '{$pubHttps}';
        sub_filter 'https://{$targetIp}:80' '{$pubHttps}';
        sub_filter 'https://{$targetIp}' '{$pubHttps}';
        sub_filter 'http://{$targetIp}' '{$pubHttps}';
        sub_filter '{$targetIp}' '{$host}:{$httpsPort}';
        sub_filter '{$escapedIp}' '{$host}';
        sub_filter 'window.location="https://" + SSLHostIp + ":" + SSLPort;' '/* hub-proxy */';
        sub_filter_once off;
        sub_filter_types text/css text/javascript application/javascript application/json;
        proxy_pass {$upstream};
    }
}
NGINX;
    }

    private function runSsh(string $remote, int $timeout = 60): \Illuminate\Contracts\Process\ProcessResult
    {
        $password = config('onu.hub_ssh_password');
        $command = sprintf(
            'sshpass -p %s ssh -o StrictHostKeyChecking=no -o ConnectTimeout=20 %s@%s %s',
            escapeshellarg($password),
            escapeshellarg(config('onu.hub_ssh_user')),
            escapeshellarg(config('onu.hub_ssh_host')),
            escapeshellarg($remote)
        );

        return Process::timeout($timeout)->run($command);
    }
}
