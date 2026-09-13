import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import { Alert, Col, Form, FormGroup, Input, Label, Row } from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Button, PreviewCard } from "../../../components/Component";
import { http } from "../../../helpers";

const Ipv4Add = () => {
  const navigate = useNavigate();
  const [routers, setRouters] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    router_id: "",
    title: "",
    cidr: "",
    gateway: "",
    purpose: "",
    location: "",
    api_host: "",
    notes: "",
  });

  const fetchRouters = useCallback(async () => {
    try {
      const resp = await http.get("/ipv4-router-options");
      setRouters(resp.data?.routers || []);
    } catch (_) {
      setRouters([]);
    }
  }, []);

  useEffect(() => {
    fetchRouters();
  }, [fetchRouters]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await http.post("/ipv4-networks", {
        ...form,
        router_id: form.router_id || null,
      });
      navigate(`${process.env.PUBLIC_URL}/admin/networking/ipv4/dashboard`);
    } catch (err) {
      const msg = err.response?.data?.message
        || Object.values(err.response?.data || {}).flat().join(", ")
        || err.message;
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <React.Fragment>
      <Head title="Add IPv4 network" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page tag="h3">IPv4 — Add</BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          {error ? <Alert color="danger">{error}</Alert> : null}
          <PreviewCard>
            <Form onSubmit={onSubmit}>
              <Row>
                <Col md="6">
                  <FormGroup>
                    <Label>Title</Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Faiba 2 gateway block" />
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>CIDR (102.0.x only)</Label>
                    <Input value={form.cidr} onChange={(e) => setForm({ ...form, cidr: e.target.value })} required placeholder="102.0.26.0/28" />
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>Router</Label>
                    <Input type="select" value={form.router_id} onChange={(e) => setForm({ ...form, router_id: e.target.value })}>
                      <option value="">— Optional —</option>
                      {routers.map((r) => (
                        <option key={r.id} value={r.id}>{r.title} ({r.host || r.nas_ip})</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>Gateway</Label>
                    <Input value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })} placeholder="102.0.26.60" />
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>Purpose</Label>
                    <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Customer WAN / OLT management" />
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>Location</Label>
                    <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Faiba 2 site" />
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>API host (ping from)</Label>
                    <Input value={form.api_host} onChange={(e) => setForm({ ...form, api_host: e.target.value })} placeholder="Leave empty to use router host" />
                  </FormGroup>
                </Col>
                <Col md="12">
                  <FormGroup>
                    <Label>Notes</Label>
                    <Input type="textarea" rows="2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </FormGroup>
                </Col>
              </Row>
              <div className="d-flex justify-content-end gap-2">
                <Link to={`${process.env.PUBLIC_URL}/admin/networking/ipv4/dashboard`} className="btn btn-light">Cancel</Link>
                <Button type="submit" color="primary" disabled={saving}>{saving ? "Saving…" : "Add network"}</Button>
              </div>
            </Form>
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Ipv4Add;
