import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Nav,
  NavItem,
  NavLink,
  Row,
  TabContent,
  TabPane,
} from "reactstrap";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import {
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
} from "../../components/Component";
import { downloadCompanyProfilePdf } from "../../helpers/companyProfilePdf";
import {
  CP_FIELD_GROUPS,
  applyCompanyProfileContent,
  loadCompanyProfileContent,
  resetCompanyProfileContent,
  saveCompanyProfileContent,
} from "../../helpers/companyProfileContent";
import "./CompanyProfile.css";

const PROFILE_PATH = `${process.env.PUBLIC_URL || ""}/company-profile/tonycomm-company-profile.html`;

const CompanyProfile = () => {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportLabel, setExportLabel] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [savedContent, setSavedContent] = useState(() => loadCompanyProfileContent());
  const [draft, setDraft] = useState(() => loadCompanyProfileContent());
  const [editOpen, setEditOpen] = useState(false);
  const [editTab, setEditTab] = useState(CP_FIELD_GROUPS[0].id);
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const getDoc = useCallback(() => {
    const iframe = iframeRef.current;
    return iframe?.contentDocument || iframe?.contentWindow?.document || null;
  }, []);

  const applyToPreview = useCallback(
    (content) => {
      const doc = getDoc();
      if (!doc) return;
      applyCompanyProfileContent(doc, content);
    },
    [getDoc]
  );

  const handleIframeLoad = useCallback(() => {
    const content = loadCompanyProfileContent();
    setSavedContent(content);
    applyCompanyProfileContent(getDoc(), content);
    setLoading(false);
  }, [getDoc]);

  useEffect(() => {
    if (!editOpen) return;
    setDraft(loadCompanyProfileContent());
    setDirty(false);
    setEditTab(CP_FIELD_GROUPS[0].id);
  }, [editOpen]);

  const refreshPreview = () => {
    setLoading(true);
    setIframeKey((k) => k + 1);
  };

  const openFullProfile = () => {
    window.open(PROFILE_PATH, "_blank", "noopener,noreferrer");
  };

  const openEditor = () => {
    if (loading) {
      window.alert("Preview is still loading. Try again in a moment.");
      return;
    }
    setEditOpen(true);
  };

  const updateField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const previewDraft = () => {
    applyToPreview(draft);
    setSaveMsg("Preview updated — not saved yet.");
  };

  const saveEdits = () => {
    const merged = saveCompanyProfileContent(draft);
    setSavedContent(merged);
    setDraft(merged);
    applyToPreview(merged);
    setDirty(false);
    setSaveMsg("Saved. Preview and PDF will use this content on this device.");
    window.setTimeout(() => setSaveMsg(""), 2500);
  };

  const resetEdits = () => {
    if (!window.confirm("Reset all profile text back to the default Tonycomm content?")) return;
    const defaults = resetCompanyProfileContent();
    setSavedContent(defaults);
    setDraft(defaults);
    applyToPreview(defaults);
    setDirty(false);
    setSaveMsg("Reset to defaults.");
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  const downloadPdf = useCallback(async () => {
    if (exporting) return;
    const doc = getDoc();
    if (!doc || loading) {
      window.alert("Preview is still loading. Try again in a moment.");
      return;
    }

    applyCompanyProfileContent(doc, loadCompanyProfileContent());

    setExporting(true);
    setExportLabel("Preparing PDF…");
    try {
      await downloadCompanyProfilePdf(doc, {
        filename: "Tonycomm-Company-Profile-2026.pdf",
        onProgress: ({ page, total, label }) => {
          if (label) {
            setExportLabel(label);
          } else if (page > 0) {
            setExportLabel(`Creating PDF page ${page} of ${total}…`);
          }
        },
      });
      setExportLabel("Downloaded");
      window.setTimeout(() => setExportLabel(""), 1500);
    } catch (err) {
      console.error(err);
      window.alert(err?.message || "Failed to download PDF. Please try again.");
      setExportLabel("");
    } finally {
      setExporting(false);
    }
  }, [exporting, loading, getDoc]);

  const fieldCount = useMemo(
    () => CP_FIELD_GROUPS.reduce((n, g) => n + g.fields.length, 0),
    []
  );

  return (
    <React.Fragment>
      <Head title="Company Profile" />
      <Content>
        <div className="cp-page">
          <BlockHead size="sm">
            <BlockBetween className="g-3">
              <BlockHeadContent>
                <div className="cp-kicker">Company</div>
                <div className="d-flex align-items-center mt-1">
                  <div className="cp-head-icon">
                    <Icon name="briefcase" />
                  </div>
                  <div>
                    <BlockTitle page tag="h3" className="mb-0">
                      Company Profile
                    </BlockTitle>
                    <p className="cp-blurb mb-0">
                      Preview, edit company profile text, and download as PDF.
                    </p>
                  </div>
                </div>
              </BlockHeadContent>
              <BlockHeadContent>
                <div className="cp-actions">
                  <Button color="light" outline className="btn-dim" onClick={refreshPreview} disabled={exporting}>
                    <Icon name="reload" />
                    <span>Refresh</span>
                  </Button>
                  <Button color="light" outline className="btn-dim" onClick={openFullProfile} disabled={exporting}>
                    <Icon name="external" />
                    <span>Open full</span>
                  </Button>
                  <Button color="secondary" onClick={openEditor} disabled={exporting || loading}>
                    <Icon name="edit" />
                    <span>Edit content</span>
                  </Button>
                  <Button color="primary" onClick={downloadPdf} disabled={exporting || loading}>
                    <Icon name="download" className={exporting ? "spinning" : ""} />
                    <span>{exporting ? exportLabel || "Downloading…" : "Download PDF"}</span>
                  </Button>
                </div>
              </BlockHeadContent>
            </BlockBetween>
          </BlockHead>

          <Block>
            <div className="cp-hint">
              <Icon name="info" />
              <span>
                Use <strong>Edit content</strong> to change cover, services, and contact text. Changes save in this
                browser and apply to the preview and PDF download.
                {saveMsg ? ` ${saveMsg}` : ""}
              </span>
            </div>

            <PreviewCard bodyClass="p-0 cp-preview-card">
              <div className="cp-preview-toolbar">
                <div>
                  <h6 className="cp-preview-title mb-0">Live preview</h6>
                  <span className="cp-muted">
                    Tonycomm Company Profile 2026 · {fieldCount} editable fields
                    {dirty ? " · unsaved draft in editor" : ""}
                  </span>
                </div>
                <span className={`cp-status ${loading ? "is-loading" : exporting ? "is-loading" : "is-ready"}`}>
                  {loading ? "Loading…" : exporting ? "Exporting…" : "Ready"}
                </span>
              </div>
              <div className="cp-iframe-wrap">
                {loading ? (
                  <div className="cp-iframe-loading">
                    <div className="spinner-border text-primary spinner-border-sm me-2" role="status" />
                    Loading company profile…
                  </div>
                ) : null}
                {exporting ? (
                  <div className="cp-iframe-loading">
                    <div className="spinner-border text-primary spinner-border-sm me-2" role="status" />
                    {exportLabel || "Creating PDF…"}
                  </div>
                ) : null}
                <iframe
                  key={iframeKey}
                  ref={iframeRef}
                  title="Tonycomm Company Profile"
                  src={`${PROFILE_PATH}?embed=1`}
                  className="cp-iframe"
                  onLoad={handleIframeLoad}
                />
              </div>
            </PreviewCard>
          </Block>
        </div>
      </Content>

      <Modal isOpen={editOpen} toggle={() => setEditOpen(false)} size="xl" className="cp-edit-modal" scrollable>
        <ModalHeader toggle={() => setEditOpen(false)}>
          Edit company profile
          {dirty ? <span className="cp-edit-dirty">Unsaved</span> : null}
        </ModalHeader>
        <ModalBody className="cp-edit-body">
          <Nav tabs className="cp-edit-tabs">
            {CP_FIELD_GROUPS.map((group) => (
              <NavItem key={group.id}>
                <NavLink
                  href="#cp-edit"
                  className={editTab === group.id ? "active" : ""}
                  onClick={(e) => {
                    e.preventDefault();
                    setEditTab(group.id);
                  }}
                >
                  {group.label}
                </NavLink>
              </NavItem>
            ))}
          </Nav>

          <TabContent activeTab={editTab} className="cp-edit-tab-content">
            {CP_FIELD_GROUPS.map((group) => (
              <TabPane tabId={group.id} key={group.id}>
                <Row className="g-3">
                  {group.fields.map((field) => (
                    <Col md={field.type === "textarea" ? 12 : 6} key={field.key}>
                      <FormGroup className="mb-0">
                        <Label className="cp-edit-label" for={`cp-${field.key}`}>
                          {field.label}
                          {field.html ? <span className="cp-edit-html-tag">HTML</span> : null}
                        </Label>
                        <Input
                          id={`cp-${field.key}`}
                          type={field.type === "textarea" ? "textarea" : "text"}
                          rows={field.rows || 3}
                          value={draft[field.key] != null ? draft[field.key] : ""}
                          onChange={(e) => updateField(field.key, e.target.value)}
                        />
                      </FormGroup>
                    </Col>
                  ))}
                </Row>
              </TabPane>
            ))}
          </TabContent>

          {saveMsg ? <div className="cp-edit-msg">{saveMsg}</div> : null}
        </ModalBody>
        <ModalFooter className="cp-edit-footer">
          <Button color="light" outline onClick={resetEdits}>
            Reset defaults
          </Button>
          <div className="ms-auto d-flex gap-2">
            <Button color="light" outline onClick={previewDraft}>
              Preview changes
            </Button>
            <Button color="primary" onClick={saveEdits}>
              Save
            </Button>
          </div>
        </ModalFooter>
      </Modal>
    </React.Fragment>
  );
};

export default CompanyProfile;
