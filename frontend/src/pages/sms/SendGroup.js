import React, { useState } from "react";
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
import { SmsCharMeter } from "./smsHelpers";

const sendViaOptions = [
  { value: "sms", label: "SMS preference only" },
  { value: "all", label: "All customers (any preference)" },
  { value: "whatsapp", label: "WhatsApp preference only" },
];

const serviceStatusOptions = [
  { value: "", label: "Any service status" },
  { value: 2, label: "Active services" },
  { value: 3, label: "Expired / disabled services" },
  { value: 1, label: "Pending services" },
  { value: 0, label: "New / inactive services" },
];

const SendGroup = () => {
  const [message, setMessage] = useState("");
  const [billingType, setBillingType] = useState(null);
  const [category, setCategory] = useState(null);
  const [sendVia, setSendVia] = useState(sendViaOptions[0]);
  const [serviceStatus, setServiceStatus] = useState(serviceStatusOptions[0]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const payload = (previewOnly = false) => ({
    message: message.trim(),
    billing_type: billingType?.value || undefined,
    category: category?.value || undefined,
    send_via: sendVia?.value || "sms",
    service_status:
      serviceStatus?.value === "" || serviceStatus?.value == null ? undefined : serviceStatus.value,
    preview_only: previewOnly,
  });

  const runPreview = async () => {
    if (!message.trim()) {
      toast.error("Message is required");
      return;
    }
    setBusy(true);
    setPreview(null);
    try {
      const { data } = await http.post("/sms/send-group", payload(true));
      setPreview(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Message is required");
      return;
    }
    if (!window.confirm("Queue this SMS to the selected customer group?")) return;
    setBusy(true);
    try {
      const { data } = await http.post("/sms/send-group", payload(false));
      toast.success(
        `Queued ${data?.queued_count ?? 0} message(s)` +
          (data?.skipped_count ? ` · skipped ${data.skipped_count}` : "") +
          (data?.invalid_count ? ` · invalid ${data.invalid_count}` : "")
      );
      setPreview(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to queue group SMS");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head title="Send Group SMS" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                Send Group SMS
              </BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <Link to="/admin/sms/outbox" className="btn btn-outline-light bg-white">
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
                <Col md="4">
                  <FormGroup>
                    <Label>Billing type</Label>
                    <RSelect
                      options={[{ value: "", label: "Any" }, ...billingTypeOptions]}
                      value={billingType}
                      onChange={setBillingType}
                      placeholder="Any"
                      isClearable
                    />
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>Category</Label>
                    <RSelect
                      options={[{ value: "", label: "Any" }, ...categoryOptions]}
                      value={category}
                      onChange={setCategory}
                      placeholder="Any"
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
                <Col md="12">
                  <FormGroup>
                    <Label>Message</Label>
                    <textarea
                      className="form-control"
                      rows={5}
                      maxLength={1000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                    />
                    <SmsCharMeter message={message} />
                  </FormGroup>
                </Col>
                {preview ? (
                  <Col md="12">
                    <Alert color="info" className="mb-0">
                      Matched <strong>{preview.matched}</strong> customers ·{" "}
                      <strong>{preview.valid_recipients}</strong> valid phone numbers
                    </Alert>
                  </Col>
                ) : null}
                <Col md="12" className="d-flex flex-wrap gap-2">
                  <Button color="light" type="button" onClick={runPreview} disabled={busy}>
                    {busy ? <Spinner size="sm" /> : <Icon name="eye" />}
                    <span>Preview count</span>
                  </Button>
                  <Button color="primary" type="submit" disabled={busy}>
                    {busy ? <Spinner size="sm" /> : <Icon name="send" />}
                    <span>Queue group SMS</span>
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
