import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  BlockDes,
  Icon,
  Button,
} from "../../components/Component";
import {
  Card,
  Badge,
  Form,
  FormGroup,
  Label,
  Input,
  Spinner,
} from "reactstrap";
import { connect } from "react-redux";
import { http } from "../../helpers";
import TicketsAPI from "../../helpers/TicketsAPI";
import { format } from "date-fns";
import { findRosterTeamForUser } from "../../utils/parseDailyRosterWhatsApp";
import "./DailySchedule.css";

const memberInitials = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const PhoneLink = ({ phone }) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  const href = digits ? `tel:${digits}` : undefined;
  return href ? (
    <a href={href} className="daily-schedule-phone-link">
      {phone}
    </a>
  ) : (
    <span>{phone}</span>
  );
};

const DailySchedule = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allTechnicians, setAllTechnicians] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [currentSchedule, setCurrentSchedule] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [emptyMessage, setEmptyMessage] = useState("");

  const isTechnicianRole =
    user?.all_roles?.includes("technician") ||
    user?.all_roles?.includes("engineer");
  const isAdmin =
    user?.all_roles?.includes("administrator") ||
    user?.all_roles?.includes("super-administrator");
  const isManager = user?.all_roles?.includes("manager");
  const canEditRoster = isAdmin || isManager;

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const today = format(new Date(), "yyyy-MM-dd");
      let schedule = null;

      const scheduleRes = await http.get("/daily-schedule/today");
      if (scheduleRes?.data?.success && scheduleRes.data.data) {
        schedule = scheduleRes.data.data;
      }

      if (!schedule || schedule.source !== "roster") {
        const rosterRes = await http.get(`/daily-roster/by-date?date=${today}`);
        if (rosterRes?.data?.success && rosterRes.data.data) {
          const fromRoster = findRosterTeamForUser(
            rosterRes.data.data,
            user?.id
          );
          if (fromRoster) {
            schedule = fromRoster;
          } else if (rosterRes.data.data.teams?.length) {
            setEmptyMessage(
              `A roster exists for ${today} but your account is not linked on any team. Ask your manager to match your name in Team Roster.`
            );
          }
        } else {
          setEmptyMessage(
            scheduleRes?.data?.message ||
              `No Team Roster saved for ${today}. Ask your manager to save today's bulletin.`
          );
        }
      }

      if (schedule) {
        setCurrentSchedule(schedule);
        setSelectedMembers(
          schedule.members
            ? schedule.members.map((m) => Number(m.member_id))
            : []
        );
        setEmptyMessage("");
        setLoading(false);
        return;
      }

      setCurrentSchedule(null);

      if (canEditRoster) {
        const techList = await TicketsAPI.getAssignmentOptions();
        setAllTechnicians(Array.isArray(techList) ? techList : []);
        setSelectedMembers(user?.id ? [Number(user.id)] : []);
      } else {
        setAllTechnicians([]);
        setSelectedMembers([]);
      }
    } catch (err) {
      console.error("Error loading data:", err);
      setError("Failed to load schedule data");
    } finally {
      setLoading(false);
    }
  };

  const handleMemberToggle = (memberId) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSave = async () => {
    try {
      setError("");
      setSuccess("");
      setSaving(true);

      if (selectedMembers.length === 0) {
        setError("Please select at least one technician");
        setSaving(false);
        return;
      }

      const memberIds = [
        ...new Set(
          [
            ...selectedMembers.map((id) => Number(id)),
            user?.id ? Number(user.id) : null,
          ].filter(Boolean)
        ),
      ];

      const response = await http.post("/daily-schedule/save", {
        member_ids: memberIds,
      });

      if (response?.data?.success) {
        const schedule = response.data.data;
        schedule.source = "manual";
        setCurrentSchedule(schedule);
        setSuccess("Schedule saved for today (manual override).");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(response?.data?.error || "Failed to save schedule");
      }
    } catch (err) {
      console.error("Error saving schedule:", err);
      setError(err?.response?.data?.error || "Error saving schedule");
    } finally {
      setSaving(false);
    }
  };

  const filteredTechnicians = allTechnicians.filter((tech) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      (tech.name || "").toLowerCase().includes(q) ||
      (tech.email || "").toLowerCase().includes(q)
    );
  });

  const selectAllVisible = () => {
    const ids = filteredTechnicians.map((t) => Number(t.id));
    setSelectedMembers((prev) => [...new Set([...prev, ...ids])]);
  };

  const clearSelection = () => {
    setSelectedMembers(user?.id ? [Number(user.id)] : []);
  };

  const isRosterTeam = currentSchedule?.source === "roster";
  const showManualFallback = !isRosterTeam && canEditRoster;

  if (!isTechnicianRole && !isAdmin && !isManager) {
    return (
      <React.Fragment>
        <Head title="Access Denied" />
        <Content>
          <Block className="daily-schedule-page">
            <Card className="card-bordered">
              <div className="card-inner p-4 text-center">
                <Icon name="alert-circle" className="text-danger mb-2" />
                <h5>Access Denied</h5>
                <p className="text-muted mb-0">
                  Only technicians, engineers, and administrators can access
                  this page.
                </p>
              </div>
            </Card>
          </Block>
        </Content>
      </React.Fragment>
    );
  }

  const teamLabel = currentSchedule?.team_title || "Your team";
  const teamPhone = currentSchedule?.team_phone;
  const teamExtra = currentSchedule?.team_extra_info;

  return (
    <React.Fragment>
      <Head title="Daily Team Schedule" />
      <Content>
        <div className="daily-schedule-page">
          <BlockHead size="sm">
            <div className="nk-block-between daily-schedule-head">
              <BlockHeadContent>
                <BlockTitle page>Daily Team Schedule</BlockTitle>
                <BlockDes className="text-soft">
                  <p className="daily-schedule-date">
                    {format(new Date(), "EEEE, MMMM d")}
                  </p>
                  <small className="text-muted daily-schedule-desc">
                    Your team comes from the manager&apos;s Team Roster for
                    today. Shared routers and inventory on tickets follow this
                    group. Tickets assigned to any teammate on today&apos;s
                    roster are visible to the whole team.
                  </small>
                </BlockDes>
              </BlockHeadContent>
              {canEditRoster && (
                <BlockHeadContent className="daily-schedule-head-action">
                  <Link
                    to="/admin/tickets/daily-roster"
                    className="btn btn-outline-primary"
                  >
                    <Icon name="users" />
                    <span>Team Roster</span>
                  </Link>
                </BlockHeadContent>
              )}
            </div>
          </BlockHead>

          <Block>
            <Card className="card-bordered daily-schedule-main-card">
              <div className="card-inner">
                {error && (
                  <div
                    className="alert alert-danger daily-schedule-alert"
                    role="alert"
                  >
                    <Icon name="alert-circle" />
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div
                    className="alert alert-success daily-schedule-alert"
                    role="alert"
                  >
                    <Icon name="check-circle" />
                    <span>{success}</span>
                  </div>
                )}

                {loading ? (
                  <div className="text-center daily-schedule-loading">
                    <Spinner color="primary" />
                  </div>
                ) : isRosterTeam ? (
                  <div>
                    <div className="daily-schedule-team-hero">
                      <div className="daily-schedule-team-hero-inner">
                        <div className="daily-schedule-team-icon">
                          <Icon name="users" className="text-primary" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h6 className="daily-schedule-team-title">
                            {teamLabel}
                          </h6>
                          {(teamPhone || teamExtra) && (
                            <p className="daily-schedule-team-meta">
                              {teamPhone && (
                                <>
                                  <PhoneLink phone={teamPhone} />
                                  {teamExtra ? " · " : null}
                                </>
                              )}
                              {teamExtra}
                            </p>
                          )}
                          <Badge
                            color="success"
                            className="daily-schedule-roster-badge"
                          >
                            From manager roster
                          </Badge>
                          <ul
                            className="daily-schedule-members daily-schedule-members--chips"
                            aria-label="Team members"
                          >
                            {currentSchedule.members.map((member) => {
                              const isYou =
                                Number(member.member_id) === Number(user?.id);
                              return (
                                <li
                                  key={member.member_id}
                                  className={`daily-schedule-member${
                                    isYou ? " is-you" : ""
                                  }`}
                                >
                                  <span
                                    className="daily-schedule-member-avatar"
                                    aria-hidden
                                  >
                                    {memberInitials(member.member_name)}
                                  </span>
                                  <span className="daily-schedule-member-name">
                                    {member.member_name}
                                    {isYou && (
                                      <span className="daily-schedule-member-you">
                                        You
                                      </span>
                                    )}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    </div>
                    <p className="daily-schedule-footnote">
                      Set by your manager in{" "}
                      <Link to="/admin/tickets/daily-roster">Team Roster</Link>.
                      Ticket inventory already uses this group — no setup needed
                      here.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div
                      className="alert alert-warning daily-schedule-alert"
                      role="alert"
                    >
                      <Icon name="alert-circle" />
                      <span>
                        {canEditRoster ? (
                          <>
                            No roster team found for you today. Post
                            today&apos;s bulletin in{" "}
                            <Link to="/admin/tickets/daily-roster">
                              Team Roster
                            </Link>{" "}
                            first, or use the manual override below.
                          </>
                        ) : (
                          emptyMessage ||
                          "No team roster for today yet. Ask your manager to post today's team bulletin in Team Roster before you work tickets."
                        )}
                      </span>
                    </div>

                    {showManualFallback && (
                      <Form>
                        <FormGroup>
                          <div className="daily-schedule-override-toolbar">
                            <Label className="daily-schedule-override-label">
                              <strong>Manual team override</strong>
                              <Badge color="warning">
                                {selectedMembers.length} selected
                              </Badge>
                            </Label>
                            <div className="daily-schedule-override-actions">
                              <Button
                                size="sm"
                                color="light"
                                type="button"
                                onClick={selectAllVisible}
                                disabled={filteredTechnicians.length === 0}
                              >
                                Select all
                              </Button>
                              <Button
                                size="sm"
                                color="light"
                                type="button"
                                onClick={clearSelection}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>

                          <Input
                            type="search"
                            placeholder="Search name or email…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="daily-schedule-search mb-3"
                            autoComplete="off"
                            enterKeyHint="search"
                          />

                          <div
                            className="schedule-checklist daily-schedule-checklist"
                            role="listbox"
                            aria-label="Select team members"
                          >
                            {filteredTechnicians.length === 0 ? (
                              <p className="text-muted mb-0 py-4 text-center">
                                No technicians or engineers found.
                              </p>
                            ) : (
                              filteredTechnicians.map((tech) => {
                                const memberId = Number(tech.id);
                                const isSelected =
                                  selectedMembers.includes(memberId);
                                return (
                                  <div
                                    key={tech.id}
                                    role="option"
                                    aria-selected={isSelected}
                                    tabIndex={0}
                                    className={`daily-schedule-checklist-item${
                                      isSelected ? " is-selected" : ""
                                    }`}
                                    onClick={() => handleMemberToggle(memberId)}
                                    onKeyDown={(e) => {
                                      if (
                                        e.key === "Enter" ||
                                        e.key === " "
                                      ) {
                                        e.preventDefault();
                                        handleMemberToggle(memberId);
                                      }
                                    }}
                                  >
                                    <Input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() =>
                                        handleMemberToggle(memberId)
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label={`Select ${tech.name}`}
                                    />
                                    <div className="daily-schedule-checklist-body">
                                      <span className="daily-schedule-checklist-name">
                                        {tech.name}
                                      </span>
                                      {tech.email && (
                                        <span className="daily-schedule-checklist-email">
                                          {tech.email}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </FormGroup>

                        {currentSchedule?.source === "manual" &&
                          currentSchedule.members?.length > 0 && (
                            <div className="daily-schedule-override-preview">
                              <p className="text-muted small mb-2">
                                <strong>Current manual override</strong>
                              </p>
                              <div className="daily-schedule-override-chips">
                                {currentSchedule.members.map((member) => (
                                  <Badge
                                    key={member.member_id}
                                    color="warning"
                                    style={{
                                      padding: "8px 12px",
                                      fontSize: "0.85rem",
                                    }}
                                  >
                                    {member.member_name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                        <div className="daily-schedule-save-wrap">
                          <Button
                            color="warning"
                            onClick={handleSave}
                            disabled={saving || selectedMembers.length === 0}
                          >
                            {saving ? (
                              <>
                                <Spinner size="sm" className="mr-2" />
                                Saving…
                              </>
                            ) : (
                              <>
                                <Icon name="save" className="mr-1" />
                                Save manual override
                              </>
                            )}
                          </Button>
                        </div>
                      </Form>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </Block>

          <Block className="daily-schedule-how">
            <Card className="card-bordered daily-schedule-info-card">
              <div className="card-inner">
                <h6 className="title mb-3">How it works</h6>
                <div className="daily-schedule-how-item">
                  <Icon name="check-circle-fill" className="text-success" />
                  <span>
                    Managers post the daily WhatsApp bulletin in Team Roster
                  </span>
                </div>
                <div className="daily-schedule-how-item">
                  <Icon name="check-circle-fill" className="text-success" />
                  <span>
                    Your team here is picked automatically from that roster
                  </span>
                </div>
                <div className="daily-schedule-how-item">
                  <Icon name="check-circle-fill" className="text-success" />
                  <span>
                    Ticket routers, inventory, and assigned tickets are shared
                    with everyone on your roster team
                  </span>
                </div>
              </div>
            </Card>
          </Block>
        </div>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(DailySchedule);
