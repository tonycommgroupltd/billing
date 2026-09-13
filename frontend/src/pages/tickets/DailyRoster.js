import React, { useState, useEffect, useCallback, useMemo } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Icon,
  Button,
} from "../../components/Component";
import {
  Card,
  Form,
  FormGroup,
  Label,
  Input,
  Spinner,
  Row,
  Col,
} from "reactstrap";
import { Link } from "react-router-dom";
import { connect } from "react-redux";
import { format, parseISO } from "date-fns";
import { ticketsHttp as http } from "../../helpers/ticketsHttp";
import TicketsAPI from "../../helpers/TicketsAPI";
import { showError, showSuccess } from "../../utils/notifications";
import {
  buildDailyRosterWhatsAppText,
  whatsAppPreviewLines,
  isWhatsAppBoldLine,
  stripWhatsAppBold,
  whatsAppShareUrl,
} from "../../utils/dailyRosterWhatsApp";
import {
  parseDailyRosterWhatsApp,
  memberOverrideKey,
  applyMemberOverrides,
  getUnmatchedMembers,
  overridesFromSavedTeams,
} from "../../utils/parseDailyRosterWhatsApp";
import { canManageFleet } from "../../utils/fleetAccess";

const WhatsAppBulletinPreview = ({ text }) => {
  const lines = whatsAppPreviewLines(text || "");
  return (
    <div
      style={{
        background: "#e5ddd5",
        borderRadius: 12,
        padding: 16,
        minHeight: 200,
        fontFamily: "Segoe UI, Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "8px 8px 8px 2px",
          padding: "12px 14px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
          fontSize: "0.92rem",
          lineHeight: 1.55,
          color: "#111b21",
        }}
      >
        {!text?.trim() ? (
          <span className="text-muted">Your message preview appears here</span>
        ) : (
          lines.map((line, idx) => {
            if (!line.trim()) {
              return <div key={idx} style={{ height: 8 }} />;
            }
            if (isWhatsAppBoldLine(line)) {
              return (
                <div key={idx} style={{ fontWeight: 700 }}>
                  {stripWhatsAppBold(line)}
                </div>
              );
            }
            return <div key={idx}>{line}</div>;
          })
        )}
      </div>
    </div>
  );
};

const canEditRoster = (user) => canManageFleet(user);

const NameMatchingPanel = ({
  teams,
  staffOptions,
  memberOverrides,
  onOverrideChange,
}) => {
  if (!teams?.length) return null;

  const unmatched = getUnmatchedMembers(teams, memberOverrides);

  return (
    <Card className="border mb-4" style={{ background: "#f8fafc" }}>
      <div className="card-inner py-3">
        <Label className="mb-2">
          <strong>Match names to system users</strong>
        </Label>
        <p className="text-muted small mb-3">
          WhatsApp names are matched automatically. If a name is different from the
          account, pick the correct technician or engineer from the dropdown.
        </p>

        {unmatched.length > 0 && (
          <div className="alert alert-warning py-2 px-3 small mb-3">
            <Icon name="alert-circle" className="mr-1" />
            {unmatched.length} name{unmatched.length !== 1 ? "s" : ""} need
            to be linked before technicians can use today&apos;s schedule.
          </div>
        )}

        {teams.map((team, teamIdx) => (
          <div key={`match-team-${teamIdx}`} className="mb-3">
            <div className="small font-weight-bold text-primary mb-2">
              {team.team_title || `Team ${teamIdx + 1}`}
              {team.phone ? ` · ${team.phone}` : ""}
            </div>
            {(team.members || []).map((member, memberIdx) => {
              const key = memberOverrideKey(team, member);
              const overrideId = memberOverrides[key];
              const resolvedId = overrideId || member.user_id || "";
              const isMatched = Boolean(resolvedId);
              const staff = staffOptions.find(
                (s) => Number(s.id) === Number(resolvedId)
              );
              const pasted = member.pasted_label || member.member_name;

              return (
                <div
                  key={key}
                  className="d-flex flex-wrap align-items-center gap-2 mb-2"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: isMatched ? "#ecfdf5" : "#fffbeb",
                    border: `1px solid ${isMatched ? "#a7f3d0" : "#fcd34d"}`,
                  }}
                >
                  <span style={{ minWidth: 90, fontWeight: 600 }}>{pasted}</span>
                  {!isMatched && (
                    <span className="text-warning small">⚠ No matching user</span>
                  )}
                  {isMatched && (
                    <span className="text-success small">✓ {staff?.name || "Linked"}</span>
                  )}
                  <Input
                    type="select"
                    bsSize="sm"
                    style={{ maxWidth: 260, flex: "1 1 200px" }}
                    value={resolvedId ? String(resolvedId) : ""}
                    onChange={(e) =>
                      onOverrideChange(key, e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">— Select system user —</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.email ? ` (${s.email})` : ""}
                      </option>
                    ))}
                  </Input>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
};

const PLACEHOLDER = `*TUESDAY/09/06/26*

*TEAM A LOS 0756310170*

NEWTON
LEWIS

*TEAM B LOS 0752804988 MOTORBIKE*

VICTOR
DAN

*WIRELESS*

ALEX
WACHIRA`;

const DailyRoster = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [rosterDate, setRosterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [messageText, setMessageText] = useState("");
  const [hasSavedRecord, setHasSavedRecord] = useState(false);
  const [staffOptions, setStaffOptions] = useState([]);
  const [memberOverrides, setMemberOverrides] = useState({});
  const [error, setError] = useState("");

  const editable = canEditRoster(user);

  const parsed = useMemo(() => {
    if (!messageText.trim()) return null;
    return parseDailyRosterWhatsApp(messageText, staffOptions);
  }, [messageText, staffOptions]);

  const teamsWithOverrides = useMemo(() => {
    if (!parsed?.teams?.length) return [];
    return applyMemberOverrides(parsed.teams, staffOptions, memberOverrides);
  }, [parsed, staffOptions, memberOverrides]);

  const unmatchedCount = useMemo(
    () => getUnmatchedMembers(teamsWithOverrides, memberOverrides).length,
    [teamsWithOverrides, memberOverrides]
  );

  const loadRoster = useCallback(async (date, staff = []) => {
    try {
      setLoading(true);
      setError("");
      const res = await http.get(`/daily-roster/by-date?date=${date}`);
      if (res?.data?.success && res.data.data) {
        const roster = res.data.data;
        const saved = (roster.whatsapp_source || "").trim();

        if ((roster.teams || []).length > 0) {
          setMemberOverrides(overridesFromSavedTeams(roster.teams));
        } else {
          setMemberOverrides({});
        }

        if (saved) {
          setMessageText(roster.whatsapp_source);
          setHasSavedRecord(true);
        } else if ((roster.teams || []).length > 0) {
          const rebuilt = buildDailyRosterWhatsAppText(
            roster.roster_date || date,
            roster.teams,
            roster.notes || "",
            staff
          );
          setMessageText(rebuilt);
          setHasSavedRecord(true);
        } else {
          setMessageText("");
          setHasSavedRecord(false);
        }
      } else {
        setMessageText("");
        setHasSavedRecord(false);
        setMemberOverrides({});
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load roster");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    TicketsAPI.getAssignmentOptions().then((list) => {
      setStaffOptions(Array.isArray(list) ? list : []);
    });
  }, []);

  useEffect(() => {
    loadRoster(rosterDate, staffOptions);
  }, [rosterDate, staffOptions, loadRoster]);

  const handleOverrideChange = (key, userId) => {
    setMemberOverrides((prev) => {
      const next = { ...prev };
      if (userId) next[key] = userId;
      else delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    if (!messageText.trim()) {
      showError("Paste or type the daily schedule message first");
      return;
    }
    if (!parsed?.teams?.length) {
      showError("Could not read any teams from the message. Check *bold* team headers.");
      return;
    }
    if (unmatchedCount > 0) {
      showError(
        `Please link ${unmatchedCount} name(s) to system users using the dropdowns below`
      );
      return;
    }

    setSaving(true);
    try {
      // Date picker is the operational day — not the date line inside the WhatsApp text.
      const teams = applyMemberOverrides(parsed.teams, staffOptions, memberOverrides);

      const payload = {
        roster_date: rosterDate,
        notes: parsed.notes || "",
        whatsapp_source: messageText.trim(),
        teams: teams.map((t, idx) => ({
          team_title: (t.team_title || "").trim(),
          phone: (t.phone || "").trim(),
          extra_info: (t.extra_info || "").trim(),
          sort_order: idx,
          members: (t.members || [])
            .filter((m) => m.user_id)
            .map((m, midx) => ({
              member_name: (m.member_name || "").trim(),
              pasted_label: (m.pasted_label || m.member_name || "").trim(),
              user_id: Number(m.user_id),
              sort_order: midx,
            })),
        })),
      };

      const res = await http.post("/daily-roster/save", payload);
      if (res?.data?.success) {
        const saved = res.data.data?.whatsapp_source || messageText.trim();
        setMessageText(saved);
        setHasSavedRecord(true);
        setMemberOverrides(overridesFromSavedTeams(res.data.data?.teams || teams));
        showSuccess("Saved — message and team links kept on record for this day");
      } else {
        showError(res?.data?.error || "Failed to save");
      }
    } catch (err) {
      showError(err?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!messageText.trim()) {
      showError("Nothing to copy");
      return;
    }
    setCopying(true);
    try {
      await navigator.clipboard.writeText(messageText);
      showSuccess("Copied — paste into your WhatsApp group");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = messageText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showSuccess("Copied — paste into your WhatsApp group");
    } finally {
      setCopying(false);
    }
  };

  if (!editable) {
    return (
      <React.Fragment>
        <Head title="Daily Team Roster" />
        <Content>
          <Block>
            <Card className="card-bordered p-4 text-center">
              <Icon name="alert-circle" className="text-danger mb-2" />
              <h5>Access Denied</h5>
              <p className="text-muted mb-0">
                Only super administrators, managers and administrators can edit the daily team roster.
              </p>
            </Card>
          </Block>
        </Content>
      </React.Fragment>
    );
  }

  const dateLabel = format(parseISO(rosterDate), "EEEE, d MMMM yyyy");

  return (
    <React.Fragment>
      <Head title="Daily Team Roster" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page>Daily Team Roster</BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        {error && <div className="alert alert-danger">{error}</div>}

        <Row className="g-gs">
          <Col lg="7">
            <Block>
              <Card className="card-bordered">
                <div className="card-inner">
                  {loading ? (
                    <div className="text-center py-5">
                      <Spinner color="primary" />
                    </div>
                  ) : (
                    <Form>
                      <FormGroup>
                        <Label>
                          <strong>Date</strong>
                        </Label>
                        <Input
                          type="date"
                          value={rosterDate}
                          onChange={(e) => setRosterDate(e.target.value)}
                        />
                        <small className="text-muted d-block mt-1">{dateLabel}</small>
                        {parsed?.rosterDate && parsed.rosterDate !== rosterDate ? (
                          <small className="text-warning d-block mt-1">
                            Bulletin header says {format(parseISO(parsed.rosterDate), "d MMM yyyy")} —
                            saving under the date picker above ({format(parseISO(rosterDate), "d MMM yyyy")}).
                            Technicians see teams for the picker date.
                          </small>
                        ) : null}
                        {hasSavedRecord ? (
                          <small className="text-success d-block mt-1">
                            ✓ Saved message loaded for this date — edit below if needed
                          </small>
                        ) : (
                          <small className="text-muted d-block mt-1">
                            No saved message for this date yet — paste your WhatsApp bulletin below
                          </small>
                        )}
                      </FormGroup>

                      <FormGroup>
                        <Label>
                          <strong>Daily schedule message</strong>
                          <span className="text-muted ml-2" style={{ fontWeight: 400 }}>
                            (exact text — same as WhatsApp)
                          </span>
                        </Label>
                        <Input
                          type="textarea"
                          rows={18}
                          value={messageText}
                          onChange={(e) => {
                            setMessageText(e.target.value);
                            setMemberOverrides({});
                          }}
                          placeholder={PLACEHOLDER}
                          style={{
                            fontFamily: "inherit",
                            fontSize: "0.9rem",
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                          }}
                        />
                      </FormGroup>

                      {parsed?.teams?.length > 0 && (
                        <NameMatchingPanel
                          teams={parsed.teams}
                          staffOptions={staffOptions}
                          memberOverrides={memberOverrides}
                          onOverrideChange={handleOverrideChange}
                        />
                      )}

                      <div className="d-flex flex-wrap gap-2">
                        <Button
                          color="primary"
                          type="button"
                          onClick={handleSave}
                          disabled={saving || !messageText.trim() || unmatchedCount > 0}
                        >
                          {saving ? (
                            <>
                              <Spinner size="sm" className="mr-2" />
                              Saving…
                            </>
                          ) : (
                            <>
                              <Icon name="save" className="mr-1" />
                              Save
                            </>
                          )}
                        </Button>
                        <Button
                          color="success"
                          type="button"
                          onClick={handleCopy}
                          disabled={copying || !messageText.trim()}
                        >
                          <Icon name="copy" className="mr-1" />
                          {copying ? "Copying…" : "Copy for WhatsApp"}
                        </Button>
                        <Button
                          color="light"
                          type="button"
                          onClick={() => {
                            setMessageText("");
                            setHasSavedRecord(false);
                          }}
                        >
                          Clear
                        </Button>
                      </div>
                    </Form>
                  )}
                </div>
              </Card>
            </Block>
          </Col>

          <Col lg="5">
            <Block>
              <Card className="card-bordered">
                <div className="card-inner">
                  <h6 className="title mb-2">Preview</h6>
                  <p className="text-muted small mb-3">
                    How it will look in WhatsApp after you copy and paste.
                  </p>
                  <WhatsAppBulletinPreview text={messageText} />

                  {messageText.trim() && (
                    <>
                      <Button
                        color="success"
                        block
                        className="mt-3"
                        type="button"
                        onClick={handleCopy}
                        disabled={copying}
                      >
                        <Icon name="copy" className="mr-1" />
                        Copy message for WhatsApp
                      </Button>
                      <a
                        href={whatsAppShareUrl(messageText)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline-success btn-block mt-2"
                        style={{ display: "block", textAlign: "center" }}
                      >
                        Open in WhatsApp
                      </a>
                    </>
                  )}
                </div>
              </Card>

              <Card className="card-bordered mt-3">
                <div className="card-inner">
                  <h6 className="title mb-2">How to use</h6>
                  <ol className="text-muted small pl-3 mb-0">
                    <li>Select the <strong>date</strong></li>
                    <li>Paste or edit the <strong>exact</strong> WhatsApp bulletin in the box</li>
                    <li>Link any <strong>unmatched names</strong> with the dropdown</li>
                    <li><strong>Save</strong> — text + team links stored for that day</li>
                    <li><strong>Copy</strong> — post again in the group anytime</li>
                    <li>Assign drivers and odometer on{" "}
                      <Link to="/admin/fleet">Fleet → Vehicles &amp; Team</Link>
                    </li>
                  </ol>
                </div>
              </Card>
            </Block>
          </Col>
        </Row>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(DailyRoster);
