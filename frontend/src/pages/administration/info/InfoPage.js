import React from "react";
import { useParams, Link } from "react-router-dom";
import { Alert, ListGroup, ListGroupItem } from "reactstrap";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import {
  BackTo,
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  PreviewCard,
} from "../../../components/Component";

const INFO = {
  site: {
    title: "Site",
    body: "Tonycomm Group LTD customer and operations portal.",
    links: [
      { label: "Open admin home", to: "/admin", internal: true },
      { label: "Public app URL", href: "https://isp.tonycommgroupltd.com" },
    ],
  },
  documentation: {
    title: "Documentation",
    body: "Operational guides for this platform. Prefer in-app tools for live systems.",
    links: [
      { label: "AI Buddy (diagnostics)", to: "/admin/ai-diagnostics", internal: true },
      { label: "High availability", to: "/admin/administration/high-availability", internal: true },
      { label: "Server logs", to: "/admin/administration/logs", internal: true },
      { label: "Hotspot dashboard", to: "/admin/hotspot/dashboard", internal: true },
      { label: "OLT monitoring", to: "/admin/company/olt-monitoring", internal: true },
    ],
  },
  forum: {
    title: "Support / Forum",
    body: "Internal support is handled through tickets and WhatsApp — not a public forum.",
    links: [
      { label: "Tickets", to: "/admin/tickets/list", internal: true },
      { label: "WhatsApp inbox", to: "/admin/whatsapp/inbox", internal: true },
    ],
  },
  youtube: {
    title: "YouTube channel",
    body: "Company video channel (opens in a new tab).",
    links: [{ label: "Open YouTube", href: "https://www.youtube.com/results?search_query=Tonycomm+Group" }],
  },
  "deployment-videos": {
    title: "Deployment videos",
    body: "Use these in-app pages while deploying or troubleshooting.",
    links: [
      { label: "High availability", to: "/admin/administration/high-availability", internal: true },
      { label: "Routers", to: "/admin/networking/routers/list", internal: true },
      { label: "VPN dashboard", to: "/admin/networking/vpn/dashboard", internal: true },
      { label: "TR-069", to: "/admin/company/tr069", internal: true },
    ],
  },
  facebook: {
    title: "Facebook",
    body: "Company social presence (opens in a new tab).",
    links: [{ label: "Open Facebook", href: "https://www.facebook.com/search/top?q=Tonycomm%20Group" }],
  },
  "api-documentation": {
    title: "API documentation",
    body: "Authenticated JSON API under /api/v1 (and production-api proxy). Key admin-hub endpoints:",
    links: [
      { label: "API keys status", to: "/admin/administration/api-keys", internal: true },
      { label: "AI diagnostics", to: "/admin/ai-diagnostics", internal: true },
    ],
    bullets: [
      "POST /api/v1/login — obtain JWT",
      "GET /api/v1/admin-hub/partners — partners CRUD",
      "GET /api/v1/admin-hub/locations — locations CRUD",
      "GET /api/v1/admin-hub/api-keys — masked key inventory",
      "GET /api/v1/admin-hub/license — license / runtime info",
      "GET /api/v1/admin-hub/reports/{type} — administration reports",
      "GET /api/v1/server-logs/catalog|tail — server log viewer",
      "POST /api/v1/ai-diagnostics/ask — AI Buddy",
    ],
  },
};

const InfoPage = () => {
  const { topic } = useParams();
  const info = INFO[topic] || {
    title: "Information",
    body: "Topic not found.",
    links: [{ label: "Back to Administration", to: "/admin/administration", internal: true }],
  };

  return (
    <React.Fragment>
      <Head title={info.title} />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>{info.title}</BlockTitle>
              </BlockHeadContent>
            <BlockHeadContent>
              <BackTo link="/admin/administration" icon="arrow-left">
                Administration
              </BackTo>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <PreviewCard>
            <Alert color="info" className="mb-3">
              {info.body}
            </Alert>
            {info.bullets?.length ? (
              <ListGroup className="mb-3">
                {info.bullets.map((item) => (
                  <ListGroupItem key={item}>
                    <code>{item}</code>
                  </ListGroupItem>
                ))}
              </ListGroup>
            ) : null}
            <div className="d-flex flex-wrap gap-2">
              {(info.links || []).map((link) =>
                link.internal ? (
                  <Button key={link.label} tag={Link} to={link.to} color="primary">
                    {link.label}
                  </Button>
                ) : (
                  <Button
                    key={link.label}
                    tag="a"
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    color="primary"
                  >
                    {link.label}
                  </Button>
                )
              )}
            </div>
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default InfoPage;
