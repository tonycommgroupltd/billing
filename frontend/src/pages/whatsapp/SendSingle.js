import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AsyncPaginate } from "react-select-async-paginate";
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
import { http } from "../../helpers";
import { toast } from "react-toastify";

const modeOptions = [
  { value: "template", label: "Approved template" },
  { value: "text", label: "Session text (24h window)" },
];

const SendSingle = () => {
  const [mode, setMode] = useState(modeOptions[0]);
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    http
      .get("/whatsapp-templates")
      .then(({ data }) => {
        const opts = (data?.data || []).map((t) => ({
          value: t.id,
          label: `${t.name} (${t.language})`,
          param_count: t.param_count || 0,
          raw: t,
        }));
        setTemplates(opts);
      })
      .catch(() => toast.error("Failed to load WhatsApp templates"));
  }, []);

  useEffect(() => {
    const n = template?.param_count || 0;
    setFields((prev) => {
      const next = [...prev];
      while (next.length < n) next.push("");
      return next.slice(0, n);
    });
  }, [template]);

  const loadCustomers = useCallback(async (search, loadedOptions, { page }) => {
    try {
      const { data } = await http.get("/list-customers", {
        params: { q: search || undefined, page: page || 1, per_page: 20, sort_col: "name", sort: "asc" },
      });
      const options = (data?.data || []).map((c) => ({
        value: c.id,
        label: `${c.name || "Customer"} · ${c.phone_number || "no phone"}`,
        phone: c.phone_number,
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

  const submit = async (e) => {
    e.preventDefault();
    if (!phone.trim() && !customer?.value) {
      toast.error("Enter a phone number or pick a customer");
      return;
    }
    if (mode?.value === "template" && !template) {
      toast.error("Select a template");
      return;
    }
    if (mode?.value === "text" && !message.trim()) {
      toast.error("Message is required");
      return;
    }
    setSending(true);
    try {
      const { data } = await http.post("/whatsapp/send-single", {
        mode: mode?.value || "template",
        phone: phone.trim() || undefined,
        customer_id: customer?.value || undefined,
        template_id: template?.value || undefined,
        fields: mode?.value === "template" ? fields : undefined,
        message: mode?.value === "text" ? message.trim() : undefined,
      });
      toast.success(data?.message || "Sent");
      if (mode?.value === "text") setMessage("");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to send WhatsApp");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Head title="Send Single WhatsApp" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                Send Single WhatsApp
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
                <Col md="4">
                  <FormGroup>
                    <Label>Mode</Label>
                    <RSelect options={modeOptions} value={mode} onChange={setMode} />
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>Customer (optional)</Label>
                    <AsyncPaginate
                      value={customer}
                      loadOptions={loadCustomers}
                      onChange={(opt) => {
                        setCustomer(opt);
                        if (opt?.phone) setPhone(opt.phone);
                      }}
                      additional={{ page: 1 }}
                      debounceTimeout={300}
                      placeholder="Search…"
                      isClearable
                      className="react-select-container"
                      classNamePrefix="react-select"
                    />
                  </FormGroup>
                </Col>
                <Col md="4">
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

                {mode?.value === "template" ? (
                  <>
                    <Col md="6">
                      <FormGroup>
                        <Label>Template</Label>
                        <RSelect
                          options={templates}
                          value={template}
                          onChange={setTemplate}
                          placeholder="Select approved template"
                        />
                      </FormGroup>
                    </Col>
                    {fields.map((val, idx) => (
                      <Col md="6" key={idx}>
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
                  </>
                ) : (
                  <Col md="12">
                    <FormGroup>
                      <Label>Message</Label>
                      <textarea
                        className="form-control"
                        rows={5}
                        maxLength={4096}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                      />
                      <Alert color="warning" className="mt-2 mb-0">
                        Session text only works if the customer messaged you in the last 24 hours. Otherwise use a
                        template.
                      </Alert>
                    </FormGroup>
                  </Col>
                )}

                <Col md="12">
                  <Button color="primary" type="submit" disabled={sending}>
                    {sending ? <Spinner size="sm" /> : <Icon name="whatsapp" />}
                    <span>{sending ? "Sending…" : "Send WhatsApp"}</span>
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
