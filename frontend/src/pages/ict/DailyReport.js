import React, { useCallback, useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
} from "reactstrap";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
} from "../../components/Component";
import { http } from "../../helpers";
import { showError, showSuccess } from "../../utils/notifications";
import { format, parseISO } from "date-fns";

const statusBadge = (status) => {
  const map = {
    pending: "warning",
    ok: "success",
    issue: "danger",
    draft: "secondary",
    in_progress: "info",
    submitted: "primary",
  };
  return <Badge color={map[status] || "light"}>{status || "—"}</Badge>;
};

const SectionCard = ({
  title,
  status,
  notes,
  checkedAt,
  link,
  disabled,
  onStatus,
  onNotes,
}) => (
  <Card className="card-bordered mb-3">
    <div className="card-inner">
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div>
          <h6 className="mb-1">{title}</h6>
          {checkedAt ? (
            <div className="text-soft small">
              Checked: {format(parseISO(checkedAt), "dd MMM yyyy HH:mm")}
            </div>
          ) : (
            <div className="text-soft small">Not checked yet</div>
          )}
        </div>
        {link ? (
          <Link to={link} className="btn btn-sm btn-outline-primary">
            Open
          </Link>
        ) : null}
      </div>
      <FormGroup>
        <Label>Status</Label>
        <Input
          type="select"
          value={status || ""}
          disabled={disabled}
          onChange={(e) => onStatus(e.target.value || null)}
        >
          <option value="">Select…</option>
          <option value="ok">OK</option>
          <option value="issue">Issue</option>
        </Input>
      </FormGroup>
      <FormGroup className="mb-0">
        <Label>Notes / findings</Label>
        <Input
          type="textarea"
          rows={3}
          value={notes || ""}
          disabled={disabled}
          placeholder="Write what you checked and what you found…"
          onChange={(e) => onNotes(e.target.value)}
        />
      </FormGroup>
    </div>
  </Card>
);

const IctDailyReport = ({ user }) => {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const roles = user?.all_roles || [];
  const canEdit =
    roles.includes("ict") ||
    roles.includes("super-administrator") ||
    roles.includes("administrator") ||
    roles.includes("manager");
  const isSuper = roles.includes("super-administrator");
  const readOnly = !canEdit || (report?.overall_status === "submitted" && !isSuper);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get(`/ict/daily-reports/${date}`);
      setReport(res.data.report);
    } catch (err) {
      showError(err?.response?.data?.message || err.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (fields) => setReport((r) => ({ ...r, ...fields }));

  const patchRouter = (routerId, fields) => {
    setReport((r) => ({
      ...r,
      routers: (r.routers || []).map((row) =>
        row.router_id === routerId ? { ...row, ...fields } : row
      ),
    }));
  };

  const save = async () => {
    if (!report) return;
    setSaving(true);
    try {
      const res = await http.post(`/ict/daily-reports/${date}`, {
        summary_status: report.summary_status,
        summary_notes: report.summary_notes,
        radius_status: report.radius_status,
        radius_notes: report.radius_notes,
        sms_status: report.sms_status,
        sms_notes: report.sms_notes,
        system_status: report.system_status,
        system_notes: report.system_notes,
        issues_followups: report.issues_followups,
        routers: (report.routers || []).map((r) => ({
          router_id: r.router_id,
          status: r.status,
          notes: r.notes,
        })),
      });
      setReport(res.data.report);
      showSuccess(res.data.message || "Saved");
    } catch (err) {
      showError(err?.response?.data?.message || err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await save();
      const res = await http.post(`/ict/daily-reports/${date}/submit`);
      setReport(res.data.report);
      showSuccess(res.data.message || "Submitted");
    } catch (err) {
      const missing = err?.response?.data?.missing;
      showError(
        missing?.length
          ? `${err.response.data.message}: ${missing.join("; ")}`
          : err?.response?.data?.message || err.message || "Submit failed"
      );
    } finally {
      setSaving(false);
    }
  };

  const reopen = async () => {
    setSaving(true);
    try {
      const res = await http.post(`/ict/daily-reports/${date}/reopen`);
      setReport(res.data.report);
      showSuccess("Report reopened");
    } catch (err) {
      showError(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const progress = useMemo(() => report?.progress || {}, [report]);

  return (
    <>
      <Head title="ICT Daily Report" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page>ICT Daily Report</BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          <Card className="card-bordered mb-3">
            <div className="card-inner">
              <Row className="g-3 align-items-end">
                <Col md="3">
                  <Label>Report date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Col>
                <Col md="3">
                  <div>Status: {report ? statusBadge(report.overall_status) : "—"}</div>
                  {report?.submitted_at ? (
                    <div className="text-soft small mt-1">
                      Submitted {format(parseISO(report.submitted_at), "dd MMM yyyy HH:mm")}
                    </div>
                  ) : null}
                </Col>
                <Col md="6" className="text-md-end">
                  {canEdit && !readOnly ? (
                    <>
                      <Button color="primary" className="me-2" disabled={saving || loading} onClick={save}>
                        {saving ? <Spinner size="sm" /> : "Save draft"}
                      </Button>
                      <Button color="success" disabled={saving || loading} onClick={submit}>
                        Submit for today
                      </Button>
                    </>
                  ) : null}
                  {isSuper && report?.overall_status === "submitted" ? (
                    <Button color="warning" className="ms-2" disabled={saving} onClick={reopen}>
                      Reopen
                    </Button>
                  ) : null}
                </Col>
              </Row>
              {report ? (
                <div className="mt-3 text-soft small">
                  Routers: {progress.routers_ok || 0} OK · {progress.routers_issue || 0} issue ·{" "}
                  {progress.routers_pending || 0} pending / {progress.routers_total || 0}
                </div>
              ) : null}
            </div>
          </Card>

          {loading ? (
            <div className="text-center py-5">
              <Spinner />
            </div>
          ) : report ? (
            <>
              <Card className="card-bordered mb-3">
                <div className="card-inner">
                  <h5 className="mb-3">1. Summary</h5>
                  <Row>
                    <Col md="3">
                      <FormGroup>
                        <Label>Overall</Label>
                        <Input
                          type="select"
                          disabled={readOnly}
                          value={report.summary_status || ""}
                          onChange={(e) => patch({ summary_status: e.target.value || null })}
                        >
                          <option value="">Select…</option>
                          <option value="ok">All clear</option>
                          <option value="issue">Issues found</option>
                        </Input>
                      </FormGroup>
                    </Col>
                    <Col md="9">
                      <FormGroup>
                        <Label>Headline notes</Label>
                        <Input
                          type="textarea"
                          rows={2}
                          disabled={readOnly}
                          value={report.summary_notes || ""}
                          onChange={(e) => patch({ summary_notes: e.target.value })}
                          placeholder="Short summary of the day…"
                        />
                      </FormGroup>
                    </Col>
                  </Row>
                </div>
              </Card>

              <h5 className="mb-2">2. MikroTik routers</h5>
              {(report.routers || []).map((row) => (
                <SectionCard
                  key={row.router_id}
                  title={row.router_title || `Router #${row.router_id}`}
                  status={row.status === "pending" ? "" : row.status}
                  notes={row.notes}
                  checkedAt={row.checked_at}
                  link={`/admin/networking/routers/view/${row.router_id}`}
                  disabled={readOnly}
                  onStatus={(v) => patchRouter(row.router_id, { status: v || "pending" })}
                  onNotes={(v) => patchRouter(row.router_id, { notes: v })}
                />
              ))}

              <h5 className="mb-2 mt-4">3. RADIUS</h5>
              <SectionCard
                title="RADIUS logs / auth health"
                status={report.radius_status}
                notes={report.radius_notes}
                checkedAt={report.radius_checked_at}
                link="/admin/administration/logs/radius"
                disabled={readOnly}
                onStatus={(v) => patch({ radius_status: v })}
                onNotes={(v) => patch({ radius_notes: v })}
              />

              <h5 className="mb-2">4. SMS</h5>
              <SectionCard
                title="SMS gateway / outbox"
                status={report.sms_status}
                notes={report.sms_notes}
                checkedAt={report.sms_checked_at}
                link="/admin/sms/outbox"
                disabled={readOnly}
                onStatus={(v) => patch({ sms_status: v })}
                onNotes={(v) => patch({ sms_notes: v })}
              />

              <h5 className="mb-2">5. Full system</h5>
              <SectionCard
                title="App, HA, GenieACS / TR-069, SmartOLT, OLTs"
                status={report.system_status}
                notes={report.system_notes}
                checkedAt={report.system_checked_at}
                link="/admin/administration/high-availability"
                disabled={readOnly}
                onStatus={(v) => patch({ system_status: v })}
                onNotes={(v) => patch({ system_notes: v })}
              />

              <Card className="card-bordered mb-3">
                <div className="card-inner">
                  <h5 className="mb-3">6. Issues & follow-ups</h5>
                  <Input
                    type="textarea"
                    rows={4}
                    disabled={readOnly}
                    value={report.issues_followups || ""}
                    onChange={(e) => patch({ issues_followups: e.target.value })}
                    placeholder="List open issues and next actions…"
                  />
                </div>
              </Card>
            </>
          ) : null}
        </Block>
      </Content>
    </>
  );
};

export default connect((state) => ({ user: state.user?.user || state.user }))(IctDailyReport);
