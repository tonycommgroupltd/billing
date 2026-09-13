import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { AsyncPaginate } from "react-select-async-paginate";
import { Col, Form, FormGroup, Label, Row, Spinner } from "reactstrap";
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

const SendSingle = () => {
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const loadCustomers = useCallback(async (search, loadedOptions, { page }) => {
    try {
      const { data } = await http.get("/list-customers", {
        params: { q: search || undefined, page: page || 1, per_page: 20, sort_col: "name", sort: "asc" },
      });
      const options = (data?.data || []).map((c) => ({
        value: c.id,
        label: `${c.name || "Customer"} · ${c.phone_number || "no phone"}`,
        phone: c.phone_number,
        raw: c,
      }));
      return {
        options,
        hasMore: (data?.page || 1) < (data?.total_pages || 1),
        additional: { page: (page || 1) + 1 },
      };
    } catch {
      return { options: [], hasMore: false, additional: { page: 1 } };
    }
  }, []);

  const onCustomerChange = (opt) => {
    setCustomer(opt);
    if (opt?.phone) setPhone(opt.phone);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Message is required");
      return;
    }
    if (!phone.trim() && !customer?.value) {
      toast.error("Enter a phone number or pick a customer");
      return;
    }
    setSending(true);
    try {
      const { data } = await http.post("/sms/send-single", {
        message: message.trim(),
        phone: phone.trim() || undefined,
        customer_id: customer?.value || undefined,
      });
      toast.success(data?.message || `Sent to ${data?.recipient || "recipient"}`);
      setMessage("");
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        (typeof err?.response?.data === "object"
          ? Object.values(err.response.data).flat().join(" ")
          : null) ||
        "Failed to send SMS";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Head title="Send Single SMS" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                Send Single SMS
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
                <Col md="6">
                  <FormGroup>
                    <Label>Customer (optional)</Label>
                    <AsyncPaginate
                      value={customer}
                      loadOptions={loadCustomers}
                      onChange={onCustomerChange}
                      additional={{ page: 1 }}
                      debounceTimeout={300}
                      placeholder="Search by name or phone…"
                      isClearable
                      className="react-select-container"
                      classNamePrefix="react-select"
                    />
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>Phone number</Label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="07XXXXXXXX or 2547XXXXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
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
                      placeholder="Type your SMS…"
                      required
                    />
                    <SmsCharMeter message={message} />
                  </FormGroup>
                </Col>
                <Col md="12">
                  <Button color="primary" type="submit" disabled={sending}>
                    {sending ? <Spinner size="sm" /> : <Icon name="send" />}
                    <span>{sending ? "Sending…" : "Send SMS"}</span>
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

export default SendSingle;
