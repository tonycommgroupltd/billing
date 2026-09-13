import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Col, Form, FormGroup, Input, Label, Row, Spinner } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
  RSelect,
} from "../../components/Component";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { http } from "../../helpers";
import { toast } from "react-toastify";

const SendBulk = () => {
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [phones, setPhones] = useState("");
  const [allWaCustomers, setAllWaCustomers] = useState(false);
  const [busy, setBusy] = useState(false);

  const phoneCount = useMemo(() => (phones || "").split(/[\s,;]+/).filter(Boolean).length, [phones]);

  useEffect(() => {
    http
      .get("/whatsapp-templates")
      .then(({ data }) => {
        setTemplates(
          (data?.data || []).map((t) => ({
            value: t.id,
            label: `${t.name} (${t.language})`,
            param_count: t.param_count || 0,
          }))
        );
      })
      .catch(() => toast.error("Failed to load templates"));
  }, []);

  useEffect(() => {
    const n = template?.param_count || 0;
    setFields((prev) => {
      const next = [...prev];
      while (next.length < n) next.push("");
      return next.slice(0, n);
    });
  }, [template]);

  const submit = async (e) => {
    e.preventDefault();
    if (!template) {
      toast.error("Select a template");
      return;
    }
    if (!allWaCustomers && !phones.trim()) {
      toast.error("Paste phone numbers or select all WhatsApp customers");
      return;
    }
    if (!window.confirm("Send this WhatsApp template to the bulk list now? (max 200)")) return;
    setBusy(true);
    try {
      const { data } = await http.post("/whatsapp/send-bulk", {
        template_id: template.value,
        fields,
        phones: phones.trim() || undefined,
        all_whatsapp_customers: allWaCustomers || undefined,
      });
      toast.success(
        `Sent ${data?.sent_count ?? 0} of ${data?.recipients ?? 0}` +
          (data?.failed_count ? ` · failed ${data.failed_count}` : "")
      );
      setPhones("");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Bulk WhatsApp failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head title="Send Bulk WhatsApp" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                Send Bulk WhatsApp
              </BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <Link to="/admin/whatsapp/outbox" className="btn btn-outline-light bg-white">
                <Icon name="list" />
                <span>Outbox</span>
              </Link>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          <PreviewCard>
            <Form onSubmit={submit}>
              <Row className="gy-3">
                <Col md="6">
                  <FormGroup>
                    <Label>Template</Label>
                    <RSelect options={templates} value={template} onChange={setTemplate} />
                  </FormGroup>
                </Col>
                {fields.map((val, idx) => (
                  <Col md="3" key={idx}>
                    <FormGroup>
                      <Label>Body variable {`{{${idx + 1}}}`}</Label>
                      <input
                        type="text"
                        className="form-control"
                        value={val}
                        onChange={(e) => {
                          const next = [...fields];
                          next[idx] = e.target.value;
                          setFields(next);
                        }}
                      />
                    </FormGroup>
                  </Col>
                ))}
                <Col md="12">
                  <FormGroup>
                    <Label>Phone numbers</Label>
                    <textarea
                      className="form-control"
                      rows={8}
                      value={phones}
                      onChange={(e) => setPhones(e.target.value)}
                      placeholder={"One per line or comma-separated\n0712345678\n254712345678"}
                      disabled={allWaCustomers}
                    />
                    <div className="text-soft mt-1" style={{ fontSize: 12 }}>
                      {phoneCount} number{phoneCount === 1 ? "" : "s"} detected · max 200
                    </div>
                  </FormGroup>
                </Col>
                <Col md="12">
                  <FormGroup check>
                    <Input
                      id="allWaCustomers"
                      type="checkbox"
                      checked={allWaCustomers}
                      onChange={(e) => setAllWaCustomers(e.target.checked)}
                    />
                    <Label check for="allWaCustomers" className="ms-1">
                      Also / instead: all customers with <code>send_via = whatsapp</code>
                    </Label>
                  </FormGroup>
                </Col>
                <Col md="12">
                  <Alert color="warning" className="mb-0">
                    Messages are sent immediately via Meta Cloud API. Check Outbox / Reports for results.
                  </Alert>
                </Col>
                <Col md="12">
                  <Button color="primary" type="submit" disabled={busy}>
                    {busy ? <Spinner size="sm" /> : <Icon name="whatsapp" />}
                    <span>{busy ? "Sending…" : "Send bulk WhatsApp"}</span>
                  </Button>
                </Col>
              </Row>
            </Form>
          </PreviewCard>
        </Block>
      </Content>
    </>
  );
};

export default SendBulk;
