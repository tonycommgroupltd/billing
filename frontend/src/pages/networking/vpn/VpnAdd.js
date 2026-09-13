import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import {
  Alert,
  Card,
  Col,
  Form,
  FormGroup,
  Input,
  Label,
  Row,
} from "reactstrap";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
} from "../../../components/Component";
import { vpnHttp } from "../../../helpers/vpnHttp";
import { CommandBlock } from "./vpnShared";

const VpnAdd = () => {
  const navigate = useNavigate();
  const [hubs, setHubs] = useState([]);
  const [selectedHubId, setSelectedHubId] = useState(null);
  const [wizard, setWizard] = useState(null);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHubForm, setShowHubForm] = useState(false);
  const [peerForm, setPeerForm] = useState({
    name: "",
    public_key: "",
    tunnel_ip: "",
    allowed_ips: "",
    listen_port: "51821",
    interface_name: "wg-tcom",
  });
  const [hubForm, setHubForm] = useState({
    name: "",
    host: "",
    location_type: "local",
    wg_interface: "wg0",
    listen_port: "51820",
    subnet: "10.88.0.0/24",
    hub_tunnel_ip: "",
    ssh_user: "root",
    notes: "",
  });

  const fetchHubs = useCallback(async () => {
    try {
      const resp = await vpnHttp.get("/hubs");
      const list = resp.data?.hubs || [];
      setHubs(list);
      setSelectedHubId((prev) => prev ?? list[0]?.id ?? null);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load hubs");
    }
  }, []);

  useEffect(() => {
    fetchHubs();
  }, [fetchHubs]);

  const selectedHub = hubs.find((h) => h.id === selectedHubId) || hubs[0];

  const loadWizard = async () => {
    if (!selectedHub) return;
    setWizardLoading(true);
    try {
      const resp = await vpnHttp.post(`/hubs/${selectedHub.id}/wizard`, {
        name: peerForm.name || "mikrotik-peer",
        tunnel_ip: peerForm.tunnel_ip,
        allowed_ips: peerForm.allowed_ips
          ? peerForm.allowed_ips.split(",").map((s) => s.trim())
          : undefined,
        interface_name: peerForm.interface_name,
        listen_port: Number(peerForm.listen_port) || 51821,
      });
      setWizard(resp.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Wizard failed");
    } finally {
      setWizardLoading(false);
    }
  };

  useEffect(() => {
    if (selectedHub && peerForm.name) {
      loadWizard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHub?.id]);

  const addPeer = async (e) => {
    e.preventDefault();
    if (!selectedHub) return;
    setSaving(true);
    setError("");
    try {
      const resp = await vpnHttp.post("/peers", {
        hub_id: selectedHub.id,
        name: peerForm.name,
        public_key: peerForm.public_key.trim(),
        tunnel_ip: peerForm.tunnel_ip || undefined,
        allowed_ips: peerForm.allowed_ips
          ? peerForm.allowed_ips.split(",").map((s) => s.trim())
          : undefined,
        listen_port: Number(peerForm.listen_port) || undefined,
        peer_type: "mikrotik",
        sync_now: true,
      });
      if (resp.data?.sync && !resp.data.sync.ok) {
        setError(resp.data.sync.message || "Sync failed — run manual command on hub");
      } else {
        navigate(`${process.env.PUBLIC_URL}/admin/networking/vpn/list`);
      }
    } catch (err) {
      setError(err.response?.data?.error || JSON.stringify(err.response?.data) || err.message);
    } finally {
      setSaving(false);
    }
  };

  const addHub = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await vpnHttp.post("/hubs", {
        ...hubForm,
        listen_port: Number(hubForm.listen_port),
      });
      setShowHubForm(false);
      fetchHubs();
    } catch (err) {
      setError(err.response?.data?.error || JSON.stringify(err.response?.data) || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <React.Fragment>
      <Head title="Add VPN peer" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page tag="h3">VPN — Add</BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          {error ? <Alert color="danger" toggle={() => setError("")}>{error}</Alert> : null}

          <div className="d-flex justify-content-between mb-3 flex-wrap gap-2">
            <div className="d-flex gap-2 flex-wrap">
              {hubs.map((hub) => (
                <Button
                  key={hub.id}
                  color={selectedHub?.id === hub.id ? "primary" : "outline-primary"}
                  onClick={() => { setSelectedHubId(hub.id); setWizard(null); }}
                >
                  {hub.location_type === "cloud" ? "Cloud" : "Local"} — {hub.host}
                  {hub.next_free_tunnel_ip ? (
                    <span className="ms-1 text-soft" style={{ fontSize: "11px" }}>(next: {hub.next_free_tunnel_ip})</span>
                  ) : null}
                </Button>
              ))}
            </div>
            <Button color="outline-primary" onClick={() => setShowHubForm(!showHubForm)}>
              {showHubForm ? "Hide hub form" : "Add hub"}
            </Button>
          </div>

          {showHubForm ? (
            <Card className="card-bordered mb-4">
              <div className="card-inner">
                <h6 className="mb-3">Add VPN hub</h6>
                <Form onSubmit={addHub}>
                  <Row>
                    <Col md="6">
                      <FormGroup>
                        <Label>Name</Label>
                        <Input value={hubForm.name} onChange={(e) => setHubForm({ ...hubForm, name: e.target.value })} required />
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label>Host (public IP)</Label>
                        <Input value={hubForm.host} onChange={(e) => setHubForm({ ...hubForm, host: e.target.value })} required />
                      </FormGroup>
                    </Col>
                    <Col md="4">
                      <FormGroup>
                        <Label>Location</Label>
                        <Input type="select" value={hubForm.location_type} onChange={(e) => setHubForm({ ...hubForm, location_type: e.target.value })}>
                          <option value="local">Local</option>
                          <option value="cloud">Cloud</option>
                        </Input>
                      </FormGroup>
                    </Col>
                    <Col md="4">
                      <FormGroup>
                        <Label>Subnet</Label>
                        <Input value={hubForm.subnet} onChange={(e) => setHubForm({ ...hubForm, subnet: e.target.value })} />
                      </FormGroup>
                    </Col>
                    <Col md="4">
                      <FormGroup>
                        <Label>SSH user</Label>
                        <Input value={hubForm.ssh_user} onChange={(e) => setHubForm({ ...hubForm, ssh_user: e.target.value })} />
                      </FormGroup>
                    </Col>
                  </Row>
                  <Button type="submit" color="primary" disabled={saving}>Add hub</Button>
                </Form>
              </div>
            </Card>
          ) : null}

          {selectedHub ? (
            <>
              {selectedHub.next_free_tunnel_ip ? (
                <Alert color="info" className="mb-3">
                  Suggested tunnel IP for {selectedHub.name}: <code>{selectedHub.next_free_tunnel_ip}</code>
                  {" "}({selectedHub.peers_count ?? 0} configured · {selectedHub.server_peers_count ?? 0} live on WireGuard)
                </Alert>
              ) : null}

              {wizardLoading ? <p className="text-soft">Loading MikroTik steps…</p> : null}
              {wizard?.steps?.map((step, i) => (
                <Card key={i} className="card-bordered mb-3">
                  <div className="card-inner">
                    <strong>Step {i + 1}: {step.title}</strong>
                    <div className="mt-2">
                      <CommandBlock text={typeof step.commands === "string" ? step.commands : step.commands?.join?.("\n") || ""} />
                    </div>
                  </div>
                </Card>
              ))}

              <Card className="card-bordered">
                <div className="card-inner">
                  <h6 className="mb-3">Save peer to {selectedHub.name}</h6>
                  <Form onSubmit={addPeer}>
                    <Row>
                      <Col md="6">
                        <FormGroup>
                          <Label>Peer name</Label>
                          <Input
                            value={peerForm.name}
                            onChange={(e) => setPeerForm({ ...peerForm, name: e.target.value })}
                            onBlur={loadWizard}
                            required
                            placeholder="faiba2-olt-router"
                          />
                        </FormGroup>
                      </Col>
                      <Col md="6">
                        <FormGroup>
                          <Label>Tunnel IP (optional)</Label>
                          <Input
                            value={peerForm.tunnel_ip}
                            onChange={(e) => setPeerForm({ ...peerForm, tunnel_ip: e.target.value })}
                            placeholder={selectedHub.next_free_tunnel_ip || "10.88.0.5"}
                          />
                        </FormGroup>
                      </Col>
                      <Col md="12">
                        <FormGroup>
                          <Label>MikroTik public key</Label>
                          <Input
                            type="textarea"
                            rows="2"
                            value={peerForm.public_key}
                            onChange={(e) => setPeerForm({ ...peerForm, public_key: e.target.value })}
                            required
                            placeholder="Paste from: /interface wireguard print detail"
                          />
                        </FormGroup>
                      </Col>
                      <Col md="12">
                        <FormGroup>
                          <Label>Allowed IPs (comma-separated, optional)</Label>
                          <Input
                            value={peerForm.allowed_ips}
                            onChange={(e) => setPeerForm({ ...peerForm, allowed_ips: e.target.value })}
                            placeholder="10.88.0.5/32,192.168.8.0/24"
                          />
                        </FormGroup>
                      </Col>
                    </Row>
                    <div className="d-flex justify-content-end gap-2">
                      <Link to={`${process.env.PUBLIC_URL}/admin/networking/vpn/dashboard`} className="btn btn-light">Cancel</Link>
                      <Button type="button" color="outline-primary" onClick={loadWizard}>Refresh steps</Button>
                      <Button type="submit" color="primary" disabled={saving}>{saving ? "Saving…" : "Save & sync to hub"}</Button>
                    </div>
                  </Form>
                </div>
              </Card>
            </>
          ) : (
            <Alert color="info">No VPN hubs configured.</Alert>
          )}
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default VpnAdd;
