import React, { useMemo, useState } from "react";
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
} from "../../components/Component";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { http } from "../../helpers";
import { toast } from "react-toastify";
import { SmsCharMeter } from "./smsHelpers";

const SendBulk = () => {
  const [message, setMessage] = useState("");
  const [phones, setPhones] = useState("");
  const [allSmsCustomers, setAllSmsCustomers] = useState(false);
  const [busy, setBusy] = useState(false);

  const phoneCount = useMemo(() => {
    const parts = (phones || "").split(/[\s,;]+/).filter(Boolean);
    return parts.length;
  }, [phones]);

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Message is required");
      return;
    }
    if (!allSmsCustomers && !phones.trim()) {
      toast.error("Paste phone numbers or select all SMS customers");
      return;
    }
    const confirmMsg = allSmsCustomers
      ? "Queue this SMS to all customers with SMS preference?"
      : `Queue this SMS to about ${phoneCount} pasted number(s)?`;
    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    try {
      const { data } = await http.post("/sms/send-bulk", {
        message: message.trim(),
        phones: phones.trim() || undefined,
        all_sms_customers: allSmsCustomers || undefined,
      });
      toast.success(
        `Queued ${data?.queued_count ?? 0} of ${data?.recipients ?? 0}` +
          (data?.skipped_count ? ` · skipped ${data.skipped_count} duplicates` : "")
      );
      setPhones("");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to queue bulk SMS");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head title="Send Bulk SMS" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                Send Bulk SMS
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
                <Col md="12">
                  <FormGroup>
                    <Label>Phone numbers</Label>
                    <textarea
                      className="form-control"
                      rows={8}
                      value={phones}
                      onChange={(e) => setPhones(e.target.value)}
                      placeholder={"One per line or comma-separated\n0712345678\n254712345678"}
                      disabled={allSmsCustomers}
                    />
                    <div className="text-soft mt-1" style={{ fontSize: 12 }}>
                      {phoneCount} number{phoneCount === 1 ? "" : "s"} detected
                    </div>
                  </FormGroup>
                </Col>
                <Col md="12">
                  <FormGroup check className="mb-0">
                    <Input
                      id="allSmsCustomers"
                      type="checkbox"
                      checked={allSmsCustomers}
                      onChange={(e) => setAllSmsCustomers(e.target.checked)}
                    />
                    <Label check for="allSmsCustomers" className="ms-1">
                      Also / instead: queue to all customers with <code>send_via = sms</code>
                    </Label>
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
                <Col md="12">
                  <Alert color="warning" className="mb-0">
                    Duplicate recipient + same message body is skipped automatically. Track progress in Outbox /
                    Reports.
                  </Alert>
                </Col>
                <Col md="12">
                  <Button color="primary" type="submit" disabled={busy}>
                    {busy ? <Spinner size="sm" /> : <Icon name="send" />}
                    <span>{busy ? "Queueing…" : "Queue bulk SMS"}</span>
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
