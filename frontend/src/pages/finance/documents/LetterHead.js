import React, { useMemo, useState } from "react";
import { Col, FormGroup, Input, Label, Row } from "reactstrap";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import {
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
} from "../../../components/Component";
import { exportHtmlToWord, imageUrlToDataUrl } from "../../../helpers/financeDocumentsExport";
import { formatDisplayDate, getCompanyBrand, todayIso } from "../../../helpers/companyBrand";
import "./Documents.css";

const DEFAULT_BODY = `Dear Sir / Madam,

[Write your letter here.]



Yours faithfully,


____________________________
Name
Title
`;

const LetterHead = () => {
  const brand = useMemo(() => getCompanyBrand(), []);
  const [refNo, setRefNo] = useState("");
  const [date, setDate] = useState(todayIso());
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [busy, setBusy] = useState(false);

  const addressLines = String(brand.addressHtml || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const downloadWord = async () => {
    setBusy(true);
    try {
      const logoData = await imageUrlToDataUrl(brand.logoUrl);
      const logoImg = logoData
        ? `<img src="${logoData}" width="72" height="72" alt="" style="width:72px;height:auto;" />`
        : `<div style="font-size:16pt;font-weight:800;color:#1A73E8">${brand.shortName}</div>`;

      const watermark = logoData
        ? `<img src="${logoData}" width="280" alt="" style="width:280px;height:auto;opacity:0.07;" />`
        : `<div style="font-size:48pt;font-weight:800;color:#1A73E8;opacity:0.07">${brand.shortName}</div>`;

      const headerHtml = `
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-bottom:2.25pt solid #1A73E8;padding-bottom:6pt;">
          <tr>
            <td valign="middle" width="90">${logoImg}</td>
            <td valign="middle" style="padding-left:10pt;">
              <div style="font-size:16pt;font-weight:700;color:#1A73E8;letter-spacing:0.2pt;">${brand.shortName}</div>
              <div style="font-size:9pt;color:#5f6368;margin-top:2pt;">${brand.tagline}</div>
            </td>
          </tr>
        </table>`;

      const footerHtml = `
        <div style="border-top:1.5pt solid #1A73E8;padding-top:6pt;font-size:8.5pt;color:#5f6368;text-align:center;line-height:1.45;">
          <div>${addressLines.join(" · ")}</div>
          <div>${brand.phone} · ${brand.email} · ${brand.website}</div>
          <div>Registration ${brand.registration} · M-Pesa Paybill ${brand.paybill}</div>
        </div>`;

      const bodyHtml = `
<!--[if gte mso 9]>
<xml>
  <w:headers>
    <w:header w:type="default">
    </w:header>
  </w:headers>
</xml>
<![endif]-->
<div class="Section1">
  <div style="mso-element:header" id="h1">
    ${headerHtml}
  </div>
  <div style="mso-element:footer" id="f1">
    ${footerHtml}
  </div>

  <table width="100%" style="font-size:11pt;margin-bottom:12pt;">
    <tr>
      <td>Our Ref: <b>${refNo || "_______________"}</b></td>
      <td align="right">${formatDisplayDate(date)}</td>
    </tr>
  </table>

  <div style="margin:10pt 0 14pt;white-space:pre-wrap;line-height:1.45;">${String(recipient || "").replace(
    /\n/g,
    "<br/>"
  )}</div>

  ${subject ? `<div style="margin:0 0 14pt;font-weight:700;">RE: ${subject}</div>` : ""}

  <div style="position:relative;min-height:320pt;">
    <div style="position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);text-align:center;z-index:0;">
      ${watermark}
    </div>
    <div style="position:relative;z-index:1;white-space:pre-wrap;line-height:1.55;font-size:11pt;">
      ${String(body || "").replace(/\n/g, "<br/>")}
    </div>
  </div>
</div>`;

      exportHtmlToWord(bodyHtml, `Tonycomm-Letter-${date || "draft"}.doc`, brand.shortName, `
        p { margin: 0 0 8pt; }
      `);
    } finally {
      setBusy(false);
    }
  };

  return (
    <React.Fragment>
      <Head title="Company Letter Head" />
      <Content>
        <div className="fd-page">
          <BlockHead size="sm">
            <BlockBetween className="g-3">
              <BlockHeadContent>
                <div className="text-soft text-uppercase" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
                  Finance · Documents
                </div>
                <BlockTitle page tag="h3" className="mb-0 mt-1">
                  Company Letter Head
                </BlockTitle>
                <p className="text-soft mb-0" style={{ fontSize: 13 }}>
                  Write the letter below. Brand stays in the Word header and footer; company profile details are locked.
                </p>
              </BlockHeadContent>
              <BlockHeadContent>
                <div className="fd-actions">
                  <Button color="primary" onClick={downloadWord} disabled={busy}>
                    <Icon name="download" />
                    <span>{busy ? "Preparing…" : "Download Word"}</span>
                  </Button>
                </div>
              </BlockHeadContent>
            </BlockBetween>
          </BlockHead>

          <Block>
            <Row className="g-3">
              <Col lg="5">
                <PreviewCard>
                  <div className="fd-locked mb-3">
                    <div className="fd-locked-title">Company details (from profile — locked)</div>
                    <div>
                      <strong>{brand.shortName}</strong>
                    </div>
                    <div className="text-soft" style={{ fontSize: 12 }}>
                      Used only in header / footer of the Word file
                    </div>
                  </div>

                  <FormGroup>
                    <Label>Our reference</Label>
                    <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="TCOM/LTR/2026/001" />
                  </FormGroup>
                  <FormGroup>
                    <Label>Date</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </FormGroup>
                  <FormGroup>
                    <Label>Recipient</Label>
                    <Input
                      type="textarea"
                      rows={3}
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder={"Name\nOrganisation\nAddress"}
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Subject</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject of the letter" />
                  </FormGroup>
                  <FormGroup className="mb-0">
                    <Label>Letter body</Label>
                    <Input type="textarea" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
                  </FormGroup>
                </PreviewCard>
              </Col>

              <Col lg="7">
                <div className="fd-editor-preview">
                  <article className="fd-letter-page">
                    <header className="fd-lh-header">
                      <div className="fd-lh-brand">
                        <img
                          src={brand.logoUrl}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                        <div>
                          <div className="fd-lh-name">{brand.shortName}</div>
                          <div className="fd-lh-tag">{brand.tagline}</div>
                        </div>
                      </div>
                    </header>

                    <div className="fd-lh-meta">
                      <span>Our Ref: <strong>{refNo || "_______________"}</strong></span>
                      <span>{formatDisplayDate(date)}</span>
                    </div>

                    <div className="fd-lh-recipient">{recipient || " "}</div>
                    {subject ? <div className="fd-lh-subject">RE: {subject}</div> : null}

                    <div className="fd-lh-body-wrap">
                      <div className="fd-lh-watermark" aria-hidden>
                        <img
                          src={brand.logoUrl}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                      <div className="fd-lh-body">{body}</div>
                    </div>

                    <footer className="fd-lh-footer">
                      <div>{addressLines.join(" · ")}</div>
                      <div>
                        {brand.phone} · {brand.email} · {brand.website}
                      </div>
                      <div>
                        Registration {brand.registration} · M-Pesa Paybill {brand.paybill}
                      </div>
                    </footer>
                  </article>
                </div>
              </Col>
            </Row>
          </Block>
        </div>
      </Content>
    </React.Fragment>
  );
};

export default LetterHead;
