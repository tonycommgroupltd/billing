import { loadCompanyProfileContent } from "./companyProfileContent";

/** Locked brand block used on finance documents + letterhead. */
export function getCompanyBrand() {
  const p = loadCompanyProfileContent();
  const name = String(p.companyNameHtml || "Tonycomm Group Limited")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    name: name || "Tonycomm Group Limited",
    shortName: "Tonycomm Group LTD",
    tagline: "Fast, reliable and locally available · TCOM Internet",
    phone: p.contactPhone || p.metaContact || "0110 345 166 · 0718 742 693",
    email: p.contactEmail || "tonycommgroupltd@gmail.com",
    website: (p.metaWebsite || "www.tonycommgroupltd.com").replace(/^https?:\/\//, ""),
    addressHtml: p.contactAddressHtml || "Amazing Grace Building, 1st Floor<br>Nakuru–Nyahururu Road, Heshima<br>P.O. Box 441-20100, Nakuru",
    paybill: "4129711",
    logoUrl: `${process.env.PUBLIC_URL || ""}/company-profile/logo.png`,
    registration: p.metaRegistration || "PVT-AJUV695",
  };
}

export function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-KE", { maximumFractionDigits: 2 });
}

export function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDisplayDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default getCompanyBrand;
