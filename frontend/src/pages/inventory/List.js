import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Row,
  Col,
  Icon,
  Button,
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableRow,
  DataTableItem,
  PaginationComponent,
} from "../../components/Component";
import {
  Card,
  Badge,
  Modal,
  ModalBody,
  ModalHeader,
  Form,
  FormGroup,
  Label,
  Input,
  Spinner,
} from "reactstrap";
import { connect } from "react-redux";
import InventoryAPI from "../../helpers/InventoryAPI";
import { format } from "date-fns";
import {
  DROP_CABLE_CATEGORY,
  DROP_CABLE_PRESETS,
  getCableTypeLabel,
  getRollMetersFromItem,
  isCableRollNumber,
  isDropCable,
  normalizeCableRollInput,
} from "../../utils/inventoryCable";

// USB handheld scanners send keypresses; strip stray control characters.
function normalizeHandheldScan(value) {
  if (value == null || typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
}

// Accept only required router barcode format:
// - starts with "48"
// - exactly 16 characters total
function isValidRouterBarcode(serial) {
  if (!serial) return false;
  return /^48[A-Za-z0-9]{14}$/.test(serial);
}

// Parse e.g. "C102" → { prefix: "C", number: 102 }
function parseRouterNumber(str) {
  if (!str) return null;
  const match = str.trim().match(/^([A-Za-z]*)(\d+)$/);
  if (!match) return null;
  return { prefix: match[1].toUpperCase(), number: parseInt(match[2], 10) };
}

function fmtRouterNo(prefix, number) {
  return `${prefix}${number}`;
}

function safeFormatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd MMM yyyy HH:mm");
  } catch {
    return "-";
  }
}

// Description field stores JSON so we can persist added_by + comment alongside
// existing plain-text descriptions from older records.
function getAddedBy(item) {
  // Prefer the real DB column; fall back to legacy JSON-in-description
  if (item?.added_by_name) return item.added_by_name;
  if (!item?.description) return "-";
  try {
    const meta = JSON.parse(item.description);
    return meta.added_by || "-";
  } catch {
    return "-";
  }
}

function getComment(item) {
  // Prefer the real DB column; fall back to legacy JSON-in-description
  if (item?.comment != null) return item.comment;
  if (!item?.description) return "";
  try {
    const meta = JSON.parse(item.description);
    return meta.comment || "";
  } catch {
    return item.description || "";
  }
}

function isRouterItem(item) {
  const cat = (item?.category || "").toLowerCase();
  return cat.includes("router") || cat.includes("gpon");
}

function isCableRollItem(item) {
  return isCableRollNumber(item);
}

function inventoryItemKind(item) {
  if (isCableRollItem(item)) return "cable-roll";
  if (isRouterItem(item)) return "router";
  return "bulk";
}

const S = { IDLE: "idle", SAVING: "saving", SUCCESS: "success", ERROR: "error", DUPLICATE: "duplicate" };

const STATUS_COLORS = {
  [S.IDLE]: "#adb5bd",
  [S.SAVING]: "#0d6efd",
  [S.SUCCESS]: "#198754",
  [S.ERROR]: "#dc3545",
  [S.DUPLICATE]: "#e6a817",
};

const FILTER_PRESETS = {
  all: { category: "", status: "", label: "All Items", icon: "box", color: "primary" },
  routers: { category: "GPON Router", status: "", label: "GPON Routers", icon: "wifi", color: "primary" },
  "routers-active": { category: "GPON Router", status: "active", label: "Available Routers", icon: "check-circle", color: "success" },
  "routers-disbursed": { category: "GPON Router", status: "disbursed", label: "Disbursed Routers", icon: "user-check", color: "info" },
  "routers-faulty": { category: "GPON Router", status: "faulty", label: "Faulty Routers", icon: "alert-circle", color: "danger" },
  "drop-cable": { category: DROP_CABLE_CATEGORY, status: "", label: "Drop Cable", icon: "network", color: "warning" },
  "other-stock": { category: "__other__", status: "", label: "Other Stock", icon: "package", color: "secondary" },
};

const OUTLINE_COLORS = {
  primary: "#6576ff",
  success: "#1ee0ac",
  info: "#09c2de",
  danger: "#e85347",
  warning: "#f4bd0e",
  secondary: "#8094ae",
};

const FilterCard = ({ icon, color, value, label, active, loading, onClick }) => (
  <Card
    className="card-bordered h-100"
    onClick={onClick}
    style={{
      cursor: "pointer",
      border: active ? `2px solid ${OUTLINE_COLORS[color] || OUTLINE_COLORS.primary}` : undefined,
      boxShadow: active ? "0 4px 18px rgba(101,118,255,0.15)" : undefined,
      transform: active ? "translateY(-2px)" : undefined,
      transition: "box-shadow 0.18s, transform 0.18s, border 0.18s",
      outline: active ? `2px solid ${OUTLINE_COLORS[color] || OUTLINE_COLORS.primary}` : undefined,
      outlineOffset: 2,
    }}
  >
    <div className="card-inner py-3" style={{ position: "relative" }}>
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <p
            className="text-soft mb-1"
            style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}
          >
            {label}
          </p>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.1, color: "#364a63" }}>
            {loading ? <Spinner size="sm" /> : value}
          </div>
        </div>
        <em
          className={`icon ni ni-${icon} text-${color}`}
          style={{ fontSize: "1.35rem", position: "absolute", right: 16, top: 14, opacity: 0.85 }}
        />
      </div>
    </div>
  </Card>
);

const InventoryList = ({ user }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemPerPage, setItemPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPreset, setFilterPreset] = useState("all");
  const [filterCounts, setFilterCounts] = useState({});
  const [countsLoading, setCountsLoading] = useState(false);
  const [categories, setCategories] = useState([]);

  const activePreset = FILTER_PRESETS[filterPreset] || FILTER_PRESETS.all;
  const filterCategory = activePreset.category === "__other__" ? "" : activePreset.category;
  const filterStatus = activePreset.status;

  // Read ?status= / ?category= from dashboard navigation
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const s = params.get("status");
    const cat = params.get("category");
    if (s === "active") setFilterPreset("routers-active");
    else if (s === "disbursed") setFilterPreset("routers-disbursed");
    else if (s === "faulty" || s === "inactive") setFilterPreset("routers-faulty");
    else if (cat === "GPON Router") setFilterPreset("routers");
    else if (cat === DROP_CABLE_CATEGORY) setFilterPreset("drop-cable");
    else if (cat) setFilterPreset("other-stock");
    else if (!s && !cat) setFilterPreset("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // ── Scan session ──────────────────────────────────────────────────────────
  const [modalScan, setModalScan] = useState(false);
  const [scanPhase, setScanPhase] = useState("setup"); // "setup" | "scanning"
  const [setupInput, setSetupInput] = useState("C102");
  const [setupError, setSetupError] = useState("");
  const [sessionPrefix, setSessionPrefix] = useState("C");
  const [sessionCurrentNumber, setSessionCurrentNumber] = useState(102);
  const [sessionScanned, setSessionScanned] = useState([]);
  const sessionScannedRef = useRef([]);
  // Holds ALL GPON Router items fetched when the scan modal opens — used for
  // pre-save uniqueness checks (router number + serial) against the real DB.
  const allRoutersRef = useRef([]);
  const [scanInput, setScanInput] = useState("");
  const [scanStatus, setScanStatus] = useState(S.IDLE);
  const [scanMessage, setScanMessage] = useState("");
  const scanInputRef = useRef(null);
  const invalidScanSoundRef = useRef(null);
  const successScanSoundRef = useRef(null);

  // ── Feed drop cable rolls (T400, etc.) ───────────────────────────────────
  const [modalCableFeed, setModalCableFeed] = useState(false);
  const [cableFeedType, setCableFeedType] = useState("1k");
  const [cableFeedInput, setCableFeedInput] = useState("");
  const [cableFeedStatus, setCableFeedStatus] = useState(S.IDLE);
  const [cableFeedMessage, setCableFeedMessage] = useState("");
  const [cableFeedScanned, setCableFeedScanned] = useState([]);
  const cableFeedScannedRef = useRef([]);
  const allCableRollsRef = useRef([]);
  const cableFeedInputRef = useRef(null);

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [modalEdit, setModalEdit] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "", serial_number: "", status: "active", comment: "", ticket_id: "", ticket_number: "",
  });
  const [modalAdjust, setModalAdjust] = useState(false);
  const [adjustingStock, setAdjustingStock] = useState(false);
  const [adjustError, setAdjustError] = useState("");
  const [adjustForm, setAdjustForm] = useState({
    adjustment: "",
    reason: "",
  });

  // ── Add Item modal (non-router bulk items) ────────────────────────────────
  const [modalAddItem, setModalAddItem] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "", description: "", category: "",
    quantity: 0, unit: "pcs", minimum_quantity: 5, unit_price: 0,
    comment: "",
  });

  const isTechnician = user?.all_roles?.includes("technician");
  const isAdmin =
    user?.all_roles?.includes("administrator") ||
    user?.all_roles?.includes("super-administrator");

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    loadCategories();
    loadFilterCounts();
    return () => { isMountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPreset, itemPerPage]);

  // Keep ref in sync for duplicate-check inside async callback
  useEffect(() => { sessionScannedRef.current = sessionScanned; }, [sessionScanned]);

  // Auto-focus scan field when scanning starts
  useEffect(() => {
    if (scanPhase === "scanning" && modalScan) {
      requestAnimationFrame(() => scanInputRef.current?.focus());
    }
  }, [scanPhase, modalScan]);

  useEffect(() => {
    // Preload scan sounds from /public
    invalidScanSoundRef.current = new Audio("/mixkit-doorbell-single-press-333.wav");
    invalidScanSoundRef.current.preload = "auto";
    successScanSoundRef.current = new Audio("/mixkit-gaming-lock-2848.wav");
    successScanSoundRef.current.preload = "auto";
  }, []);

  const playScanSound = (soundRef) => {
    try {
      const sound = soundRef?.current;
      if (!sound) return;
      sound.currentTime = 0;
      sound.play().catch(() => {});
    } catch {
      // Sound should never block scan flow
    }
  };

  const playInvalidScanSound = () => playScanSound(invalidScanSoundRef);
  const playSuccessScanSound = () => playScanSound(successScanSoundRef);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadFilterCounts = async () => {
    if (isTechnician) return;
    try {
      if (isMountedRef.current) setCountsLoading(true);
      const response = await InventoryAPI.getItems({});
      const all = Array.isArray(response?.data) ? response.data : [];
      if (!isMountedRef.current) return;
      setFilterCounts({
        all: all.length,
        routers: all.filter((i) => isRouterItem(i)).length,
        "routers-active": all.filter((i) => isRouterItem(i) && i.status === "active").length,
        "routers-disbursed": all.filter((i) => isRouterItem(i) && i.status === "disbursed").length,
        "routers-faulty": all.filter((i) => isRouterItem(i) && (i.status === "faulty" || i.status === "inactive")).length,
        "drop-cable": all.filter((i) => (i.category || "") === DROP_CABLE_CATEGORY).length,
        "other-stock": all.filter(
          (i) => !isRouterItem(i) && (i.category || "") !== DROP_CABLE_CATEGORY
        ).length,
      });
    } catch (err) {
      console.error("Error loading filter counts:", err);
    } finally {
      if (isMountedRef.current) setCountsLoading(false);
    }
  };

  const loadItems = async (overrides = {}) => {
    try {
      if (isMountedRef.current) setLoading(true);
      const preset = FILTER_PRESETS[filterPreset] || FILTER_PRESETS.all;
      const category =
        overrides.category !== undefined ? overrides.category : preset.category;
      const status =
        overrides.status !== undefined ? overrides.status : preset.status;
      const search =
        overrides.search !== undefined ? overrides.search : searchTerm;

      const params = {};
      if (search) params.search = search;
      const apiStatus = filterPreset === "routers-faulty" ? "" : status;
      if (apiStatus) params.status = apiStatus;

      let response;
      if (isTechnician) {
        response = await InventoryAPI.getDisbursements({ user_id: user?.id });
      } else if (category === "__other__") {
        response = await InventoryAPI.getItems(params);
      } else {
        if (category) params.category = category;
        response = await InventoryAPI.getItems(params);
      }

      if (!isMountedRef.current) return;

      let data = [];
      if (Array.isArray(response?.data)) data = response.data;
      else if (Array.isArray(response)) data = response;

      if (category === "__other__") {
        data = data.filter(
          (i) => !isRouterItem(i) && (i.category || "") !== DROP_CABLE_CATEGORY
        );
      }
      if (filterPreset === "routers-faulty") {
        data = data.filter((i) => i.status === "faulty" || i.status === "inactive");
      }

      if (isMountedRef.current) setItems(data);
    } catch (err) {
      console.error("Error loading items:", err);
      if (isMountedRef.current) setItems([]);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const refreshList = () => {
    loadItems();
    loadFilterCounts();
  };

  const loadCategories = async () => {
    try {
      const response = await InventoryAPI.getCategories();
      if (isMountedRef.current) {
        setCategories(Array.isArray(response?.data) ? response.data : []);
      }
    } catch (err) {
      console.error("Error loading categories:", err);
    }
  };

  // ── Scan session ──────────────────────────────────────────────────────────

  // Load every GPON Router from the API (no search/page filter) so we can
  // validate uniqueness before each save without waiting for the main list.
  const loadAllRoutersForValidation = async () => {
    try {
      const response = await InventoryAPI.getItems({ category: "GPON Router" });
      let data = [];
      if (Array.isArray(response?.data)) data = response.data;
      else if (Array.isArray(response)) data = response;
      allRoutersRef.current = data;
    } catch {
      allRoutersRef.current = [];
    }
  };

  const openScanModal = async () => {
    setScanPhase("setup");
    setSetupInput("C102");
    setSetupError("");
    setSessionScanned([]);
    sessionScannedRef.current = [];
    setScanInput("");
    setScanStatus(S.IDLE);
    setScanMessage("");
    setModalScan(true);
    // Pre-load all routers in the background so validation is ready
    loadAllRoutersForValidation();
  };

  const closeScanModal = () => {
    setModalScan(false);
    setScanPhase("setup");
    setSessionScanned([]);
    sessionScannedRef.current = [];
  };

  const startScanning = () => {
    const parsed = parseRouterNumber(setupInput);
    if (!parsed) {
      setSetupError("Invalid format. Use letters + number, e.g. C102 or B860.");
      return;
    }
    setSetupError("");
    setSessionPrefix(parsed.prefix);
    setSessionCurrentNumber(parsed.number);
    setSessionScanned([]);
    sessionScannedRef.current = [];
    setScanInput("");
    setScanStatus(S.IDLE);
    setScanMessage("");
    setScanPhase("scanning");
  };

  const autoSaveRouter = async (serial) => {
    // Block if already saving
    if (scanStatus === S.SAVING) return;

    const routerNumber = fmtRouterNo(sessionPrefix, sessionCurrentNumber);

    // ── 1. Check serial duplicate within this scan session ────────────────
    if (sessionScannedRef.current.some((s) => s.serial === serial)) {
      setScanStatus(S.DUPLICATE);
      setScanMessage(`⚠ Serial ${serial} already scanned this session — skipped`);
      setScanInput("");
      setTimeout(() => { setScanStatus(S.IDLE); setScanMessage(""); scanInputRef.current?.focus(); }, 2800);
      return;
    }

    // ── 2. Check router number against existing DB records ────────────────
    const routerNoConflict = allRoutersRef.current.find(
      (r) => (r.name || "").trim().toLowerCase() === routerNumber.toLowerCase()
    );
    if (routerNoConflict) {
      setScanStatus(S.ERROR);
      setScanMessage(`✗ Router number ${routerNumber} already exists in inventory`);
      setScanInput("");
      // Skip this number and try the next one automatically
      setSessionCurrentNumber((n) => n + 1);
      setTimeout(() => { setScanStatus(S.IDLE); setScanMessage(""); scanInputRef.current?.focus(); }, 3000);
      return;
    }

    // ── 3. Check serial number against existing DB records ────────────────
    const serialConflict = allRoutersRef.current.find(
      (r) => r.serial_number && r.serial_number.trim().toLowerCase() === serial.toLowerCase()
    );
    if (serialConflict) {
      setScanStatus(S.DUPLICATE);
      setScanMessage(`⚠ Serial ${serial} already exists — assigned to ${serialConflict.name || "another router"}`);
      setScanInput("");
      setTimeout(() => { setScanStatus(S.IDLE); setScanMessage(""); scanInputRef.current?.focus(); }, 3000);
      return;
    }
    setScanStatus(S.SAVING);
    setScanMessage(`Saving ${routerNumber}…`);

    try {
      const addedBy = user?.name || user?.username || user?.email || "Unknown";
      const saveResponse = await InventoryAPI.addItem({
        name: routerNumber,
        description: "",
        category: "GPON Router",
        quantity: 1,
        unit: "pcs",
        minimum_quantity: 1,
        unit_price: 0,
        is_serialized: true,
        serial_number: serial,
        status: "active",
        added_by_id: user?.id ?? null,
        added_by_name: addedBy,
        comment: "",
      });

      // Capture the saved item id so rows can be deleted individually
      const savedId = saveResponse?.data?.id ?? saveResponse?.id ?? null;

      const entry = { routerNumber, serial, time: new Date(), id: savedId, deleting: false };
      setSessionScanned((prev) => [entry, ...prev]);
      setSessionCurrentNumber((n) => n + 1);
      setScanInput("");
      setScanStatus(S.SUCCESS);
      setScanMessage(`✓ ${routerNumber} saved`);
      playSuccessScanSound();

      // Add to local validation list so the very next scan in this session
      // also catches conflicts without needing a full reload.
      allRoutersRef.current = [
        ...allRoutersRef.current,
        { name: routerNumber, serial_number: serial, status: "active" },
      ];

      refreshList(); // refresh list in background

      setTimeout(() => {
        setScanStatus(S.IDLE);
        setScanMessage("");
        scanInputRef.current?.focus();
      }, 800);
    } catch (err) {
      console.error("Error saving router:", err);
      setScanStatus(S.ERROR);
      setScanMessage("✗ Save failed — try scanning again");
      setScanInput("");
      setTimeout(() => {
        setScanStatus(S.IDLE);
        setScanMessage("");
        scanInputRef.current?.focus();
      }, 3000);
    }
  };

  const handleScanKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const serial = normalizeHandheldScan(scanInput);
      if (!serial) return;

      if (!isValidRouterBarcode(serial)) {
        playInvalidScanSound();
        setScanStatus(S.ERROR);
        setScanMessage("✗ Invalid barcode. Scan only router barcodes that start with 48 and are exactly 16 characters.");
        setScanInput("");
        setTimeout(() => {
          setScanStatus(S.IDLE);
          setScanMessage("");
          scanInputRef.current?.focus();
        }, 2800);
        return;
      }

      autoSaveRouter(serial);
    }
  };

  // Delete one entry from the session log (and from the DB if we have an id).
  // Does NOT roll back the router number counter.
  const deleteSessionEntry = async (entry) => {
    // Mark row as deleting
    setSessionScanned((prev) =>
      prev.map((s) => s === entry ? { ...s, deleting: true } : s)
    );
    try {
      if (entry.id) await InventoryAPI.deleteItem(entry.id, user?.id ?? null, user?.name || user?.username || null);
    } catch (err) {
      console.error("Error deleting session entry:", err);
    }
    // Remove from session list and from validation ref
    setSessionScanned((prev) => prev.filter((s) => s !== entry));
    allRoutersRef.current = allRoutersRef.current.filter(
      (r) =>
        (r.name || "").toLowerCase() !== entry.routerNumber.toLowerCase() &&
        (r.serial_number || "").toLowerCase() !== entry.serial.toLowerCase()
    );
    refreshList();
    scanInputRef.current?.focus();
  };

  // Undo the very last scan: deletes it from DB + removes from session +
  // rolls the router number counter back by 1 so the same number can be re-scanned.
  const undoLastScan = async () => {
    const last = sessionScannedRef.current[0];
    if (!last) return;
    await deleteSessionEntry(last);
    setSessionCurrentNumber((n) => Math.max(n - 1, 0));
  };

  // ── Edit router ───────────────────────────────────────────────────────────

  const openEditModal = (item) => {
    setSelectedItem(item);
    setEditForm({
      name: item.name || "",
      serial_number: item.serial_number || "",
      status: item.status || "active",
      comment: getComment(item),
      ticket_id: item.ticket_id || "",
      ticket_number: item.ticket_number || "",
    });
    setModalEdit(true);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    try {
      const addedBy = getAddedBy(selectedItem);
      await InventoryAPI.updateItem(selectedItem.id, {
        ...selectedItem,
        name: editForm.name,
        serial_number: normalizeHandheldScan(editForm.serial_number),
        status: editForm.status,
        comment: editForm.comment,
        ticket_id: editForm.ticket_id || null,
        ticket_number: editForm.ticket_number || null,
        added_by_name: addedBy !== "-" ? addedBy : (selectedItem.added_by_name ?? null),
        // Keep description JSON in sync as fallback
        description: JSON.stringify({ added_by: addedBy !== "-" ? addedBy : "", comment: editForm.comment }),
      });
      setModalEdit(false);
      refreshList();
    } catch (err) {
      console.error("Error updating item:", err);
    }
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm("Delete this router?")) return;
    try {
      await InventoryAPI.deleteItem(id, user?.id ?? null, user?.name || user?.username || null);
      refreshList();
    } catch (err) {
      console.error("Error deleting item:", err);
    }
  };

  // ── Adjust stock (non-router items) ───────────────────────────────────────
  const openAdjustModal = (item) => {
    setSelectedItem(item);
    setAdjustError("");
    setAdjustForm({ adjustment: "", reason: "" });
    setModalAdjust(true);
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    setAdjustError("");
    const delta = parseInt(adjustForm.adjustment, 10);
    if (!Number.isFinite(delta) || delta === 0) {
      setAdjustError("Enter a non-zero adjustment. Use + for restock and - for deductions.");
      return;
    }
    if (!adjustForm.reason.trim()) {
      setAdjustError("Reason is required for stock adjustment.");
      return;
    }

    try {
      setAdjustingStock(true);
      await InventoryAPI.updateItem(selectedItem.id, {
        stock_adjustment: delta,
        stock_reason: adjustForm.reason || "",
        actor_id: user?.id ?? null,
        actor_name: user?.name || user?.username || user?.email || "Unknown",
      });
      setModalAdjust(false);
      refreshList();
    } catch (err) {
      setAdjustError(err?.response?.data?.error || "Failed to adjust stock");
    } finally {
      setAdjustingStock(false);
    }
  };

  // ── Add Item (non-router) ─────────────────────────────────────────────────

  const [addItemError, setAddItemError] = useState("");

  const loadAllCableRollsForValidation = async () => {
    try {
      const response = await InventoryAPI.getItems({ category: DROP_CABLE_CATEGORY });
      const data = Array.isArray(response?.data) ? response.data : [];
      allCableRollsRef.current = data.filter(isCableRollNumber);
    } catch {
      allCableRollsRef.current = [];
    }
  };

  const openCableFeedModal = async () => {
    setCableFeedType("1k");
    setCableFeedInput("");
    setCableFeedStatus(S.IDLE);
    setCableFeedMessage("");
    setCableFeedScanned([]);
    cableFeedScannedRef.current = [];
    setModalCableFeed(true);
    loadAllCableRollsForValidation();
    requestAnimationFrame(() => cableFeedInputRef.current?.focus());
  };

  const closeCableFeedModal = () => {
    const hadRolls = cableFeedScannedRef.current.length > 0;
    setModalCableFeed(false);
    if (hadRolls) {
      setFilterPreset("drop-cable");
      setCurrentPage(1);
    }
    refreshList();
    loadCategories();
  };

  const saveCableRoll = async (rollNo) => {
    const name = normalizeCableRollInput(rollNo);
    if (!name) return;
    if (cableFeedScannedRef.current.some((s) => s.rollNo === name)) {
      setCableFeedStatus(S.DUPLICATE);
      setCableFeedMessage(`Roll ${name} already added this session`);
      return;
    }
    const exists = allCableRollsRef.current.find(
      (r) => (r.name || "").trim().toUpperCase() === name
    );
    if (exists) {
      setCableFeedStatus(S.ERROR);
      setCableFeedMessage(`Roll ${name} already exists in inventory`);
      return;
    }
    const preset = DROP_CABLE_PRESETS.find((p) => (cableFeedType === "2k" ? p.rollMeters === 2000 : p.rollMeters === 1000));
    if (!preset) return;

    setCableFeedStatus(S.SAVING);
    setCableFeedMessage(`Saving ${name}…`);
    try {
      const addedBy = user?.name || user?.username || user?.email || "Unknown";
      await InventoryAPI.addItem({
        name,
        description: preset.name,
        category: DROP_CABLE_CATEGORY,
        quantity: 1,
        unit: "pcs",
        minimum_quantity: 0,
        unit_price: 0,
        is_serialized: true,
        status: "active",
        added_by_id: user?.id ?? null,
        added_by_name: addedBy,
        comment: `1 roll = ${preset.rollMeters} m`,
      });
      const entry = { rollNo: name, type: preset.name };
      setCableFeedScanned((prev) => {
        const next = [entry, ...prev];
        cableFeedScannedRef.current = next;
        return next;
      });
      allCableRollsRef.current = [...allCableRollsRef.current, { name }];
      setCableFeedStatus(S.SUCCESS);
      setCableFeedMessage(`✓ ${name} added (${preset.name})`);
      setCableFeedInput("");
    } catch (err) {
      setCableFeedStatus(S.ERROR);
      setCableFeedMessage(err?.response?.data?.error || `Failed to add ${name}`);
    } finally {
      requestAnimationFrame(() => cableFeedInputRef.current?.focus());
    }
  };

  const handleCableFeedKey = (e) => {
    if (e.key === "Enter") {
      const val = normalizeHandheldScan(cableFeedInput);
      if (val) saveCableRoll(val);
    }
  };

  const openAddCablePreset = (preset) => {
    setAddItemError("");
    setAddForm({
      name: preset.name,
      description: preset.description,
      category: preset.category,
      quantity: 20,
      unit: preset.unit,
      minimum_quantity: 2,
      unit_price: 0,
      comment: `Stock in pieces — 1 pc = ${preset.rollMeters} m (${preset.rollMeters / 1000}k roll)`,
    });
    setModalAddItem(true);
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    setAddItemError("");
    try {
      const addedBy = user?.name || user?.username || user?.email || "Unknown";
      await InventoryAPI.addItem({
        ...addForm,
        is_serialized: false,
        added_by_id: user?.id ?? null,
        added_by_name: addedBy,
      });
      setModalAddItem(false);
      setAddForm({ name: "", description: "", category: "", quantity: 0, unit: "pcs", minimum_quantity: 5, unit_price: 0, comment: "" });
      refreshList();
      loadCategories();
    } catch (err) {
      const msg = err?.response?.data?.error || "Failed to add item. Please try again.";
      setAddItemError(msg);
    }
  };

  // ── Pagination ────────────────────────────────────────────────────────────

  const isAllItemsList = filterPreset === "all";
  const isCableRollList = filterPreset === "drop-cable";
  const isRouterList = filterPreset.startsWith("routers");
  const isOtherStockList = filterPreset === "other-stock";
  const useUnifiedTable = isAllItemsList || isCableRollList || isOtherStockList;

  const effectivePerPage = itemPerPage === 0 ? items.length || 1 : itemPerPage;
  const indexOfLast = currentPage * effectivePerPage;
  const currentItems = items.slice(indexOfLast - effectivePerPage, indexOfLast);
  const totalPages = Math.max(1, Math.ceil(items.length / effectivePerPage));

  const applyFilterPreset = (preset) => {
    setFilterPreset(preset);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterPreset("all");
    setCurrentPage(1);
    loadItems({ category: "", status: "", search: "" });
  };

  const renderItemActions = (item) => {
    const kind = inventoryItemKind(item);
    const canEdit = kind === "router" || kind === "cable-roll";
    return (
      <ul className="nk-tb-actions gx-1">
        <li>
          {canEdit ? (
            <Button
              size="sm"
              color="primary"
              title={kind === "cable-roll" ? "Edit roll" : "Edit router"}
              onClick={() => openEditModal(item)}
            >
              <Icon name="edit" />
            </Button>
          ) : (
            <Button size="sm" color="primary" title="Adjust stock" onClick={() => openAdjustModal(item)}>
              <Icon name="plus" />
            </Button>
          )}
        </li>
        <li className="ml-1">
          <Button size="sm" color="danger" onClick={() => handleDeleteItem(item.id)}>
            <Icon name="trash" />
          </Button>
        </li>
      </ul>
    );
  };

  const renderUnifiedDetail = (item) => {
    const kind = inventoryItemKind(item);
    if (kind === "router") {
      return (
        <span className="tb-lead text-primary" style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}>
          {item.serial_number || "—"}
        </span>
      );
    }
    if (kind === "cable-roll") {
      const m = getRollMetersFromItem(item);
      return (
        <span className="tb-sub">
          {item.description || getCableTypeLabel(m)}
          {m ? <span className="text-muted ml-1">· {m} m</span> : null}
        </span>
      );
    }
    return (
      <span className="tb-lead">
        {item.quantity_available ?? item.quantity ?? "—"}
        {item.unit ? <span className="text-muted ml-1" style={{ fontSize: "0.8rem" }}>{item.unit}</span> : null}
        {isDropCable(item) && item.quantity_discarded > 0 && (
          <div className="text-danger" style={{ fontSize: "0.72rem", marginTop: 2 }}>
            {item.quantity_discarded} pc discarded
          </div>
        )}
      </span>
    );
  };

  // ── Scan modal helpers ────────────────────────────────────────────────────

  const parsedSetup = parseRouterNumber(setupInput);
  const nextRouterLabel = fmtRouterNo(sessionPrefix, sessionCurrentNumber);

  const scanBorderColor =
    scanStatus === S.SUCCESS ? "#198754" :
    scanStatus === S.ERROR ? "#dc3545" :
    scanStatus === S.DUPLICATE ? "#e6a817" :
    scanStatus === S.SAVING ? "#0d6efd" : "#d0d7df";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <React.Fragment>
      <Head title={activePreset.label} />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>
                {isTechnician ? "My Inventory" : activePreset.label}
              </BlockTitle>
            </BlockHeadContent>
            {isAdmin && (
              <BlockHeadContent>
                <div className="d-flex gap-2">
                  <Button color="primary" onClick={openScanModal}>
                    <Icon name="scan" />
                    <span>Scan Routers</span>
                  </Button>
                  <Button color="info" onClick={openCableFeedModal}>
                    <Icon name="link" />
                    <span>Feed Cable Rolls</span>
                  </Button>
                  <Button color="light" onClick={() => setModalAddItem(true)}>
                    <Icon name="plus" />
                    <span>Add Item</span>
                  </Button>
                </div>
              </BlockHeadContent>
            )}
          </div>
        </BlockHead>

        {!isTechnician && (
          <Block>
            <Row className="g-gs">
              {Object.entries(FILTER_PRESETS).map(([key, preset]) => (
                <Col key={key} xs="6" sm="6" md="4" lg="3" xl="3">
                  <FilterCard
                    icon={preset.icon}
                    color={preset.color}
                    label={preset.label}
                    value={filterCounts[key] ?? "—"}
                    active={filterPreset === key}
                    loading={countsLoading && filterCounts[key] == null}
                    onClick={() => applyFilterPreset(key)}
                  />
                </Col>
              ))}
            </Row>
          </Block>
        )}

        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              {/* Search + pagination */}
              <div className="row g-3 mb-3 align-items-end">
                <div className="col-md-5">
                  <div className="form-control-wrap">
                    <div className="form-icon form-icon-left">
                      <Icon name="search" />
                    </div>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search name, serial, comment…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && loadItems()}
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <select
                    className="form-control"
                    value={itemPerPage}
                    onChange={(e) => setItemPerPage(parseInt(e.target.value, 10))}
                  >
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                    <option value={0}>Show all</option>
                  </select>
                </div>
                <div className="col-md-5 d-flex gap-2">
                  <Button color="primary" onClick={() => { setCurrentPage(1); loadItems(); }}>
                    <Icon name="search" />
                    <span>Search</span>
                  </Button>
                  {(searchTerm || filterPreset !== "all") && (
                    <Button color="light" onClick={clearFilters}>
                      Reset
                    </Button>
                  )}
                  <span className="text-muted small align-self-center ml-auto">
                    {loading ? "Loading…" : `${items.length} shown`}
                    {itemPerPage !== 0 && items.length > effectivePerPage
                      ? ` · page ${currentPage}/${totalPages}`
                      : ""}
                  </span>
                </div>
              </div>

              {/* Table */}
              <DataTable className="card-stretch">
                <DataTableBody>
                  <DataTableHead>
                    {useUnifiedTable ? (
                      <>
                        <DataTableRow><span className="sub-text">Item Name</span></DataTableRow>
                        <DataTableRow size="md"><span className="sub-text">Details</span></DataTableRow>
                        <DataTableRow size="md"><span className="sub-text">Category</span></DataTableRow>
                        <DataTableRow size="md"><span className="sub-text">Added By</span></DataTableRow>
                        <DataTableRow size="sm"><span className="sub-text">Date</span></DataTableRow>
                        <DataTableRow size="sm"><span className="sub-text">Status</span></DataTableRow>
                        <DataTableRow size="md"><span className="sub-text">Assigned / Ticket</span></DataTableRow>
                        <DataTableRow size="lg"><span className="sub-text">Comment</span></DataTableRow>
                        {isAdmin && (
                          <DataTableRow className="nk-tb-col-tools text-right">
                            <span className="sub-text">Actions</span>
                          </DataTableRow>
                        )}
                      </>
                    ) : (
                      <>
                        <DataTableRow>
                          <span className="sub-text">
                            {isRouterList ? "Router No." : "Item Name"}
                          </span>
                        </DataTableRow>
                        {isRouterList ? (
                          <DataTableRow size="md">
                            <span className="sub-text">Serial Number</span>
                          </DataTableRow>
                        ) : (
                          <DataTableRow size="md">
                            <span className="sub-text">Qty Available</span>
                          </DataTableRow>
                        )}
                        {!isRouterList && (
                          <DataTableRow size="md">
                            <span className="sub-text">Category</span>
                          </DataTableRow>
                        )}
                        <DataTableRow size="md">
                          <span className="sub-text">Added By</span>
                        </DataTableRow>
                        <DataTableRow size="sm">
                          <span className="sub-text">Date</span>
                        </DataTableRow>
                        <DataTableRow size="sm">
                          <span className="sub-text">Status</span>
                        </DataTableRow>
                        {isRouterList && (
                          <>
                            <DataTableRow size="md">
                              <span className="sub-text">Assigned To</span>
                            </DataTableRow>
                            <DataTableRow size="md">
                              <span className="sub-text">Ticket No.</span>
                            </DataTableRow>
                          </>
                        )}
                        <DataTableRow size="lg">
                          <span className="sub-text">Comment</span>
                        </DataTableRow>
                        {isAdmin && (
                          <DataTableRow className="nk-tb-col-tools text-right">
                            <span className="sub-text">Actions</span>
                          </DataTableRow>
                        )}
                      </>
                    )}
                  </DataTableHead>

                  {loading ? (
                    <div className="text-center py-5">
                      <Spinner color="primary" />
                    </div>
                  ) : currentItems.length > 0 ? (
                    currentItems.map((item) => (
                      <DataTableItem key={item.id}>
                        {useUnifiedTable ? (
                          <>
                            <DataTableRow>
                              <span
                                className="tb-lead fw-bold"
                                style={isCableRollItem(item) ? { fontFamily: "monospace", letterSpacing: "0.5px" } : undefined}
                              >
                                {item.name}
                              </span>
                            </DataTableRow>
                            <DataTableRow size="md">{renderUnifiedDetail(item)}</DataTableRow>
                            <DataTableRow size="md">
                              <span className="tb-sub text-muted">{item.category || "—"}</span>
                            </DataTableRow>
                            <DataTableRow size="md">
                              <span className="tb-sub">{getAddedBy(item)}</span>
                            </DataTableRow>
                            <DataTableRow size="sm">
                              <span className="tb-sub text-muted" style={{ fontSize: "0.8rem" }}>
                                {safeFormatDate(item.created_at)}
                              </span>
                            </DataTableRow>
                            <DataTableRow size="sm">
                              <Badge
                                color={
                                  item.status === "active" ? "success" :
                                  item.status === "disbursed" ? "info" :
                                  item.status === "faulty" ? "danger" : "secondary"
                                }
                              >
                                {item.status || "active"}
                              </Badge>
                            </DataTableRow>
                            <DataTableRow size="md">
                              {item.assigned_to_name || item.ticket_number ? (
                                <div>
                                  {item.assigned_to_name && (
                                    <Badge color="info" style={{ fontSize: "0.72rem" }}>
                                      <em className="icon ni ni-user mr-1" />
                                      {item.assigned_to_name}
                                    </Badge>
                                  )}
                                  {item.ticket_number && (
                                    <div className={item.assigned_to_name ? "mt-1" : ""}>
                                      <Badge color="warning" style={{ fontSize: "0.72rem" }}>
                                        <em className="icon ni ni-ticket-alt mr-1" />
                                        {item.ticket_number}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <em className="tb-sub text-muted" style={{ opacity: 0.4 }}>—</em>
                              )}
                            </DataTableRow>
                            <DataTableRow size="lg">
                              <span className="tb-sub text-muted">
                                {getComment(item) || <em style={{ opacity: 0.4 }}>—</em>}
                              </span>
                            </DataTableRow>
                            {isAdmin && (
                              <DataTableRow className="nk-tb-col-tools">
                                {renderItemActions(item)}
                              </DataTableRow>
                            )}
                          </>
                        ) : (
                          <>
                            <DataTableRow>
                              <span className="tb-lead fw-bold">{item.name}</span>
                            </DataTableRow>
                            {isRouterList ? (
                              <DataTableRow size="md">
                                <span
                                  className="tb-lead text-primary"
                                  style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}
                                >
                                  {item.serial_number || "-"}
                                </span>
                              </DataTableRow>
                            ) : (
                              <DataTableRow size="md">
                                <span className="tb-lead">
                                  {item.quantity_available ?? item.quantity ?? "-"}
                                  {item.unit ? <span className="text-muted ml-1" style={{ fontSize: "0.8rem" }}>{item.unit}</span> : null}
                                  {isDropCable(item) && item.quantity_discarded > 0 && (
                                    <div className="text-danger" style={{ fontSize: "0.72rem", marginTop: 2 }}>
                                      {item.quantity_discarded} pc discarded
                                    </div>
                                  )}
                                </span>
                              </DataTableRow>
                            )}
                            {!isRouterList && (
                              <DataTableRow size="md">
                                <span className="tb-sub text-muted">{item.category || "-"}</span>
                              </DataTableRow>
                            )}
                            <DataTableRow size="md">
                              <span className="tb-sub">{getAddedBy(item)}</span>
                            </DataTableRow>
                            <DataTableRow size="sm">
                              <span className="tb-sub text-muted" style={{ fontSize: "0.8rem" }}>
                                {safeFormatDate(item.created_at)}
                              </span>
                            </DataTableRow>
                            <DataTableRow size="sm">
                              <Badge
                                color={
                                  item.status === "active" ? "success" :
                                  item.status === "disbursed" ? "info" :
                                  item.status === "faulty" ? "danger" : "secondary"
                                }
                              >
                                {item.status || "active"}
                              </Badge>
                            </DataTableRow>
                            {isRouterList && (
                              <>
                                <DataTableRow size="md">
                                  {item.assigned_to_name ? (
                                    <Badge color="info" style={{ fontSize: "0.72rem" }}>
                                      <em className="icon ni ni-user mr-1" />
                                      {item.assigned_to_name}
                                    </Badge>
                                  ) : (
                                    <em className="tb-sub text-muted" style={{ opacity: 0.4 }}>—</em>
                                  )}
                                </DataTableRow>
                                <DataTableRow size="md">
                                  {item.ticket_number ? (
                                    <span className="tb-sub">
                                      <Badge color="warning" style={{ fontSize: "0.72rem" }}>
                                        <em className="icon ni ni-ticket-alt mr-1" />
                                        {item.ticket_number}
                                      </Badge>
                                      {item.used_by_name && (
                                        <div className="text-muted mt-1" style={{ fontSize: "0.7rem" }}>
                                          by {item.used_by_name}
                                        </div>
                                      )}
                                    </span>
                                  ) : (
                                    <em className="tb-sub text-muted" style={{ opacity: 0.4 }}>—</em>
                                  )}
                                </DataTableRow>
                              </>
                            )}
                            <DataTableRow size="lg">
                              <span className="tb-sub text-muted">
                                {getComment(item) || <em style={{ opacity: 0.4 }}>—</em>}
                              </span>
                            </DataTableRow>
                            {isAdmin && (
                              <DataTableRow className="nk-tb-col-tools">
                                {renderItemActions(item)}
                              </DataTableRow>
                            )}
                          </>
                        )}
                      </DataTableItem>
                    ))
                  ) : (
                    <div className="text-center py-5">
                      <em
                        className="icon ni ni-wifi-off mb-2"
                        style={{ fontSize: "2.5rem", color: "#c4cdd6", display: "block" }}
                      />
                      <p className="text-muted">No items found</p>
                    </div>
                  )}
                </DataTableBody>
              </DataTable>

              {itemPerPage !== 0 && items.length > effectivePerPage && (
                <div className="card-inner">
                  <PaginationComponent
                    itemPerPage={effectivePerPage}
                    totalItems={items.length}
                    paginate={(p) => setCurrentPage(p)}
                    currentPage={currentPage}
                  />
                </div>
              )}
            </div>
          </Card>
        </Block>
      </Content>

      {/* ── Feed drop cable rolls (T400…) ───────────────────────────────────── */}
      <Modal isOpen={modalCableFeed} toggle={closeCableFeedModal} size="lg">
        <ModalHeader toggle={closeCableFeedModal}>Feed Drop Cable Rolls</ModalHeader>
        <ModalBody>
          <p className="text-muted mb-3">
            Enter each roll number (e.g. <strong>T400</strong>) and press <strong>Enter</strong>, like router scanning.
            Choose 1k or 2k before scanning.
          </p>
          <FormGroup>
            <Label className="fw-bold">Cable type</Label>
            <Input
              type="select"
              value={cableFeedType}
              onChange={(e) => setCableFeedType(e.target.value)}
            >
              <option value="1k">Drop Cable 1k (1000 m per roll)</option>
              <option value="2k">Drop Cable 2k (2000 m per roll)</option>
            </Input>
          </FormGroup>
          <FormGroup>
            <Label className="fw-bold">Roll number</Label>
            <Input
              innerRef={cableFeedInputRef}
              type="text"
              placeholder="e.g. T400 or 400 (adds as T400)"
              value={cableFeedInput}
              onChange={(e) => { setCableFeedInput(e.target.value); setCableFeedStatus(S.IDLE); setCableFeedMessage(""); }}
              onKeyDown={handleCableFeedKey}
              style={{ fontFamily: "monospace", fontSize: "1.1rem" }}
              autoComplete="off"
            />
          </FormGroup>
          {cableFeedMessage && (
            <div className={`alert py-2 alert-${
              cableFeedStatus === S.SUCCESS ? "success" :
              cableFeedStatus === S.DUPLICATE ? "warning" : "danger"
            }`} style={{ fontSize: "0.85rem" }}>
              {cableFeedMessage}
            </div>
          )}
          {cableFeedScanned.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: "auto", background: "#f8f9fa", borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8094ae", marginBottom: 6 }}>
                ADDED THIS SESSION ({cableFeedScanned.length})
              </div>
              {cableFeedScanned.map((s, i) => (
                <div key={i} style={{ fontSize: "0.85rem", padding: "2px 0" }}>
                  <strong>{s.rollNo}</strong>
                  <span className="text-muted ml-2">{s.type}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-muted small mb-2">
            Click <strong>Done</strong> to open the list filtered to <strong>Drop Cable</strong> rolls (not the router view).
          </p>
          <div className="text-right mt-3">
            <Button color="primary" onClick={closeCableFeedModal}>Done</Button>
          </div>
        </ModalBody>
      </Modal>

      {/* ── Scan Session Modal ──────────────────────────────────────────────── */}
      <Modal isOpen={modalScan} toggle={closeScanModal} size="lg">
        <ModalHeader toggle={closeScanModal}>
          {scanPhase === "setup"
            ? "Set Up Router Scan Session"
            : `Scanning — Next: ${nextRouterLabel}`}
        </ModalHeader>
        <ModalBody>
          {scanPhase === "setup" ? (
            /* ── Setup phase ── */
            <div>
              <p className="text-muted mb-4">
                Enter the starting router number. The number auto-increments after each scan.
                The barcode scanner types the serial number and presses <strong>Enter</strong> to save automatically.
              </p>

              <FormGroup>
                <Label className="fw-bold">Starting Router Number</Label>
                <Input
                  type="text"
                  placeholder="e.g. C102, B860, RT001"
                  value={setupInput}
                  autoFocus
                  onChange={(e) => { setSetupInput(e.target.value); setSetupError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && startScanning()}
                  style={{ fontSize: "1.4rem", fontWeight: "bold", maxWidth: "220px", letterSpacing: "1px" }}
                />
                <small className="form-text text-muted">
                  Format: one or more letters + a number, e.g.{" "}
                  <strong>C102</strong>, <strong>B860</strong>, <strong>RT001</strong>
                </small>
                {setupError && <div className="text-danger small mt-1">{setupError}</div>}

                {parsedSetup && !setupError && (
                  <div className="mt-3 p-3 bg-light rounded d-flex align-items-center gap-2 flex-wrap">
                    <span className="text-muted small mr-2">Will assign:</span>
                    {[0, 1, 2, 3].map((i) => (
                      <Badge key={i} color="primary" className="mr-1" style={{ fontSize: "0.85rem" }}>
                        {fmtRouterNo(parsedSetup.prefix.toUpperCase(), parsedSetup.number + i)}
                      </Badge>
                    ))}
                    <span className="text-muted small">…</span>
                  </div>
                )}
              </FormGroup>

              <div className="text-right mt-4">
                <Button color="light" onClick={closeScanModal} className="mr-2">Cancel</Button>
                <Button color="primary" onClick={startScanning} disabled={!setupInput}>
                  <Icon name="forward-ios" /> Start Scanning
                </Button>
              </div>
            </div>
          ) : (
            /* ── Scanning phase ── */
            <div>
              {/* Big router number display */}
              <div
                className="text-center mb-4 py-3"
                style={{ background: "#f8fafc", borderRadius: "10px" }}
              >
                <div className="text-muted small mb-1" style={{ fontSize: "0.75rem", letterSpacing: "1px", textTransform: "uppercase" }}>
                  Next router number
                </div>
                <div
                  style={{
                    fontSize: "3rem",
                    fontWeight: "800",
                    letterSpacing: "4px",
                    color: "#364a63",
                    lineHeight: 1.1,
                  }}
                >
                  {nextRouterLabel}
                </div>
              </div>

              {/* Scan input */}
              <FormGroup>
                <Label className="fw-bold">
                  <Icon name="scan" className="mr-1" />
                  Barcode / Serial Number
                </Label>
                <Input
                  innerRef={scanInputRef}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={handleScanKeyDown}
                  placeholder="Point scanner here and pull the trigger…"
                  disabled={scanStatus === S.SAVING}
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: "600",
                    fontFamily: "monospace",
                    letterSpacing: "1px",
                    borderWidth: "2px",
                    borderColor: scanBorderColor,
                    transition: "border-color 0.15s",
                  }}
                />
                <small className="form-text text-muted">
                  The scanner acts like a keyboard — scan the router label, it fills this field and saves automatically.
                </small>
                <small className="form-text text-warning">
                  Accepted format: barcode must start with <strong>48</strong> and be exactly <strong>16</strong> characters.
                </small>
              </FormGroup>

              {/* Status message */}
              <div
                style={{
                  minHeight: "32px",
                  textAlign: "center",
                  fontSize: "1rem",
                  fontWeight: "600",
                  color: STATUS_COLORS[scanStatus],
                  transition: "color 0.15s",
                  marginBottom: "16px",
                }}
              >
                {scanStatus === S.SAVING ? (
                  <><Spinner size="sm" className="mr-1" /> {scanMessage}</>
                ) : (
                  scanMessage
                )}
              </div>

              {/* Session log header */}
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="text-muted small">
                  <strong>{sessionScanned.length}</strong> router{sessionScanned.length !== 1 ? "s" : ""} added this session
                </span>
                <div className="d-flex gap-2">
                  {sessionScanned.length > 0 && (
                    <Button
                      size="sm"
                      color="warning"
                      onClick={undoLastScan}
                      disabled={scanStatus === S.SAVING}
                      title="Remove the last scan and go back to that router number"
                    >
                      <Icon name="undo" /> Undo Last
                    </Button>
                  )}
                  <Button size="sm" color="light" onClick={() => setScanPhase("setup")}>
                    <Icon name="edit" /> Change Start
                  </Button>
                </div>
              </div>

              {/* Session log table */}
              {sessionScanned.length > 0 ? (
                <div
                  style={{
                    maxHeight: "240px",
                    overflowY: "auto",
                    border: "1px solid #e0e7ef",
                    borderRadius: "6px",
                  }}
                >
                  <table className="table table-sm table-hover mb-0">
                    <thead style={{ position: "sticky", top: 0, background: "#f8f9fa", zIndex: 1 }}>
                      <tr>
                        <th className="text-muted small py-2">Router No.</th>
                        <th className="text-muted small py-2">Serial Number</th>
                        <th className="text-muted small py-2">Time</th>
                        <th className="text-muted small py-2 text-center" style={{ width: "60px" }}>Del</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionScanned.map((s, i) => (
                        <tr
                          key={i}
                          style={{
                            background: i === 0 ? "#f0fdf4" : undefined,
                            opacity: s.deleting ? 0.4 : 1,
                            transition: "opacity 0.2s",
                          }}
                        >
                          <td>
                            <strong>{s.routerNumber}</strong>
                            {i === 0 && (
                              <Badge color="success" className="ml-1" style={{ fontSize: "0.65rem" }}>
                                last
                              </Badge>
                            )}
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.9rem" }}>
                            {s.serial}
                          </td>
                          <td className="text-muted small">
                            {format(s.time, "HH:mm:ss")}
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger py-0 px-1"
                              style={{ lineHeight: "1.4" }}
                              disabled={s.deleting || scanStatus === S.SAVING}
                              onClick={() => deleteSessionEntry(s)}
                              title={`Delete ${s.routerNumber} (${s.serial})`}
                            >
                              {s.deleting ? (
                                <Spinner size="sm" />
                              ) : (
                                <em className="icon ni ni-trash" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div
                  className="text-center text-muted py-4"
                  style={{ border: "2px dashed #e0e7ef", borderRadius: "6px", fontSize: "0.9rem" }}
                >
                  <em className="icon ni ni-scan mr-2" />
                  Waiting for first scan…
                </div>
              )}

              <div className="text-right mt-4">
                <Button color="primary" onClick={closeScanModal}>
                  <Icon name="check" /> Done
                </Button>
              </div>
            </div>
          )}
        </ModalBody>
      </Modal>

      {/* ── Edit Router Modal ───────────────────────────────────────────────── */}
      <Modal isOpen={modalEdit} toggle={() => setModalEdit(false)}>
        <ModalHeader toggle={() => setModalEdit(false)}>Edit Router</ModalHeader>
        <ModalBody>
          <Form onSubmit={handleEditSave}>
            <FormGroup>
              <Label>Router Number</Label>
              <Input
                type="text"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <Label>Serial Number</Label>
              <Input
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={editForm.serial_number}
                onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                placeholder="Scan or type serial"
                style={{ fontFamily: "monospace" }}
              />
            </FormGroup>
            <FormGroup>
              <Label>Status</Label>
              <Input
                type="select"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="disbursed">Disbursed</option>
                <option value="inactive">Inactive</option>
                <option value="faulty">Faulty</option>
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Used on Ticket</Label>
              <Input
                type="text"
                value={editForm.ticket_number}
                onChange={(e) => setEditForm({ ...editForm, ticket_number: e.target.value })}
                placeholder="e.g., #12345 or TK-2026-001"
              />
              <small className="text-muted">Enter ticket number to mark this item as used for a specific ticket. This helps categorize the item as 'used'.</small>
            </FormGroup>
            <FormGroup>
              <Label>Comment</Label>
              <Input
                type="textarea"
                rows="3"
                value={editForm.comment}
                onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
                placeholder="Optional notes about this router…"
              />
            </FormGroup>
            <div className="text-right">
              <Button color="light" type="button" onClick={() => setModalEdit(false)} className="mr-2">
                Cancel
              </Button>
              <Button color="primary" type="submit">
                Save Changes
              </Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>

      {/* ── Add Item Modal (non-router bulk items) ──────────────────────────── */}
      <Modal isOpen={modalAddItem} toggle={() => { setModalAddItem(false); setAddItemError(""); }}>
        <ModalHeader toggle={() => { setModalAddItem(false); setAddItemError(""); }}>Add Inventory Item</ModalHeader>
        <ModalBody>
          {addItemError && (
            <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.85rem" }}>
              <em className="icon ni ni-alert-circle mr-1" />
              {addItemError}
            </div>
          )}
          <Form onSubmit={handleAddItem}>
            <FormGroup>
              <Label>Item Name *</Label>
              <Input
                type="text"
                required
                placeholder="e.g. Patch Cord, ATB, Connector"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <Label>Category *</Label>
              <Input
                type="text"
                required
                placeholder="e.g. Patch Cord, Loaded, Tools"
                value={addForm.category}
                onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              />
            </FormGroup>
            <div className="row">
              <div className="col-6">
                <FormGroup>
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    required
                    min="0"
                    value={addForm.quantity}
                    onChange={(e) => setAddForm({ ...addForm, quantity: parseInt(e.target.value) || 0 })}
                  />
                </FormGroup>
              </div>
              <div className="col-6">
                <FormGroup>
                  <Label>Unit</Label>
                  <Input
                    type="select"
                    value={addForm.unit}
                    onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })}
                  >
                    <option value="pcs">pcs</option>
                    <option value="meters">meters (drop cable)</option>
                    <option value="rolls">rolls</option>
                    <option value="boxes">boxes</option>
                  </Input>
                  {isDropCable({ name: addForm.name, category: addForm.category, unit: addForm.unit }) && (
                    <small className="text-muted d-block mt-1">
                      Warehouse stock in <strong>pieces</strong> (rolls). Disburse 1 pc per roll; technicians deduct <strong>meters</strong> on tickets.
                    </small>
                  )}
                </FormGroup>
              </div>
            </div>
            <FormGroup>
              <Label>Min. Quantity (reorder point)</Label>
              <Input
                type="number"
                min="0"
                value={addForm.minimum_quantity}
                onChange={(e) => setAddForm({ ...addForm, minimum_quantity: parseInt(e.target.value) || 0 })}
              />
            </FormGroup>
            <FormGroup>
              <Label>Comment</Label>
              <Input
                type="textarea"
                rows="2"
                placeholder="Optional note or remark"
                value={addForm.comment}
                onChange={(e) => setAddForm({ ...addForm, comment: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <Label>Added By</Label>
              <Input
                type="text"
                readOnly
                value={user?.name || user?.username || user?.email || "Unknown"}
                style={{ background: "#f5f6fa", cursor: "default" }}
              />
            </FormGroup>
            <div className="text-right">
              <Button color="light" type="button" onClick={() => { setModalAddItem(false); setAddItemError(""); }} className="mr-2">
                Cancel
              </Button>
              <Button color="info" type="submit">
                Add Item
              </Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>

      {/* ── Adjust Stock Modal (non-router only) ───────────────────────────── */}
      <Modal isOpen={modalAdjust} toggle={() => setModalAdjust(false)}>
        <ModalHeader toggle={() => setModalAdjust(false)}>Adjust Item Stock</ModalHeader>
        <ModalBody>
          {selectedItem && (
            <div className="mb-3 p-2" style={{ background: "#f5f6fa", borderRadius: 6, fontSize: "0.85rem" }}>
              <div><strong>{selectedItem.name}</strong>{selectedItem.category ? ` — ${selectedItem.category}` : ""}</div>
              <div className="text-muted">
                Available: <strong>{selectedItem.quantity_available ?? 0}</strong>
                {" · "}Total: <strong>{selectedItem.quantity_total ?? selectedItem.quantity_available ?? 0}</strong>
              </div>
            </div>
          )}
          {adjustError && (
            <div className="alert alert-danger py-2 mb-3" style={{ fontSize: "0.82rem" }}>
              <em className="icon ni ni-alert-circle mr-1" />
              {adjustError}
            </div>
          )}
          <Form onSubmit={handleAdjustStock}>
            <FormGroup>
              <Label>Adjustment *</Label>
              <Input
                type="number"
                required
                placeholder="e.g. +10 or -4"
                value={adjustForm.adjustment}
                onChange={(e) => setAdjustForm({ ...adjustForm, adjustment: e.target.value })}
              />
              <small className="text-muted">Use positive to add stock, negative to deduct stock.</small>
            </FormGroup>
            <FormGroup>
              <Label>Reason</Label>
              <Input
                type="textarea"
                rows="2"
                required
                placeholder="e.g. Restock, damaged, count correction, returned from technician..."
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              />
            </FormGroup>
            <div className="text-right">
              <Button color="light" type="button" className="mr-2" onClick={() => setModalAdjust(false)}>
                Cancel
              </Button>
              <Button color="primary" type="submit" disabled={adjustingStock}>
                {adjustingStock ? <Spinner size="sm" /> : "Apply Adjustment"}
              </Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(InventoryList);
