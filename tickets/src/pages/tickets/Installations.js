import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Card, Row, Col, Table } from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Button, Icon } from "../../components/Component";
import moment from "moment";
import { isInstallationMenuType } from "../../config/ticketTypes";

const POPOVER_WIDTH = 220;
const POPOVER_CONTENT_MAX_HEIGHT = 300;

// Helper function to format assignedTo name (extract username from "Name (email)" format)
const formatAssignedToName = (assignedTo) => {
  if (!assignedTo || assignedTo === '0' || assignedTo === '-') return 'Unassigned';
  
  const assignedStr = assignedTo.toString().trim();
  
  // If it contains parentheses, extract the name part before them
  const match = assignedStr.match(/^(.+?)\s*\(/);
  if (match) {
    return match[1].trim();
  }
  
  // If it looks like an email (contains @), extract the part before @ and format it
  if (assignedStr.includes('@')) {
    const emailName = assignedStr.split('@')[0];
    return emailName
      .split(/[._-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  // Otherwise return as-is (it's already a username/name)
  return assignedStr;
};

const tabs = [
  { key: "unassigned", label: "Unassigned" },
  { key: "today", label: "Today" },
  { key: "monthly", label: "This Month" },
  { key: "pending", label: "Pending" },
];

const INSTALLATIONS_FILTER_KEY = 'tickets_installations_filters_v1';
const defaultInstallationsFilters = { status: 'all', start: '', end: '', addedBy: 'all', search: '' };

const Installations = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [installations, setInstallations] = useState([]);
  const [totalInstallationCount, setTotalInstallationCount] = useState(0); // Total including archived
  const [installationStatsWithArchived, setInstallationStatsWithArchived] = useState({
    total: 0,
    unassigned: 0,
    today: 0,
    monthly: 0,
    pending: 0
  }); // All stats including archived
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [filters, setFilters] = useState(() => {
    try {
      const saved = sessionStorage.getItem(INSTALLATIONS_FILTER_KEY);
      return saved ? { ...defaultInstallationsFilters, ...JSON.parse(saved) } : defaultInstallationsFilters;
    } catch { return defaultInstallationsFilters; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(INSTALLATIONS_FILTER_KEY, JSON.stringify(filters)); } catch {}
  }, [filters]);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  // Assignee popover state
  const [assignPopover, setAssignPopover] = useState({
    open: false,
    ticketId: null,
    top: 0,
    left: 0,
    selected: '',
    arrowLeft: 16
  });

  // Agent options
  const [assignToOptions, setAssignToOptions] = useState([
    { value: "0", label: "Unassigned" }
  ]);
  
  // Load assignment options from API
  useEffect(() => {
    const loadAssignees = async () => {
      try {
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        const technicians = await TicketsAPI.getAssignmentOptions();
        if (technicians && technicians.length > 0) {
          setAssignToOptions([{ value: "0", label: "Unassigned" }, ...technicians]);
        }
      } catch (error) {
        console.error('Error loading assignment options:', error);
      }
    };
    loadAssignees();
  }, []);
  
  // Keep these for backward compatibility if needed
  const legacyAssignToOptions = [
    { value: "0", label: "Unassigned" },
    { value: "1", label: "Main Admin (admin)" },
    { value: "40", label: "Margaret Ngigi (margaret)" },
    { value: "41", label: "Cyrus Kiagayo (Cyrus)" },
    { value: "42", label: "Miriam Maina (Miriam)" },
    { value: "43", label: "Jedidah thuku (Jedidah)" },
    { value: "44", label: "Victor Obare (Victor)" },
    { value: "45", label: "Newton Ndungu (Newton)" },
    { value: "46", label: "Richard Kamanga (Richard)" },
    { value: "47", label: "Gilbert Chebii (Gilbert)" },
    { value: "48", label: "Alex Thuku (Alex)" },
    { value: "49", label: "Brian Bandi (Brian)" },
    { value: "50", label: "Erick Ogongo (Erick)" },
    { value: "51", label: "Ezekiel Njuguna (Ezekiel)" },
    { value: "52", label: "Caroline Mwangi (Carol)" },
    { value: "54", label: "Wachira Muthoga (Wachira)" },
    { value: "55", label: "Ronald Ndungu (Ronald)" },
    { value: "56", label: "Ordax Kisangi (Ordax)" },
    { value: "57", label: "Samson Njuguna (Njuguna)" },
    { value: "58", label: "Alice Muthoni (Alice)" },
    { value: "59", label: "Eugine Ngotho (Eugine)" },
    { value: "60", label: "Sammy Gathitu (Sammy)" },
    { value: "62", label: "Duncan Wambugu (Mwangi)" },
    { value: "63", label: "joram (joram)" }
  ];

  // Mobile resize handler
  useEffect(() => {
    const handleResize = () => {
      const mobileNow = window.innerWidth < 768;
      setIsMobile(mobileNow);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      handleResize();
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { default: TicketsAPI } = await import("../../helpers/TicketsAPI");
      
      // Fetch installation stats (includes archived) for all stat cards
      const statsResp = await TicketsAPI.getInstallationStats();
      const statsData = statsResp?.data || {};
      setTotalInstallationCount(statsData.total || 0);
      
      // Store all stats from API for display
      setInstallationStatsWithArchived({
        total: statsData.total || 0,
        unassigned: statsData.unassigned || 0,
        today: statsData.today || 0,
        monthly: statsData.monthly || 0,
        pending: statsData.pending || 0
      });
      
      // Fetch active (non-archived) installations for the list
      const resp = await TicketsAPI.getAll({
        type: 'Installation',
        per_page: 10000
      });
      const items = (resp.data || [])
        .filter((t) => isInstallationMenuType(t.type || t.typeLabel))
        .map(t => {
        const formatted = formatAssignedToName(t.assignedTo);
        return { ...t, assignedTo: formatted === 'Unassigned' ? t.assignedTo : formatted };
      });
      setInstallations(items);
      setLastRefresh(new Date());
    } catch (e) {
      console.error("Failed to load installations", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Check for unassigned filter in URL
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam === 'unassigned') {
      setActiveTab('unassigned');
      setFilters(prev => ({ ...prev, status: 'all' }));
    }
  }, [searchParams]);

  const stats = useMemo(() => {
    // Use stats from API which include archived tickets
    return {
      unassigned: installationStatsWithArchived.unassigned,
      today: installationStatsWithArchived.today,
      monthly: installationStatsWithArchived.monthly,
      pending: installationStatsWithArchived.pending,
      total: installationStatsWithArchived.total,
    };
  }, [installationStatsWithArchived]);

  const filtered = useMemo(() => installations, [installations]);

  const statusBadge = (status) => {
    const s = (status || "").toString().toLowerCase();
    const color = s === "installation complete" || s === "resolved"
      ? "#29cc97"
      : s.includes("progress")
      ? "#ffc914"
      : s.includes("waiting")
      ? "#ff6b6b"
      : "#6c757d";
    return <span className="badge" style={{ backgroundColor: color }}>{status || "-"}</span>;
  };

  const applyFilters = (list) => {
    return list.filter((t) => {
      // Apply search filter
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const subject = (t.subject || '').toLowerCase();
        const name = (t.customer_name || t.customerName || '').toLowerCase();
        const phone = (t.customer_phone || t.customerPhone || '').toString().toLowerCase();
        const id = (t.id || '').toString();
        const number = (t.number || '').toString().toLowerCase();
        const assigned = (t.assignedTo || '').toString().toLowerCase();
        const address = (t.address || '').toString().toLowerCase();
        if (!subject.includes(q) && !name.includes(q) && !phone.includes(q) && !id.includes(q) && !number.includes(q) && !assigned.includes(q) && !address.includes(q)) return false;
      }

      // Apply tab filter first
      const now = moment();
      const isComplete = (t.status || "").toString().toLowerCase() === "installation complete";
      const isUnassigned = !t.assignedTo || (t.assignedTo || "").toString().trim() === "";
      const updatedAt = t.updated_at || t.updatedAt || t.created_at;
      
      if (activeTab === "unassigned" && !isUnassigned) return false;
      if (activeTab === "today" && (!isComplete || !moment(updatedAt).isSame(now, "day"))) return false;
      if (activeTab === "monthly" && (!isComplete || !moment(updatedAt).isSame(now, "month"))) return false;
      if (activeTab === "pending" && isComplete) return false;
      
      // Apply status filter
      const status = (t.status || '').toString().toLowerCase();
      if (filters.status !== 'all' && status !== filters.status.toLowerCase()) return false;
      
      // Apply creator filter
      const creator = (t.createdBy || t.created_by || '').toString().toLowerCase();
      if (filters.addedBy !== 'all' && creator !== filters.addedBy.toLowerCase()) return false;
      
      // Apply date range filters (use updated_at)
      if (filters.start) {
        const updated = updatedAt ? moment(updatedAt) : null;
        if (!updated || updated.isBefore(moment(filters.start), 'day')) return false;
      }
      if (filters.end) {
        const updated = updatedAt ? moment(updatedAt) : null;
        if (!updated || updated.isAfter(moment(filters.end), 'day')) return false;
      }
      return true;
    });
  };

  const openAssignPopover = (ticket, event) => {
    event.stopPropagation(); // Prevent navigation when clicking popover trigger
    const rect = event.currentTarget.getBoundingClientRect();
    const selected = ticket.assignedTo || '';
    const popoverWidth = POPOVER_WIDTH;

    const desiredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, desiredLeft));
    const top = rect.bottom + 10;

    const anchorCenter = rect.left + rect.width / 2;
    const rawArrowLeft = anchorCenter - left;
    const arrowLeft = Math.max(12, Math.min(popoverWidth - 24, rawArrowLeft));

    setAssignPopover({
      open: true,
      ticketId: ticket.id,
      top,
      left,
      selected,
      arrowLeft
    });
  };

  const closeAssignPopover = () => {
    setAssignPopover((prev) => ({ ...prev, open: false }));
  };

  const selectAssignee = async (value) => {
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      // Convert value "0" to empty string for unassigned, otherwise use the value (username)
      let assignedTo = value === "0" ? "0" : value;
      
      await TicketsAPI.update(assignPopover.ticketId, { assignedTo, updated_at: new Date().toISOString() });
      setInstallations((prev) => prev.map((t) => t.id === assignPopover.ticketId ? { ...t, assignedTo, updated_at: new Date().toISOString() } : t));
      setAssignPopover((prev) => ({ ...prev, open: false }));
    } catch (e) {
      console.error('Failed to update assignee', e);
      setAssignPopover((prev) => ({ ...prev, open: false }));
    }
  };

  // Close popover on escape or click outside
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeAssignPopover();
      }
    };
    const onClick = (e) => {
      const el = document.querySelector('#webuiPopoverAssign');
      const clickedInside = el && el.contains(e.target);
      if (assignPopover.open && !clickedInside) closeAssignPopover();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [assignPopover.open]);

  return (
    <React.Fragment>
      <Head title="Installations" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <BlockTitle page tag="h3">Installations</BlockTitle>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button className={`btn btn-outline-dark btn-icon ${loading ? "disabled" : ""}`} onClick={load} disabled={loading} title="Refresh">
                  <Icon name={loading ? "loader" : "reload"} className={loading ? "spinning" : ""} />
                </Button>
                <span style={{ fontSize: 12, color: "#6c757d" }}>Last updated: {lastRefresh.toLocaleTimeString()}</span>
              </div>
            </div>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          <Row className="g-gs dashboard-top">
            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Icon name="grid" />
                    </span>
                    <span className="text">Total</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">All Installations</span>
                    <span className="count">{loading ? "..." : (stats.total || 0)}</span>
                  </div>
                </div>
              </Card>
            </Col>
            {[{ key: "unassigned", label: "Unassigned" }, { key: "today", label: "Today" }, { key: "monthly", label: "This Month" }, { key: "pending", label: "Pending" }].map((tab) => (
              <Col key={tab.key} sm="6" md="3" className="dashboards-top-block-item">
                <Card onClick={() => setActiveTab(tab.key)} style={{ cursor: "pointer", border: activeTab === tab.key ? "2px solid #357bf2" : undefined }}>
                  <div className="card-inner p-0">
                    <div className="dashboards-top-block-item-title">
                      <span className="icon-wrap">
                        <Icon name="grid" />
                      </span>
                      <span className="text">{tab.label}</span>
                    </div>
                    <div className="dashboards-top-block-item-bottom">
                      <span className="view">Installations</span>
                      <span className="count">{loading ? "..." : (stats[tab.key] || 0)}</span>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Block>

        <Block>
          <Card>
            <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong>Installation Tickets</strong>
              <div className="btn-group">
                {tabs.map((t) => (
                  <Button key={t.key} className={`btn btn-outline-primary ${activeTab === t.key ? "active" : ""}`} onClick={() => setActiveTab(t.key)}>{t.label}</Button>
                ))}
              </div>
            </div>
            <div className="card-body">
              <div className="row g-2 mb-3">
                <div className="col-md-4">
                  <label className="form-label">Search</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="search"
                      className="form-control"
                      placeholder="Search by name, phone, subject, ID..."
                      value={filters.search}
                      onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                      style={{ paddingRight: 36 }}
                    />
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#8094ae', pointerEvents: 'none' }}>
                      <Icon name="search" />
                    </span>
                  </div>
                </div>
                <div className="col-md-2">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={filters.status} onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}>
                    <option value="all">All</option>
                    <option value="new">New</option>
                    <option value="work in progress">Work in progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="installation complete">Installation complete</option>
                    <option value="waiting on customer">Waiting on customer</option>
                    <option value="waiting on agent">Waiting on agent</option>
                  </select>
                </div>
                <div className="col-md-2">
                  <label className="form-label">Added by</label>
                  <select className="form-control" value={filters.addedBy} onChange={(e) => setFilters(prev => ({ ...prev, addedBy: e.target.value }))}>
                    <option value="all">All</option>
                    {Array.from(new Set(filtered.map(t => (t.createdBy || t.created_by || '').toString()).filter(Boolean))).map(name => (
                      <option key={name} value={name.toLowerCase()}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-2">
                  <label className="form-label">From</label>
                  <input type="date" className="form-control" value={filters.start} onChange={(e) => setFilters(prev => ({ ...prev, start: e.target.value }))} />
                </div>
                <div className="col-md-2">
                  <label className="form-label">To</label>
                  <input type="date" className="form-control" value={filters.end} onChange={(e) => setFilters(prev => ({ ...prev, end: e.target.value }))} />
                </div>
              </div>
              <div style={{ 
                overflowX: isMobile ? 'auto' : 'visible',
                WebkitOverflowScrolling: 'touch',
                ...(isMobile && {
                  maxWidth: '100vw',
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#cbd5e1 #f1f5f9'
                })
              }}>
                <Table 
                  responsive={!isMobile} 
                  className="table-striped" 
                  style={{
                    backgroundColor: '#fff',
                    tableLayout: isMobile ? 'auto' : 'fixed', 
                    width: isMobile ? 'max-content' : '100%',
                    minWidth: isMobile ? '700px' : 'auto',
                    margin: 0
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ 
                        width: isMobile ? '60px' : '80px', 
                        minWidth: '60px',
                        padding: isMobile ? '8px 6px' : '8px 12px',
                        fontSize: isMobile ? '11px' : '14px',
                        fontWeight: '600'
                      }}>ID</th>
                      <th style={{
                        width: isMobile ? '150px' : '200px',
                        minWidth: '150px',
                        padding: isMobile ? '8px 6px' : '8px 12px',
                        fontSize: isMobile ? '11px' : '14px',
                        fontWeight: '600'
                      }}>Subject</th>
                      <th style={{ 
                        width: isMobile ? '90px' : '140px',
                        minWidth: '90px',
                        padding: isMobile ? '8px 6px' : '8px 12px',
                        fontSize: isMobile ? '11px' : '14px',
                        fontWeight: '600'
                      }}>Status</th>
                      {!isMobile && (
                        <th style={{ width: 160, padding: '8px 12px', fontSize: '14px', fontWeight: '600' }}>Added by</th>
                      )}
                      <th style={{
                        width: isMobile ? '100px' : '160px',
                        minWidth: '100px',
                        padding: isMobile ? '8px 6px' : '8px 12px',
                        fontSize: isMobile ? '11px' : '14px',
                        fontWeight: '600'
                      }}>Assigned</th>
                      <th style={{
                        width: isMobile ? '90px' : '180px',
                        minWidth: '90px',
                        padding: isMobile ? '8px 6px' : '8px 12px',
                        fontSize: isMobile ? '11px' : '14px',
                        fontWeight: '600'
                      }}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={isMobile ? 5 : 6} className="text-center text-muted">Loading...</td></tr>
                    ) : applyFilters(filtered).length === 0 ? (
                      <tr><td colSpan={isMobile ? 5 : 6} className="text-center text-muted">No installations found</td></tr>
                    ) : (
                      applyFilters(filtered).map((t) => (
                        <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/admin/tickets/view/${t.id}`, { state: { ticket: t } })}>
                          <td style={{
                            padding: isMobile ? '6px 4px' : '8px 12px',
                            fontSize: isMobile ? '12px' : '14px',
                            fontWeight: 'bold'
                          }}>
                            #{t.id}
                          </td>
                          <td style={{
                            padding: isMobile ? '6px 4px' : '8px 12px',
                            fontSize: isMobile ? '11px' : '14px'
                          }}>
                            {isMobile && (t.subject || "Installation").length > 20 ? 
                              `${(t.subject || "Installation").slice(0, 20)}...` : 
                              (t.subject || "Installation")
                            }
                          </td>
                          <td style={{
                            padding: isMobile ? '6px 4px' : '8px 12px',
                            fontSize: isMobile ? '10px' : '14px'
                          }}>
                            {statusBadge(t.status)}
                          </td>
                          {!isMobile && (
                            <td style={{ padding: '8px 12px', fontSize: '14px' }}>
                              {t.createdBy || t.created_by || 'Unknown'}
                            </td>
                          )}
                          <td style={{
                            padding: isMobile ? '6px 4px' : '8px 12px',
                            fontSize: isMobile ? '11px' : '14px'
                          }}>
                            <span 
                              onClick={(e) => openAssignPopover(t, e)}
                              style={{ 
                                cursor: 'pointer', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                display: 'inline-block',
                                fontSize: isMobile ? '10px' : '14px'
                              }}
                              title="Click to change assignee"
                            >
                              {(() => {
                                const formattedName = formatAssignedToName(t.assignedTo);
                                return isMobile && formattedName.length > 10 ? 
                                  `${formattedName.slice(0, 10)}...` : 
                                  formattedName;
                              })()}
                            </span>
                          </td>
                          <td style={{
                            padding: isMobile ? '6px 4px' : '8px 12px',
                            fontSize: isMobile ? '10px' : '14px'
                          }}>
                            {t.updated_at ? 
                              moment(t.updated_at).local().format(isMobile ? "MM/DD" : "YYYY-MM-DD HH:mm") : 
                              "-"
                            }
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            </div>
          </Card>
        </Block>
      </Content>

      {/* Assignee Popover */}
      {assignPopover.open && (
        <div
          id="webuiPopoverAssign"
          className="webui-popover bottom-left in"
          style={{
            position: 'fixed',
            top: assignPopover.top,
            left: assignPopover.left,
            display: 'block',
            width: POPOVER_WIDTH,
            zIndex: 1050,
            backgroundColor: '#fff',
            border: '1px solid #e5e9f2',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
        >
          <div className="webui-arrow" style={{ left: assignPopover.arrowLeft }}></div>
          <div className="webui-popover-inner" style={{ padding: '8px' }}>
            <h6 className="webui-popover-title" style={{ fontSize: '12px', fontWeight: '600', color: '#364a63', margin: '0 0 8px 0' }}>
              Assign to
            </h6>
            <div className="webui-popover-content">
              <div className="popover-scroll" style={{ maxHeight: POPOVER_CONTENT_MAX_HEIGHT, overflowY: 'auto' }}>
                <ul className="popover-dropdown" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {assignToOptions.map((opt) => {
                    const optValue = opt.value === "0" ? "" : opt.value;
                    const isSelected = assignPopover.selected === optValue;
                    return (
                      <li 
                        key={opt.value}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => selectAssignee(opt.value)}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#364a63',
                          borderRadius: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: isSelected ? '#f0f4f8' : 'transparent',
                          borderLeft: isSelected ? '3px solid #357bf2' : 'none'
                        }}
                      >
                        <span>{opt.label}</span>
                        {isSelected && (
                          <Icon name="check" className="text-success" style={{ fontSize: '14px', color: '#29cc97' }} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
};

export default Installations;
