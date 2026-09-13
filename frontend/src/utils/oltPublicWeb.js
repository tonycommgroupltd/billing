/** Hub public HTTPS ports for OLT web UIs (iptables DNAT on 102.0.15.254). */
const OLT_PUBLIC_WEB_BY_HOST = {
  "192.168.8.100": "https://102.0.15.254:8100/",
  "192.168.8.101": "https://102.0.15.254:8101/",
  "192.168.8.200": "https://102.0.15.254:8200/",
  "192.168.8.201": "https://102.0.15.254:8201/",
};

const OLT_PUBLIC_WEB_BY_ID = {
  "olt-ether3": "https://102.0.15.254:8100/",
  "olt-ether4": "https://102.0.15.254:8101/",
  "olt-ether2-gpon": "https://102.0.15.254:8200/",
  "olt-ether5-vsol": "https://102.0.15.254:8200/",
  "olt-ether5-gpon": "https://102.0.15.254:8201/",
  "olt-ether5-new": "https://102.0.15.254:8201/",
};

export function resolveOltPublicWebUrl(olt) {
  return (
    olt?.publicWebUrl ||
    olt?.setupHints?.publicWebUrl ||
    OLT_PUBLIC_WEB_BY_ID[olt?.id] ||
    OLT_PUBLIC_WEB_BY_HOST[olt?.host] ||
    null
  );
}
