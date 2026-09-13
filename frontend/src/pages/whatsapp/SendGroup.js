import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Col, Form, FormGroup, Label, Row, Spinner } from "reactstrap";
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
import { billingTypeOptions, categoryOptions } from "../components/forms/SelectData";
import { http } from "../../helpers";
import { toast } from "react-toastify";

const sendViaOptions = [
  { value: "whatsapp", label: "WhatsApp preference only" },
  { value: "all", label: "All customers (any preference)" },
  { value: "sms", label: "SMS preference only" },
];

const serviceStatusOptions = [
  { value: "", label: "Any service status" },
  { value: 2, label: "Active services" },
  { value: 3, label: "Expired / disabled services" },
  { value: 1, label: "Pending services" },
  { value: 0, label: "New / inactive services" },
];

const SendGroup = () => {
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [billingType, setBillingType] = useState(null);
  const [category, setCategory] = useState(null);
  const [sendVia, setSendVia] = useState(sendViaOptions[0]);
  const [serviceStatus, setServiceStatus] = useState(serviceStatusOptions[0]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

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

  const payload = (previewOnly = false) => ({
    template_id: template?.value,
    fields,
    billing_type: billingType?.value || undefined,
    category: category?.value || undefined,
    send_via: sendVia?.value || "whatsapp",
    service_status:
      serviceStatus?.value === "" || serviceStatus?.value == null ? undefined : serviceStatus.value,
    preview_only: previewOnly,
  });

  const runPreview = async () => {
    if (!template) {
      toast.error("Select a template");
      return;
    }
    setBusy(true);
    setPreview(null);
    try {
      const { data } = await http.post("/whatsapp/send-group", payload(true));
      setPreview(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!template) {
      toast.error("Select a template");
      return;
    }
    if (!window.confirm("Send this WhatsApp template to the selected customer group now?")) return;
    setBusy(true);
    try {
      const { data } = await http.post("/whatsapp/send-group", payload(false));
      toast.success(
        `Sent ${data?.sent_count ?? 0}` +
          (data?.failed_count ? ` · failed ${data.failed_count}` : "") +
          (data?.invalid_count ? ` · invalid ${data.invalid_count}` : "")
      );
      setPreview(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Group send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head title="Send Group WhatsApp" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                Send Group WhatsApp
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
                <Col md="3">
                  <FormGroup>
                    <Label>Billing type</Label>
                    <RSelect
                      options={[{ value: "", label: "Any" }, ...billingTypeOptions]}
                      value={billingType}
                      onChange={setBillingType}
                      isClearable
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Category</Label>
                    <RSelect
                      options={[{ value: "", label: "Any" }, ...categoryOptions]}
                      value={category}
                      onChange={setCategory}
                      isClearable
                    />
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>Send preference</Label>
                    <RSelect options={sendViaOptions} value={sendVia} onChange={setSendVia} />
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>Service status</Label>
                    <RSelect options={serviceStatusOptions} value={serviceStatus} onChange={setServiceStatus} />
                  </FormGroup>
                </Col>
                {fields.map((val, idx) => (
                  <Col md="4" key={idx}>
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
                {preview ? (
                  <Col md="12">
                    <Alert color="info" className="mb-0">
                      Template <strong>{preview.template}</strong> · matched <strong>{preview.matched}</strong> ·
                      valid <strong>{preview.valid_recipients}</strong>
                    </Alert>
                  </Col>
                ) : null}
                <Col md="12" className="d-flex flex-wrap gap-2">
                  <Button color="light" type="button" onClick={runPreview} disabled={busy}>
                    {busy ? <Spinner size="sm" /> : <Icon name="eye" />}
                    <span>Preview count</span>
                  </Button>
                  <Button color="primary" type="submit" disabled={busy}>
                    {busy ? <Spinner size="sm" /> : <Icon name="whatsapp" />}
                    <span>Send group WhatsApp</span>
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

export default SendGroup;
