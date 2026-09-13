/** Editable company profile content — defaults match the static HTML. */

export const CP_STORAGE_KEY = "tonycomm.companyProfile.content.v1";

export const DEFAULT_COMPANY_PROFILE = {
  // Cover
  docType: "Corporate Company Profile · 2026",
  companyNameHtml: "Tonycomm <span>Group</span> Limited",
  tagline:
    "A licensed Kenyan ICT company delivering enterprise-grade internet connectivity, custom software development, and managed digital infrastructure solutions across Nakuru County and East Africa.",
  pillar1: "Internet & Fiber Connectivity",
  pillar2: "Custom Software Development",
  pillar3: "ERP · POS · SACCO Systems",
  pillar4: "Managed IT & Cybersecurity",
  metaEstablished: "April 2019 · Nakuru, Kenya",
  metaRegistration: "PVT-AJUV695",
  metaWebsite: "www.tonycommgroupltd.com",
  metaContact: "0110 345 166",
  coverRightBlurb:
    "Rooted in Nakuru and the Rift Valley — building digital bridges with reliable connectivity and intelligent software for Kenya.",

  // Executive summary
  execTitle: "Bridging Digital Divides Across Kenya",
  execLead:
    "Tonycomm Group Limited is a Nakuru-based technology company delivering high-speed fiber and wireless internet alongside bespoke software solutions — from SACCO management systems and ERP platforms to POS applications and corporate websites — to residential, commercial, and institutional clients across Kenya since 2019.",
  stat1num: "2019",
  stat1lbl: "Year Established",
  stat2num: "99.9%",
  stat2lbl: "Uptime Guarantee",
  stat3num: "24/7",
  stat3lbl: "Customer Support",
  stat4num: "150+",
  stat4lbl: "Mbps Business Speeds",
  execBody:
    "Operating from the Amazing Grace Building in Heshima, Tonycomm holds ASP and NFP licenses from the Communications Authority of Kenya (CAK), and KPLC-approved pole infrastructure authorization. Under Director Mr. Antony Wachira, the company combines telecommunications with in-house software engineering to drive digital inclusion across Nakuru East, Subukia, Bahati, and beyond.",
  highlightDualHtml:
    "<strong>Dual Expertise:</strong> Tonycomm is uniquely positioned as both a licensed Internet Service Provider and a software development house — offering end-to-end digital transformation for SACCOs, SMEs, schools, and enterprises across East Africa.",
  cardInternetTitle: "Internet & Connectivity",
  cardInternetBody:
    "Fiber optic and wireless internet for homes, businesses, and institutions with zero data caps and symmetrical speeds.",
  cardSoftwareTitle: "Software & Digital Solutions",
  cardSoftwareBody:
    "Custom SACCO systems, ERP, POS, mobile apps, and professional websites built for the African market.",

  // Overview
  overviewTitle: "Who We Are",
  overviewBody:
    "Tonycomm Group Limited was incorporated on 10 April 2019 (Certificate No. PVT-AJUV695) under the Companies Act, 2015 of Kenya as a Private Limited Company. Headquartered at the Amazing Grace Building, 1st Floor, along Nakuru–Nyahururu Road, Heshima, with postal address P.O. Box 441-20100, Nakuru, the company has grown from a local ISP into a comprehensive ICT partner serving urban and semi-rural communities across Nakuru County.",
  mission:
    "To provide exceptional internet and technology services that enhance connectivity, enrich lives, and foster innovation and growth in the communities we serve through reliable, high-speed, affordable, and secure digital solutions.",
  vision:
    "To become the premier internet and software solutions provider in Nakuru and beyond — renowned for speed, security, high-end performance, and democratizing digital access for all socioeconomic segments across East Africa.",

  // Internet services
  internetTitle: "Reliable High-Speed Internet",
  internetIntro:
    "Tonycomm delivers scalable fiber optic and wireless internet solutions designed for Kenya's diverse connectivity needs — from residential streaming to enterprise-grade operations.",
  paybillHtml:
    "Paybill <strong>4129711</strong> — use your mobile number as the account number for convenient payments.",

  // Software
  softwareTitle: "Custom Software for African Businesses",
  softwareIntro:
    "Beyond connectivity, Tonycomm Group develops enterprise-grade software tailored to Kenyan and East African organizations — combining local market understanding with internationally certified engineering expertise.",
  softwareTitle2: "Web, Mobile & Managed IT",
  softwareHighlightHtml:
    "<strong>End-to-End Delivery:</strong> From concept and development to deployment, training, and ongoing support — Tonycomm builds software solutions tailored for SACCOs, SMEs, schools, and enterprises across Kenya.",

  // Coverage
  coverageTitle: "Serving Nakuru & the Rift Valley",

  // Contact / closing
  contactTitle: "Get Connected Today",
  contactPhone: "0110 345 166 · 0718 742 693",
  contactEmail: "tonycommgroupltd@gmail.com",
  contactAddressHtml:
    "Amazing Grace Building, 1st Floor<br>\n        Nakuru–Nyahururu Road, Heshima<br>\n        P.O. Box 441-20100, Nakuru",
  contactOnlineHtml:
    "www.tonycommgroupltd.com<br>\n        Facebook: Tonycomm Group LTD<br>\n        Instagram: @Tonycommgroupltd",
  footerNoteHtml:
    "Tonycomm Group Limited · Company Profile 2026 · Nakuru, Kenya<br>\n      Connecting communities. Building software. Powering Africa's digital economy.",
};

export const CP_FIELD_GROUPS = [
  {
    id: "cover",
    label: "Cover",
    fields: [
      { key: "docType", label: "Document type line", type: "text" },
      { key: "companyNameHtml", label: "Company name (HTML OK)", type: "text", html: true },
      { key: "tagline", label: "Tagline", type: "textarea", rows: 3 },
      { key: "pillar1", label: "Pillar 1", type: "text" },
      { key: "pillar2", label: "Pillar 2", type: "text" },
      { key: "pillar3", label: "Pillar 3", type: "text" },
      { key: "pillar4", label: "Pillar 4", type: "text" },
      { key: "metaEstablished", label: "Established", type: "text" },
      { key: "metaRegistration", label: "Registration", type: "text" },
      { key: "metaWebsite", label: "Website", type: "text" },
      { key: "metaContact", label: "Cover phone", type: "text" },
      { key: "coverRightBlurb", label: "Cover photo caption", type: "textarea", rows: 3 },
    ],
  },
  {
    id: "executive",
    label: "Executive",
    fields: [
      { key: "execTitle", label: "Page title", type: "text" },
      { key: "execLead", label: "Lead paragraph", type: "textarea", rows: 4 },
      { key: "stat1num", label: "Stat 1 value", type: "text" },
      { key: "stat1lbl", label: "Stat 1 label", type: "text" },
      { key: "stat2num", label: "Stat 2 value", type: "text" },
      { key: "stat2lbl", label: "Stat 2 label", type: "text" },
      { key: "stat3num", label: "Stat 3 value", type: "text" },
      { key: "stat3lbl", label: "Stat 3 label", type: "text" },
      { key: "stat4num", label: "Stat 4 value", type: "text" },
      { key: "stat4lbl", label: "Stat 4 label", type: "text" },
      { key: "execBody", label: "Body paragraph", type: "textarea", rows: 4 },
      { key: "highlightDualHtml", label: "Dual expertise box (HTML OK)", type: "textarea", rows: 3, html: true },
      { key: "cardInternetTitle", label: "Internet card title", type: "text" },
      { key: "cardInternetBody", label: "Internet card body", type: "textarea", rows: 2 },
      { key: "cardSoftwareTitle", label: "Software card title", type: "text" },
      { key: "cardSoftwareBody", label: "Software card body", type: "textarea", rows: 2 },
    ],
  },
  {
    id: "overview",
    label: "Overview",
    fields: [
      { key: "overviewTitle", label: "Title", type: "text" },
      { key: "overviewBody", label: "About paragraph", type: "textarea", rows: 5 },
      { key: "mission", label: "Mission", type: "textarea", rows: 3 },
      { key: "vision", label: "Vision", type: "textarea", rows: 3 },
    ],
  },
  {
    id: "services",
    label: "Services",
    fields: [
      { key: "internetTitle", label: "Internet page title", type: "text" },
      { key: "internetIntro", label: "Internet intro", type: "textarea", rows: 3 },
      { key: "paybillHtml", label: "M-Pesa paybill line (HTML OK)", type: "textarea", rows: 2, html: true },
      { key: "softwareTitle", label: "Software page title", type: "text" },
      { key: "softwareIntro", label: "Software intro", type: "textarea", rows: 3 },
      { key: "softwareTitle2", label: "Web / Mobile page title", type: "text" },
      { key: "softwareHighlightHtml", label: "End-to-end box (HTML OK)", type: "textarea", rows: 3, html: true },
      { key: "coverageTitle", label: "Coverage page title", type: "text" },
    ],
  },
  {
    id: "contact",
    label: "Contact",
    fields: [
      { key: "contactTitle", label: "Contact heading", type: "text" },
      { key: "contactPhone", label: "Phone / WhatsApp", type: "text" },
      { key: "contactEmail", label: "Email", type: "text" },
      { key: "contactAddressHtml", label: "Office address (HTML OK)", type: "textarea", rows: 3, html: true },
      { key: "contactOnlineHtml", label: "Online links (HTML OK)", type: "textarea", rows: 3, html: true },
      { key: "footerNoteHtml", label: "Footer note (HTML OK)", type: "textarea", rows: 2, html: true },
    ],
  },
];

export function loadCompanyProfileContent() {
  try {
    const raw = window.localStorage.getItem(CP_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COMPANY_PROFILE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_COMPANY_PROFILE, ...parsed };
  } catch {
    return { ...DEFAULT_COMPANY_PROFILE };
  }
}

export function saveCompanyProfileContent(content) {
  const merged = { ...DEFAULT_COMPANY_PROFILE, ...content };
  window.localStorage.setItem(CP_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function resetCompanyProfileContent() {
  window.localStorage.removeItem(CP_STORAGE_KEY);
  return { ...DEFAULT_COMPANY_PROFILE };
}

export function applyCompanyProfileContent(doc, content) {
  if (!doc || !content) return 0;
  let count = 0;
  doc.querySelectorAll("[data-cp]").forEach((el) => {
    const key = el.getAttribute("data-cp");
    if (content[key] == null) return;
    const val = String(content[key]);
    if (el.getAttribute("data-cp-html") === "1") {
      el.innerHTML = val;
    } else {
      el.textContent = val;
    }
    count += 1;
  });
  return count;
}

export function readCompanyProfileContentFromDoc(doc) {
  const data = { ...DEFAULT_COMPANY_PROFILE };
  if (!doc) return data;
  doc.querySelectorAll("[data-cp]").forEach((el) => {
    const key = el.getAttribute("data-cp");
    if (!key) return;
    data[key] =
      el.getAttribute("data-cp-html") === "1" ? el.innerHTML.trim() : el.textContent.replace(/\s+/g, " ").trim();
  });
  return data;
}

export default DEFAULT_COMPANY_PROFILE;
