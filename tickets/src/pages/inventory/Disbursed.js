import React, { useState, useEffect, useRef, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  BlockDes,
  Row,
  Col,
  Button,
  RSelect,
} from "../../components/Component";
import {
  Card,
  Badge,
  Spinner,
  Form,
  FormGroup,
  Label,
  Input,
} from "reactstrap";
import { connect } from "react-redux";
import { Link, Navigate } from "react-router-dom";
import InventoryAPI from "../../helpers/InventoryAPI";
import {
  DROP_CABLE_CATEGORY,
  findCableRollMatch,
  formatDropCableBalance,
  getPendingCableItemLabel,
  getCableTypeLabel,
  getRollMetersFromItem,
  isCableRollNumber,
  isDropCable,
  isMeterUnit,
  normalizeCableRollInput,
} from "../../utils/inventoryCable";
import { buildByUserSummary } from "../../utils/disbursementHistory";
import TeamInventoryModal from "../../components/inventory/TeamInventoryModal";

function normalizeHandheldScan(raw) {
  return (raw || "").replace(/[\r\n\t]/g, "").trim();
}

// ── Section header ──────────────────────────────────────────────────────────
const SectionLabel = ({ children }) => (
  <div className="mb-3 mt-1">
    <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#8094ae" }}>
      {children}
    </span>
    <hr className="mt-1 mb-0" style={{ borderColor: "#e7eaf0" }} />
  </div>
);

const DisbursedInventory = ({ user }) => {
  const isAdmin = user?.all_roles?.some(r =>
    ["super-administrator", "administrator", "manager"].includes(r)
  );

  // ── Users list ─────────────────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // ── Assignment form state ──────────────────────────────────────────────────
  const [assignMode, setAssignMode] = useState("router"); // "router" | "cable" | "item"
  const [selectedUser, setSelectedUser] = useState(null);  // { id, name, email }

  // Router scan session
  const [scanInput, setScanInput] = useState("");
  const [scanStatus, setScanStatus] = useState("idle"); // idle | saving | success | error | dup
  const [scanMessage, setScanMessage] = useState("");
  const [sessionLog, setSessionLog] = useState([]);   // [{disbId, routerNo, serial, assignedTo}]
  const sessionLogRef = useRef([]);
  const scanInputRef = useRef(null);

  // Drop cable roll scan (T400, etc.)
  const [cableScanInput, setCableScanInput] = useState("");
  const [cableScanStatus, setCableScanStatus] = useState("idle");
  const [cableScanMessage, setCableScanMessage] = useState("");
  const [cableScanResults, setCableScanResults] = useState([]);
  const [cableScanSearching, setCableScanSearching] = useState(false);
  const [cableSessionLog, setCableSessionLog] = useState([]);
  const cableSessionLogRef = useRef([]);
  const cableScanInputRef = useRef(null);
  const cableSearchTimer = useRef(null);
  const allCableRollsRef = useRef([]);

  const loadAllCableRolls = useCallback(async () => {
    try {
      const res = await InventoryAPI.getItems({ category: DROP_CABLE_CATEGORY, status: "active" });
      const all = Array.isArray(res?.data) ? res.data : [];
      allCableRollsRef.current = all.filter(isCableRollNumber);
    } catch {
      allCableRollsRef.current = [];
    }
  }, []);

  // Other-item assignment
  const [otherItems, setOtherItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [assignQty, setAssignQty] = useState(1);
  const [assignNotes, setAssignNotes] = useState("");
  const [itemSaving, setItemSaving] = useState(false);
  const [itemError, setItemError] = useState("");
  const [itemSuccess, setItemSuccess] = useState("");

  const selectedDisburseItem = otherItems.find((i) => String(i.id) === String(selectedItemId)) || null;
  const selectedRollMeters = getRollMetersFromItem(selectedDisburseItem);

  // Session tracking for "Done" summary
  const [sessionItems, setSessionItems] = useState([]); // [{name, category, quantity}]
  const [doneLoading, setDoneLoading]   = useState(false);
  const [doneMessage, setDoneMessage]   = useState(null); // {type: "success"|"error", text}

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await InventoryAPI.getUsers();
      setUsers(Array.isArray(res?.data) ? res.data : []);
    } catch { setUsers([]); }
    finally { setUsersLoading(false); }
  }, []);

  const loadOtherItems = useCallback(async () => {
    try {
      const res = await InventoryAPI.getItems({ status: "active" });
      const all = Array.isArray(res?.data) ? res.data : [];
      setOtherItems(all.filter(i => i.category !== "GPON Router" && i.category !== DROP_CABLE_CATEGORY));
    } catch { setOtherItems([]); }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await InventoryAPI.listDisbursements();
      setHistory(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadOtherItems();
    loadHistory();
    loadAllCableRolls();
  }, [loadUsers, loadOtherItems, loadHistory, loadAllCableRolls]);

  // Keep ref in sync
  useEffect(() => { sessionLogRef.current = sessionLog; }, [sessionLog]);
  useEffect(() => { cableSessionLogRef.current = cableSessionLog; }, [cableSessionLog]);

  useEffect(() => {
    if (!selectedUser) return;
    if (assignMode === "router") {
      requestAnimationFrame(() => scanInputRef.current?.focus());
    } else if (assignMode === "cable") {
      requestAnimationFrame(() => cableScanInputRef.current?.focus());
    }
  }, [assignMode, selectedUser]);

  // ── User select options for RSelect ───────────────────────────────────────
  // users[] comes from tickets.php/assignment-options: { id, name, email, label, value }
  const userOptions = users.map(u => ({ value: u.id, label: u.label || u.name, name: u.name, email: u.email, id: u.id }));

  const selectUser = (u) => {
    setSelectedUser(u);
    setSessionLog([]);
    sessionLogRef.current = [];
    setScanInput("");
    setScanStatus("idle");
    setScanMessage("");
    setItemError("");
    setItemSuccess("");
    setSessionItems([]);
    setCableSessionLog([]);
    cableSessionLogRef.current = [];
    setCableScanInput("");
    setCableScanStatus("idle");
    setCableScanMessage("");
    setDoneMessage(null);
  };

  // ── Router live search as-you-type ────────────────────────────────────────
  const [scanResults, setScanResults] = useState([]);   // live search dropdown
  const [scanSearching, setScanSearching] = useState(false);
  const scanSearchTimer = useRef(null);

  const handleScanInputChange = (val) => {
    setScanInput(val);
    setScanStatus("idle");
    setScanMessage("");
    setScanResults([]);
    clearTimeout(scanSearchTimer.current);
    if (val.trim().length < 2) return;
    scanSearchTimer.current = setTimeout(async () => {
      setScanSearching(true);
      try {
        const res = await InventoryAPI.getItems({ search: val.trim(), category: "GPON Router" });
        const all = Array.isArray(res?.data) ? res.data : [];
        const q = val.trim().toLowerCase();
        const matches = all.filter(i =>
          // router number (name) starts with or equals input
          (i.name || "").toLowerCase().includes(q) ||
          // last N chars of serial match
          (i.serial_number || "").toLowerCase().endsWith(q) ||
          // full serial contains
          (i.serial_number || "").toLowerCase().includes(q)
        ).slice(0, 8);
        setScanResults(matches);
      } catch { /* ignore */ }
      finally { setScanSearching(false); }
    }, 280);
  };

  // ── Router scan: save one router (by router object or raw query string) ────
  const saveRouterAssignment = useCallback(async (query, routerObj = null) => {
    if (!selectedUser) return;
    if (!query && !routerObj) return;

    setScanResults([]);

    let router = routerObj;

    if (!router) {
      const q = query.trim();
      // Duplicate check by the typed value first
      if (sessionLogRef.current.some(s =>
        s.serial.toLowerCase() === q.toLowerCase() ||
        s.routerNo.toLowerCase() === q.toLowerCase()
      )) {
        setScanStatus("dup");
        setScanMessage(`${q} already assigned in this session`);
        return;
      }

      setScanStatus("saving");
      setScanMessage("Searching…");

      // Fetch matching routers
      const res = await InventoryAPI.getItems({ search: q, category: "GPON Router" });
      const all = Array.isArray(res?.data) ? res.data : [];
      const ql = q.toLowerCase();

      // Priority: exact name match, then exact serial, then serial suffix
      router =
        all.find(i => (i.name || "").toLowerCase() === ql) ||
        all.find(i => (i.serial_number || "").toLowerCase() === ql) ||
        all.find(i => (i.serial_number || "").toLowerCase().endsWith(ql));

      if (!router && all.length === 1) router = all[0]; // single result → use it

      if (!router) {
        if (all.length > 1) {
          // Multiple matches — show dropdown for user to pick
          setScanResults(all.slice(0, 8));
          setScanStatus("idle");
          setScanMessage(`${all.length} routers match "${q}" — please select one below`);
          return;
        }
        setScanStatus("error");
        setScanMessage(`"${q}" not found — try router number (e.g. C102) or last 4 chars of serial`);
        return;
      }
    }

    // Duplicate check by serial
    if (sessionLogRef.current.some(s => s.serial === (router.serial_number || ""))) {
      setScanStatus("dup");
      setScanMessage(`${router.name} already assigned in this session`);
      return;
    }

    setScanStatus("saving");
    setScanMessage("Saving…");

    try {
      if (router.status === "disbursed") {
        setScanStatus("dup");
        setScanMessage(`${router.name} is already disbursed to ${router.assigned_to_name || "someone"}`);
        return;
      }

      const addedBy = user?.name || user?.username || user?.email || "Unknown";
      const routerSerial = router.serial_number || "";
      const disburse = await InventoryAPI.createDisbursement({
        type: "router",
        item_id: router.id,
        item_name: router.name,
        item_category: "GPON Router",
        serial_number: routerSerial,
        assigned_to_id: selectedUser.id,
        assigned_to_name: selectedUser.name,
        assigned_by_id: user?.id ?? null,
        assigned_by_name: addedBy,
        quantity: 1,
        notes: "",
      });

      const disbId = disburse?.data?.id ?? null;
      const patch = disburse?.patchcord || null;
      const entry = {
        disbId,
        routerNo: router.name,
        serial: routerSerial,
        assignedTo: selectedUser.name,
        patchcord: patch ? {
          disbId: patch.disbursement_id || null,
          name: patch.item_name || "Patch Cord",
          quantity: patch.quantity || 1,
        } : { name: "Patch Cord", quantity: 1 },
      };
      setSessionLog(prev => [entry, ...prev]);
      setScanStatus("success");
      setScanMessage(`✓ ${router.name} + 1 Patch Cord → ${selectedUser.name}`);
      setScanInput("");
      loadHistory();
    } catch (err) {
      const msg = err?.response?.data?.error || "Failed to assign router";
      setScanStatus("error");
      setScanMessage(msg);
    } finally {
      requestAnimationFrame(() => scanInputRef.current?.focus());
    }
  }, [selectedUser, user, loadHistory]);

  const handleScanKey = (e) => {
    if (e.key === "Enter") {
      const val = normalizeHandheldScan(scanInput);
      if (val) saveRouterAssignment(val);
    }
  };

  const handleCableScanInputChange = (val) => {
    setCableScanInput(val);
    setCableScanStatus("idle");
    setCableScanMessage("");
    setCableScanResults([]);
    clearTimeout(cableSearchTimer.current);
    if (val.trim().length < 1) return;
    cableSearchTimer.current = setTimeout(() => {
      const { matches } = findCableRollMatch(allCableRollsRef.current, val.trim());
      setCableScanResults(matches);
    }, 200);
  };

  const saveCableAssignment = useCallback(async (query, rollObj = null) => {
    if (!selectedUser) return;
    if (!query && !rollObj) return;
    setCableScanResults([]);

    let roll = rollObj;
    if (!roll) {
      const q = normalizeCableRollInput(query);
      if (cableSessionLogRef.current.some(s => s.rollNo.toUpperCase() === q)) {
        setCableScanStatus("dup");
        setCableScanMessage(`${q} already assigned this session`);
        return;
      }
      setCableScanStatus("saving");
      setCableScanMessage("Searching…");
      if (allCableRollsRef.current.length === 0) {
        await loadAllCableRolls();
      }
      const { roll: found, matches } = findCableRollMatch(allCableRollsRef.current, query);
      roll = found;
      if (!roll) {
        if (matches.length > 1) {
          setCableScanResults(matches);
          setCableScanStatus("idle");
          setCableScanMessage(`${matches.length} rolls match — select one`);
          return;
        }
        setCableScanStatus("error");
        const hint = /^\d+$/.test(String(query).trim())
          ? `Try full number T${String(query).trim()} or add it under Inventory → Feed Cable Rolls`
          : "Add this roll under Inventory → Feed Cable Rolls first";
        setCableScanMessage(`Roll "${q}" not found — ${hint}`);
        return;
      }
    }

    if (cableSessionLogRef.current.some(s => s.rollNo === roll.name)) {
      setCableScanStatus("dup");
      setCableScanMessage(`${roll.name} already in this session`);
      return;
    }
    if (roll.status === "disbursed") {
      setCableScanStatus("dup");
      setCableScanMessage(`${roll.name} already issued to ${roll.assigned_to_name || "someone"}`);
      return;
    }

    setCableScanStatus("saving");
    setCableScanMessage("Saving…");
    try {
      const mpp = getRollMetersFromItem(roll);
      const typeLabel = getCableTypeLabel(mpp);
      const addedBy = user?.name || user?.username || user?.email || "Unknown";
      const disburse = await InventoryAPI.createDisbursement({
        type: "item",
        item_id: roll.id,
        item_name: typeLabel,
        item_category: DROP_CABLE_CATEGORY,
        serial_number: roll.name,
        assigned_to_id: selectedUser.id,
        assigned_to_name: selectedUser.name,
        assigned_by_id: user?.id ?? null,
        assigned_by_name: addedBy,
        quantity: 1,
        notes: `Roll ${roll.name}`,
      });
      const disbId = disburse?.data?.id ?? null;
      const entry = { disbId, rollNo: roll.name, typeLabel, meters: mpp };
      setCableSessionLog(prev => [entry, ...prev]);
      setCableScanStatus("success");
      setCableScanMessage(`✓ ${roll.name} (${typeLabel}) → ${selectedUser.name}`);
      setCableScanInput("");
      loadHistory();
      loadAllCableRolls();
    } catch (err) {
      setCableScanStatus("error");
      setCableScanMessage(err?.response?.data?.error || "Failed to assign cable roll");
    } finally {
      requestAnimationFrame(() => cableScanInputRef.current?.focus());
    }
  }, [selectedUser, user, loadHistory, loadAllCableRolls]);

  const handleCableScanKey = (e) => {
    if (e.key === "Enter") {
      const val = normalizeHandheldScan(cableScanInput);
      if (val) saveCableAssignment(val);
    }
  };

  const undoLastCableScan = async () => {
    const last = cableSessionLog[0];
    if (!last?.disbId) return;
    try {
      await InventoryAPI.deleteDisbursement(last.disbId, user?.id ?? null, user?.name || user?.username || null);
      setCableSessionLog(prev => prev.slice(1));
      setCableScanStatus("idle");
      setCableScanMessage("");
      loadHistory();
    } catch { /* ignore */ }
  };

  // Undo last router scan
  const undoLastScan = async () => {
    const last = sessionLog[0];
    if (!last?.disbId) return;
    try {
      await InventoryAPI.deleteDisbursement(last.disbId, user?.id ?? null, user?.name || user?.username || null);
      setSessionLog(prev => prev.slice(1));
      setScanStatus("idle");
      setScanMessage("");
      loadHistory();
    } catch { /* ignore */ }
  };

  // ── Other-item assignment submit ───────────────────────────────────────────
  const handleItemAssign = async (e) => {
    e.preventDefault();
    if (!selectedUser || !selectedItemId) return;
    setItemError("");
    setItemSuccess("");
    setItemSaving(true);
    try {
      const item = otherItems.find(i => String(i.id) === String(selectedItemId));
      if (!item) throw new Error("Item not found");
      const addedBy = user?.name || user?.username || user?.email || "Unknown";
      await InventoryAPI.createDisbursement({
        type: "item",
        item_id: item.id,
        item_name: item.name,
        item_category: item.category,
        serial_number: "",
        assigned_to_id: selectedUser.id,
        assigned_to_name: selectedUser.name,
        assigned_by_id: user?.id ?? null,
        assigned_by_name: addedBy,
        quantity: assignQty,
        notes: assignNotes,
      });
      const qtyLabel = isDropCable(item)
        ? `${assignQty} pc (${assignQty * (getRollMetersFromItem(item) || 0)} m)`
        : `${assignQty} × ${item.name}`;
      setItemSuccess(`${qtyLabel} assigned to ${selectedUser.name}`);
      // Track in session for Done summary
      setSessionItems(prev => [...prev, { name: item.name, category: item.category, quantity: assignQty }]);
      setAssignQty(1);
      setAssignNotes("");
      setSelectedItemId("");
      setDoneMessage(null);
      loadOtherItems();
      loadHistory();
    } catch (err) {
      setItemError(err?.response?.data?.error || "Failed to assign item");
    } finally {
      setItemSaving(false);
    }
  };

  // ── Done: send summary SMS + notification ─────────────────────────────────
  const handleDone = async () => {
    if (!selectedUser) return;
    if (sessionLog.length === 0 && sessionItems.length === 0 && cableSessionLog.length === 0) return;
    setDoneLoading(true);
    setDoneMessage(null);
    try {
      const addedBy = user?.name || user?.username || user?.email || "Admin";
      const result = await InventoryAPI.finalizeAssignment({
        assigned_to_id:   selectedUser.id,
        assigned_to_name: selectedUser.name,
        assigned_by_name: addedBy,
        routers: sessionLog.map(s => ({ name: s.routerNo, serial: s.serial })),
        items: [
          ...sessionItems,
          ...cableSessionLog.map(s => ({
            name: s.rollNo,
            category: `${s.typeLabel}`,
            quantity: 1,
          })),
          ...(sessionLog.length > 0
            ? [{
                name: sessionLog[0]?.patchcord?.name || "Patch Cord",
                category: "Patch Cord",
                quantity: sessionLog.length,
              }]
            : []),
        ],
      });

      // Show specific feedback based on SMS delivery status
      const smsStatus = result?.sms_status || "unknown";
      let msgType = "success";
      let msgText = `Notification sent to ${selectedUser.name}`;
      if (smsStatus === "sent") {
        msgText = `SMS sent to ${selectedUser.name} (${result.sms_note?.replace("SMS sent to ", "") || ""})`;
      } else if (smsStatus === "no_phone") {
        msgType = "warning";
        msgText = `In-app notification sent. ${selectedUser.name} has no phone number on file — SMS skipped.`;
      } else if (smsStatus === "failed") {
        msgType = "warning";
        msgText = `In-app notification sent, but SMS failed: ${result.sms_note || "unknown error"}`;
      } else if (smsStatus === "user_not_found") {
        msgType = "warning";
        msgText = `In-app notification sent, but could not find user in DB for SMS.`;
      }
      setDoneMessage({ type: msgType, text: msgText });

      // Clear session
      setSessionLog([]);
      sessionLogRef.current = [];
      setSessionItems([]);
      setCableSessionLog([]);
      cableSessionLogRef.current = [];
      setScanStatus("idle");
      setScanMessage("");
      setCableScanStatus("idle");
      setCableScanMessage("");
      loadHistory();
    } catch (err) {
      setDoneMessage({ type: "error", text: err?.response?.data?.error || "Failed to send notification" });
    } finally {
      setDoneLoading(false);
    }
  };

  if (!isAdmin) {
    return <Navigate to="/admin/inventory/assignment-history" replace />;
  }

  const byUserSummary = buildByUserSummary(history);

  // ── Scan border colour ─────────────────────────────────────────────────────
  const scanBorder =
    scanStatus === "success" ? "#1ee0ac" :
    scanStatus === "error"   ? "#e85347" :
    scanStatus === "dup"     ? "#e6a817" :
    scanStatus === "saving"  ? "#0d6efd" : "#d0d7df";

  const cableScanBorder =
    cableScanStatus === "success" ? "#1ee0ac" :
    cableScanStatus === "error"   ? "#e85347" :
    cableScanStatus === "dup"     ? "#e6a817" :
    cableScanStatus === "saving"  ? "#0d6efd" : "#d0d7df";

  return (
    <React.Fragment>
      <Head title="Disbursement" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>Disbursement</BlockTitle>
              <BlockDes className="text-soft">
                <p>Assign routers and inventory items to technicians</p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <Link to="/admin/inventory/assignment-history" className="btn btn-outline-light btn-sm">
                <em className="icon ni ni-list mr-1" />
                Assignment history
              </Link>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          <Row className="g-gs justify-content-center">
              <Col lg="8" xl="6">
                <Card className="card-bordered">
                  <div className="card-inner">
                    <SectionLabel>New Assignment</SectionLabel>

                    {/* User selector */}
                    <FormGroup>
                      <Label>Assign To (User) *</Label>
                      {usersLoading ? (
                        <div className="py-1"><Spinner size="sm" /></div>
                      ) : (
                        <RSelect
                          options={userOptions}
                          value={selectedUser ? userOptions.find(o => o.id === selectedUser.id) || null : null}
                          onChange={(opt) => {
                            if (!opt) { selectUser(null); return; }
                            selectUser({ id: opt.id, name: opt.name, email: opt.email });
                          }}
                          placeholder="Select user to assign to…"
                          isClearable
                        />
                      )}
                      {selectedUser && (
                        <Button
                          type="button"
                          color="light"
                          size="sm"
                          className="mt-2"
                          onClick={() => setTeamModalOpen(true)}
                        >
                          <em className="icon ni ni-users mr-1" />
                          View team inventory
                        </Button>
                      )}
                    </FormGroup>

                    {/* Mode tabs */}
                    <div className="d-flex mb-3 flex-wrap" style={{ gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => { setAssignMode("router"); setScanStatus("idle"); setScanMessage(""); }}
                        style={{
                          flex: "1 1 30%", padding: "8px 0", border: "none", borderRadius: 6, cursor: "pointer",
                          background: assignMode === "router" ? "#6576ff" : "#f5f6fa",
                          color: assignMode === "router" ? "#fff" : "#526484",
                          fontWeight: 600, fontSize: "0.82rem"
                        }}
                      >
                        <em className="icon ni ni-wifi mr-1" /> Routers
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssignMode("cable");
                          setCableScanStatus("idle");
                          setCableScanMessage("");
                          loadAllCableRolls();
                        }}
                        style={{
                          flex: "1 1 30%", padding: "8px 0", border: "none", borderRadius: 6, cursor: "pointer",
                          background: assignMode === "cable" ? "#6576ff" : "#f5f6fa",
                          color: assignMode === "cable" ? "#fff" : "#526484",
                          fontWeight: 600, fontSize: "0.82rem"
                        }}
                      >
                        <em className="icon ni ni-link mr-1" /> Drop Cable
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssignMode("item")}
                        style={{
                          flex: "1 1 30%", padding: "8px 0", border: "none", borderRadius: 6, cursor: "pointer",
                          background: assignMode === "item" ? "#6576ff" : "#f5f6fa",
                          color: assignMode === "item" ? "#fff" : "#526484",
                          fontWeight: 600, fontSize: "0.82rem"
                        }}
                      >
                        <em className="icon ni ni-package mr-1" /> Other Items
                      </button>
                    </div>

                    {/* ── ROUTER SCAN MODE ── */}
                    {assignMode === "router" && (
                      <>
                        {!selectedUser ? (
                          <div className="text-center py-4 text-muted" style={{ fontSize: "0.85rem" }}>
                            <em className="icon ni ni-arrow-up" style={{ display: "block", fontSize: "1.5rem" }} />
                            Select a user above to start scanning
                          </div>
                        ) : (
                          <>
                            <div className="mb-2 text-center">
                              <span style={{ fontSize: "0.78rem", color: "#8094ae" }}>
                                Assigning to: <strong>{selectedUser.name}</strong>
                              </span>
                              <div style={{ fontSize: "0.72rem", color: "#10b981", marginTop: 2 }}>
                                Each router also issues 1 Patch Cord automatically
                              </div>
                            </div>
                            <FormGroup style={{ position: "relative" }}>
                              <Label>
                                Scan or Search Router
                                <span style={{ fontWeight: 400, marginLeft: 6, fontSize: "0.78rem", color: "#8094ae" }}>
                                  — type router no. (C102) or last 4 of serial, then Enter
                                </span>
                              </Label>
                              <div style={{ position: "relative" }}>
                                <Input
                                  innerRef={scanInputRef}
                                  type="text"
                                  placeholder="e.g. C102  or  A1B2 (last 4 of serial)…"
                                  value={scanInput}
                                  onChange={e => handleScanInputChange(e.target.value)}
                                  onKeyDown={handleScanKey}
                                  style={{ border: `2px solid ${scanBorder}`, transition: "border-color 0.2s", fontFamily: "monospace", fontSize: "1rem", paddingRight: scanSearching ? 36 : undefined }}
                                  disabled={scanStatus === "saving"}
                                  autoComplete="off"
                                />
                                {scanSearching && (
                                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
                                    <Spinner size="sm" color="secondary" />
                                  </span>
                                )}
                              </div>
                              {/* Live search results dropdown */}
                              {scanResults.length > 0 && (
                                <div style={{
                                  position: "absolute", zIndex: 999, left: 0, right: 0,
                                  background: "#fff", border: "1px solid #e5e9f2",
                                  borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                                  maxHeight: 220, overflowY: "auto"
                                }}>
                                  <div style={{ padding: "6px 10px 4px", fontSize: "0.72rem", color: "#8094ae", borderBottom: "1px solid #f0f0f0", fontWeight: 600 }}>
                                    SELECT A ROUTER
                                  </div>
                                  {scanResults.map(r => (
                                    <div
                                      key={r.id}
                                      onClick={() => {
                                        setScanInput(r.name);
                                        setScanResults([]);
                                        saveRouterAssignment(r.name, r);
                                      }}
                                      style={{
                                        padding: "7px 12px", cursor: "pointer",
                                        borderBottom: "1px solid #f5f6fa",
                                        display: "flex", gap: 10, alignItems: "center",
                                        opacity: r.status === "disbursed" ? 0.5 : 1,
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.background = "#f4f6ff"}
                                      onMouseLeave={e => e.currentTarget.style.background = ""}
                                    >
                                      <span style={{ fontWeight: 700, minWidth: 48, fontSize: "0.85rem" }}>{r.name}</span>
                                      <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#526484", flex: 1 }}>{r.serial_number}</span>
                                      {r.status === "disbursed"
                                        ? <span className="badge badge-dim bg-warning" style={{ fontSize: "0.7rem" }}>Disbursed</span>
                                        : <span className="badge badge-dim bg-success" style={{ fontSize: "0.7rem" }}>Available</span>
                                      }
                                    </div>
                                  ))}
                                </div>
                              )}
                            </FormGroup>

                            {/* Status message */}
                            {scanMessage && (
                              <div className={`alert py-2 mb-2 alert-${
                                scanStatus === "success" ? "success" :
                                scanStatus === "dup"     ? "warning" : "danger"}`}
                                style={{ fontSize: "0.82rem" }}>
                                {scanMessage}
                              </div>
                            )}

                            {/* Session log */}
                            {sessionLog.length > 0 && (
                              <div>
                                <div className="d-flex justify-content-between align-items-center mb-1">
                                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#8094ae" }}>
                                    THIS SESSION ({sessionLog.length})
                                  </span>
                                  <Button size="sm" color="light" onClick={undoLastScan}>
                                    <em className="icon ni ni-undo" /> Undo Last
                                  </Button>
                                </div>
                                <div style={{ maxHeight: 200, overflowY: "auto", background: "#f8f9fa", borderRadius: 6, padding: "4px 0" }}>
                                  {sessionLog.map((s, i) => (
                                    <div key={i} className="d-flex align-items-center px-2 py-1" style={{ borderBottom: "1px solid #eee", gap: 6 }}>
                                      <em className="icon ni ni-check-circle text-success" style={{ fontSize: "0.9rem" }} />
                                      <span style={{ fontWeight: 600, fontSize: "0.82rem", minWidth: 40 }}>{s.routerNo}</span>
                                      <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#526484", flex: 1 }}>{s.serial}</span>
                                      <span style={{ fontSize: "0.72rem", color: "#10b981", whiteSpace: "nowrap" }}>+1 Patch Cord</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {/* ── DROP CABLE SCAN (T400, etc.) ── */}
                    {assignMode === "cable" && (
                      <>
                        {!selectedUser ? (
                          <div className="text-center py-4 text-muted" style={{ fontSize: "0.85rem" }}>
                            <em className="icon ni ni-arrow-up" style={{ display: "block", fontSize: "1.5rem" }} />
                            Select a user above to scan cable rolls
                          </div>
                        ) : (
                          <>
                            <div className="mb-2 text-center">
                              <span style={{ fontSize: "0.78rem", color: "#8094ae" }}>
                                Assigning to: <strong>{selectedUser.name}</strong>
                              </span>
                            </div>
                            <FormGroup style={{ position: "relative" }}>
                              <Label>
                                Scan or type roll number
                                <span style={{ fontWeight: 400, marginLeft: 6, fontSize: "0.78rem", color: "#8094ae" }}>
                                  — roll no. (T400 or 400), then Enter
                                </span>
                              </Label>
                              <Input
                                innerRef={cableScanInputRef}
                                type="text"
                                placeholder="e.g. T400 or 400…"
                                value={cableScanInput}
                                onChange={e => handleCableScanInputChange(e.target.value)}
                                onKeyDown={handleCableScanKey}
                                style={{ border: `2px solid ${cableScanBorder}`, fontFamily: "monospace", fontSize: "1rem" }}
                                disabled={cableScanStatus === "saving"}
                                autoComplete="off"
                              />
                              {cableScanSearching && (
                                <span style={{ position: "absolute", right: 10, top: 38 }}>
                                  <Spinner size="sm" color="secondary" />
                                </span>
                              )}
                              {cableScanResults.length > 0 && (
                                <div style={{
                                  position: "absolute", zIndex: 999, left: 0, right: 0,
                                  background: "#fff", border: "1px solid #e5e9f2", borderRadius: 6,
                                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto"
                                }}>
                                  {cableScanResults.map(r => (
                                    <div
                                      key={r.id}
                                      onClick={() => { setCableScanInput(r.name); setCableScanResults([]); saveCableAssignment(r.name, r); }}
                                      style={{ padding: "7px 12px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}
                                    >
                                      <span style={{ fontWeight: 700 }}>{r.name}</span>
                                      <span className="text-muted" style={{ fontSize: "0.78rem" }}>
                                        {getCableTypeLabel(getRollMetersFromItem(r))}
                                      </span>
                                      {r.status === "disbursed"
                                        ? <span className="badge badge-dim bg-warning" style={{ fontSize: "0.7rem", marginLeft: "auto" }}>Issued</span>
                                        : <span className="badge badge-dim bg-success" style={{ fontSize: "0.7rem", marginLeft: "auto" }}>Available</span>
                                      }
                                    </div>
                                  ))}
                                </div>
                              )}
                            </FormGroup>
                            {cableScanMessage && (
                              <div className={`alert py-2 mb-2 alert-${
                                cableScanStatus === "success" ? "success" :
                                cableScanStatus === "dup" ? "warning" : "danger"}`}
                                style={{ fontSize: "0.82rem" }}>
                                {cableScanMessage}
                              </div>
                            )}
                            {cableSessionLog.length > 0 && (
                              <div>
                                <div className="d-flex justify-content-between align-items-center mb-1">
                                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#8094ae" }}>
                                    THIS SESSION ({cableSessionLog.length})
                                  </span>
                                  <Button size="sm" color="light" onClick={undoLastCableScan}>
                                    <em className="icon ni ni-undo" /> Undo Last
                                  </Button>
                                </div>
                                <div style={{ maxHeight: 160, overflowY: "auto", background: "#f8f9fa", borderRadius: 6 }}>
                                  {cableSessionLog.map((s, i) => (
                                    <div key={i} className="d-flex px-2 py-1" style={{ gap: 8, fontSize: "0.82rem" }}>
                                      <em className="icon ni ni-check-circle text-success" />
                                      <strong>{s.rollNo}</strong>
                                      <span className="text-muted">{s.typeLabel} · {s.meters} m</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {/* ── OTHER ITEM MODE ── */}
                    {assignMode === "item" && (
                      <>
                        {!selectedUser ? (
                          <div className="text-center py-4 text-muted" style={{ fontSize: "0.85rem" }}>
                            <em className="icon ni ni-arrow-up" style={{ display: "block", fontSize: "1.5rem" }} />
                            Select a user above first
                          </div>
                        ) : (
                          <Form onSubmit={handleItemAssign}>
                            {itemError && <div className="alert alert-danger py-2 mb-2" style={{ fontSize: "0.82rem" }}>{itemError}</div>}
                            {itemSuccess && <div className="alert alert-success py-2 mb-2" style={{ fontSize: "0.82rem" }}>{itemSuccess}</div>}

                            <FormGroup>
                              <Label>Item *</Label>
                              <Input
                                type="select"
                                required
                                value={selectedItemId}
                                onChange={e => {
                                  const id = e.target.value;
                                  setSelectedItemId(id);
                                  setAssignQty(1);
                                }}
                              >
                                <option value="">-- Select item --</option>
                                {otherItems.map(item => (
                                  <option key={item.id} value={item.id}>
                                    {item.name} — {item.category} (Qty: {item.quantity_available ?? item.quantity ?? 0} {item.unit || ""})
                                  </option>
                                ))}
                              </Input>
                            </FormGroup>

                            <FormGroup>
                              <Label>
                                {selectedDisburseItem && (isDropCable(selectedDisburseItem) || isMeterUnit(selectedDisburseItem))
                                  ? 'Pieces (rolls) *'
                                  : 'Quantity *'}
                              </Label>
                              <Input
                                type="number"
                                required
                                min="1"
                                max={selectedDisburseItem?.quantity_available || undefined}
                                value={assignQty}
                                onChange={e => setAssignQty(Math.max(1, parseInt(e.target.value) || 1))}
                              />
                              {selectedDisburseItem && (isDropCable(selectedDisburseItem) || isMeterUnit(selectedDisburseItem)) && selectedRollMeters && (
                                <small className="text-muted d-block mt-1">
                                  1 piece = 1 roll = {selectedRollMeters} m on ticket. Technician logs usage in meters (e.g. 300 m).
                                </small>
                              )}
                            </FormGroup>

                            <FormGroup>
                              <Label>Notes</Label>
                              <Input
                                type="textarea"
                                rows="2"
                                placeholder="Optional note…"
                                value={assignNotes}
                                onChange={e => setAssignNotes(e.target.value)}
                              />
                            </FormGroup>

                            <Button color="primary" type="submit" style={{ width: "100%" }} disabled={itemSaving}>
                              {itemSaving ? <Spinner size="sm" /> : <><em className="icon ni ni-send mr-1" /> Assign to {selectedUser.name}</>}
                            </Button>
                          </Form>
                        )}
                      </>
                    )}
                  {/* ── DONE BUTTON — visible when anything assigned this session ── */}
                  {selectedUser && (sessionLog.length > 0 || sessionItems.length > 0 || cableSessionLog.length > 0) && (
                    <div style={{ marginTop: 16, borderTop: "1px solid #e5e9f2", paddingTop: 14 }}>
                      {/* Session summary */}
                      <div style={{ background: "#f4f6ff", borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: "0.82rem" }}>
                        <div style={{ fontWeight: 700, color: "#364a63", marginBottom: 6 }}>
                          This session — assigning to <span style={{ color: "#6576ff" }}>{selectedUser.name}</span>:
                        </div>
                        {sessionLog.length > 0 && (
                          <div style={{ marginBottom: 4 }}>
                            <em className="icon ni ni-wifi" style={{ marginRight: 4, color: "#6576ff" }} />
                            <strong>{sessionLog.length}</strong> router{sessionLog.length !== 1 ? "s" : ""}:&nbsp;
                            {sessionLog.map(s => s.routerNo).join(", ")}
                            <span style={{ color: "#10b981" }}>
                              {" "}+ {sessionLog.length} Patch Cord{sessionLog.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        )}
                        {cableSessionLog.length > 0 && (
                          <div style={{ marginBottom: 4 }}>
                            <em className="icon ni ni-link" style={{ marginRight: 4, color: "#6576ff" }} />
                            <strong>{cableSessionLog.length}</strong> cable roll{cableSessionLog.length !== 1 ? "s" : ""}:&nbsp;
                            {cableSessionLog.map(s => s.rollNo).join(", ")}
                          </div>
                        )}
                        {sessionItems.map((it, i) => (
                          <div key={i}>
                            <em className="icon ni ni-package-fill" style={{ marginRight: 4, color: "#10b981" }} />
                            <strong>{it.quantity}</strong> × {it.name} ({it.category})
                          </div>
                        ))}
                      </div>

                      {doneMessage && (
                        <div className={`alert py-2 mb-2 alert-${
                          doneMessage.type === "success" ? "success"
                          : doneMessage.type === "warning" ? "warning"
                          : "danger"
                        }`} style={{ fontSize: "0.82rem" }}>
                          {doneMessage.type === "success"
                            ? <><em className="icon ni ni-check-circle mr-1" />{doneMessage.text}</>
                            : doneMessage.type === "warning"
                            ? <><em className="icon ni ni-alert-circle mr-1" />{doneMessage.text}</>
                            : <><em className="icon ni ni-cross-circle mr-1" />{doneMessage.text}</>
                          }
                        </div>
                      )}

                      <Button
                        color="success"
                        onClick={handleDone}
                        disabled={doneLoading}
                        style={{ fontWeight: 700, fontSize: "0.95rem", width: "100%" }}
                      >
                        {doneLoading
                          ? <><Spinner size="sm" className="mr-1" /> Sending notification…</>
                          : <><em className="icon ni ni-check-circle-cut mr-1" /> Done — Notify {selectedUser.name}</>
                        }
                      </Button>
                      <div className="text-center text-muted mt-1" style={{ fontSize: "0.72rem" }}>
                        Sends an SMS summary of all items assigned this session
                      </div>
                    </div>
                  )}

                  </div>
                </Card>
              </Col>
          </Row>

          {!historyLoading && (
            <Row className="g-gs mt-1">
              <Col>
                <Card className="card-bordered">
                  <div className="card-inner">
                    <SectionLabel>Summary — Pending per person</SectionLabel>
                    <Row className="g-3">
                      {byUserSummary.length === 0 && (
                        <Col>
                          <div className="text-center py-4 text-muted" style={{ fontSize: "0.85rem" }}>
                            <em
                              className="icon ni ni-check-circle"
                              style={{ fontSize: "2rem", display: "block", marginBottom: 8, color: "#10b981" }}
                            />
                            All assigned items have been used — nothing pending
                          </div>
                        </Col>
                      )}
                      {byUserSummary.map(({ name, pendingRouters, pendingItems }) => (
                        <Col key={name} md="6" lg="4">
                          <div
                            style={{
                              border: "1px solid #e5e9f2",
                              borderRadius: 8,
                              padding: "12px 16px",
                              background: "#fafbff",
                            }}
                          >
                            <div className="d-flex align-items-center mb-2" style={{ gap: 8 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: "50%",
                                  background: "#6576ff22",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <em className="icon ni ni-user text-primary" />
                              </div>
                              <strong style={{ fontSize: "0.88rem" }}>{name}</strong>
                              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                                {pendingRouters.length > 0 && (
                                  <Badge color="warning" style={{ fontSize: "0.65rem" }}>
                                    {pendingRouters.length} router{pendingRouters.length !== 1 ? "s" : ""}
                                  </Badge>
                                )}
                                {pendingItems.length > 0 && (
                                  <Badge color="primary" style={{ fontSize: "0.65rem" }}>
                                    {pendingItems.length} item type{pendingItems.length !== 1 ? "s" : ""}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {pendingRouters.length > 0 && (
                              <div className="mb-2">
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    color: "#f59e0b",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Routers
                                </span>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                                  {pendingRouters.map((r) => (
                                    <span
                                      key={r.id}
                                      style={{
                                        background: "#fef3c7",
                                        color: "#92400e",
                                        borderRadius: 4,
                                        padding: "1px 7px",
                                        fontSize: "0.75rem",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {r.item_name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {pendingItems.length > 0 && (
                              <div>
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    color: "#6576ff",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Items remaining
                                </span>
                                {pendingItems.map((it) => (
                                  <div
                                    key={it.roll_number || it.id || it.name}
                                    className="d-flex align-items-center justify-content-between mt-1"
                                    style={{ fontSize: "0.78rem" }}
                                  >
                                    <span style={{ color: "#364a63" }}>
                                      {it.roll_number ? (
                                        <>
                                          <strong style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}>
                                            {getPendingCableItemLabel(it)}
                                          </strong>
                                          {it.cable_type && (
                                            <span className="text-muted" style={{ fontSize: "0.72rem", marginLeft: 6 }}>
                                              ({it.cable_type})
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          {it.name}
                                          {it.category ? <span className="text-muted"> — {it.category}</span> : ""}
                                        </>
                                      )}
                                    </span>
                                    <Badge color="success" style={{ fontSize: "0.68rem", marginLeft: 6 }}>
                                      {it.rollMeters
                                        ? formatDropCableBalance(it.remaining, it.rollMeters)
                                        : `×${it.remaining}${it.unit ? ` ${it.unit}` : ""}`}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </Card>
              </Col>
            </Row>
          )}
          {historyLoading && (
            <Row className="g-gs mt-1">
              <Col>
                <div className="text-center py-4">
                  <Spinner color="primary" size="sm" />
                </div>
              </Col>
            </Row>
          )}

        </Block>
      </Content>
      <TeamInventoryModal
        isOpen={teamModalOpen}
        toggle={() => setTeamModalOpen(false)}
        user={selectedUser}
      />
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(DisbursedInventory);
