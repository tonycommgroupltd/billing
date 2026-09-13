import React, { useState, useEffect, useCallback } from "react";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import DataTable from "react-data-table-component";
import { Row, Col, Badge, Spinner, Modal, ModalBody, ModalHeader, ModalFooter } from "reactstrap";
import {
    Block,
    BlockHead,
    BlockBetween,
    BlockHeadContent,
    BlockTitle,
    PreviewCard,
    Button,
    Icon,
} from "../../components/Component";
import { http } from '../../helpers';
import { toast } from "react-toastify";
import dateFormat from 'dateformat';
import DatePicker from "react-datepicker";
import exportFromJSON from "export-from-json";
import Swal from "sweetalert2";

const statusColors = {
    pending: 'warning',
    paid: 'success',
    unpaid: 'danger',
};

const ExpiredAccounts = () => {
    const [data, setData] = useState([]);
    const [summary, setSummary] = useState({ pending: 0, paid: 0, unpaid: 0 });
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedRows, setSelectedRows] = useState([]);
    const [toggleCleared, setToggleCleared] = useState(false);
    const [statsData, setStatsData] = useState([]);
    const [statsLoading, setStatsLoading] = useState(false);
    const [noteModal, setNoteModal] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [noteTarget, setNoteTarget] = useState(null);
    const [filter, setFilter] = useState('all');
    const [searchText, setSearchText] = useState('');

    const dateStr = dateFormat(selectedDate, "yyyy-mm-dd");

    const fetchExpired = useCallback(async () => {
        setLoading(true);
        try {
            const response = await http.get(
                `${process.env.REACT_APP_API_URL}/expired-accounts?date=${dateStr}`
            );
            if (response.data) {
                setData(response.data.data || []);
                setSummary(response.data.summary || { pending: 0, paid: 0, unpaid: 0 });
            }
        } catch (error) {
            toast.error("Failed to load expired accounts");
        }
        setLoading(false);
    }, [dateStr]);

    const fetchStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const from = dateFormat(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), "yyyy-mm-dd");
            const response = await http.get(
                `${process.env.REACT_APP_API_URL}/expired-accounts/stats?from=${from}&to=${dateStr}`
            );
            if (response.data?.data) {
                setStatsData(response.data.data);
            }
        } catch (error) {
            // Stats are optional
        }
        setStatsLoading(false);
    }, [dateStr, selectedDate]);

    useEffect(() => {
        fetchExpired();
        fetchStats();
    }, [fetchExpired, fetchStats]);

    const markAccount = async (serviceId, status, notes = null) => {
        try {
            await http.post(`${process.env.REACT_APP_API_URL}/expired-accounts/mark`, {
                service_id: serviceId,
                date: dateStr,
                status,
                notes,
            });
            toast.success(`Marked as ${status}`);
            fetchExpired();
        } catch (error) {
            toast.error("Failed to update status");
        }
    };

    const markBulk = async (status) => {
        if (selectedRows.length === 0) return;

        const result = await Swal.fire({
            title: `Mark ${selectedRows.length} accounts as ${status}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: `Yes, mark as ${status}`,
        });

        if (!result.isConfirmed) return;

        try {
            await http.post(`${process.env.REACT_APP_API_URL}/expired-accounts/mark-bulk`, {
                service_ids: selectedRows.map(r => r.service_id),
                date: dateStr,
                status,
            });
            toast.success(`${selectedRows.length} accounts marked as ${status}`);
            setToggleCleared(!toggleCleared);
            setSelectedRows([]);
            fetchExpired();
        } catch (error) {
            toast.error("Failed to bulk update");
        }
    };

    const openNoteModal = (row, status) => {
        setNoteTarget({ serviceId: row.service_id, status });
        setNoteText('');
        setNoteModal(true);
    };

    const submitNote = () => {
        if (noteTarget) {
            markAccount(noteTarget.serviceId, noteTarget.status, noteText || null);
        }
        setNoteModal(false);
    };

    const exportData = () => {
        const exportRows = filteredData.map(r => ({
            'Customer': r.customer_name,
            'Phone': r.phone_number,
            'City': r.city || '',
            'Plan': r.plan_name,
            'Price': r.price,
            'Balance': r.balance,
            'Expired Date': dateStr,
            'Status': r.tracking_status,
            'Marked By': r.marked_by || '',
            'Notes': r.notes || '',
        }));
        exportFromJSON({ data: exportRows, fileName: `expired-accounts-${dateStr}`, exportType: exportFromJSON.types.xls });
    };

    // Filter + search
    const filteredData = data.filter(item => {
        if (filter !== 'all' && item.tracking_status !== filter) return false;
        if (searchText) {
            const s = searchText.toLowerCase();
            return (
                (item.customer_name || '').toLowerCase().includes(s) ||
                (item.phone_number || '').includes(s) ||
                (item.plan_name || '').toLowerCase().includes(s) ||
                (item.city || '').toLowerCase().includes(s)
            );
        }
        return true;
    });

    const columns = [
        {
            name: "#",
            selector: (row, index) => index + 1,
            width: "50px",
            sortable: false,
        },
        {
            name: "Customer",
            selector: row => row.customer_name,
            sortable: true,
            grow: 2,
            cell: row => (
                <div>
                    <strong>{row.customer_name}</strong>
                    <br />
                    <small className="text-muted">{row.phone_number}</small>
                </div>
            ),
        },
        {
            name: "City",
            selector: row => row.city || '-',
            sortable: true,
        },
        {
            name: "Plan",
            selector: row => row.plan_name,
            sortable: true,
        },
        {
            name: "Price",
            selector: row => row.price,
            sortable: true,
            cell: row => <span>KES {Number(row.price).toLocaleString()}</span>,
        },
        {
            name: "Balance",
            selector: row => row.balance,
            sortable: true,
            cell: row => (
                <span className={Number(row.balance) < 0 ? 'text-danger fw-bold' : Number(row.balance) > 0 ? 'text-success fw-bold' : ''}>
                    KES {Number(row.balance).toLocaleString()}
                </span>
            ),
        },
        {
            name: "Status",
            selector: row => row.tracking_status,
            sortable: true,
            cell: row => (
                <Badge color={statusColors[row.tracking_status] || 'secondary'} className="text-capitalize">
                    {row.tracking_status}
                </Badge>
            ),
        },
        {
            name: "Marked By",
            selector: row => row.marked_by || '-',
            sortable: true,
            cell: row => row.marked_by ? (
                <div>
                    <small>{row.marked_by}</small>
                    {row.marked_at && <><br /><small className="text-muted">{dateFormat(row.marked_at, "dd/mm HH:MM")}</small></>}
                </div>
            ) : '-',
        },
        {
            name: "Actions",
            width: "220px",
            cell: row => (
                <div className="d-flex gap-1">
                    {row.tracking_status !== 'paid' && (
                        <button
                            className="btn btn-sm btn-success"
                            onClick={() => markAccount(row.service_id, 'paid')}
                            title="Mark as Paid"
                        >
                            <Icon name="check" />
                        </button>
                    )}
                    {row.tracking_status !== 'unpaid' && (
                        <button
                            className="btn btn-sm btn-danger"
                            onClick={() => markAccount(row.service_id, 'unpaid')}
                            title="Mark as Unpaid"
                        >
                            <Icon name="cross" />
                        </button>
                    )}
                    {row.tracking_status !== 'pending' && (
                        <button
                            className="btn btn-sm btn-warning"
                            onClick={() => markAccount(row.service_id, 'pending')}
                            title="Reset to Pending"
                        >
                            <Icon name="undo" />
                        </button>
                    )}
                    <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => openNoteModal(row, row.tracking_status === 'paid' ? 'unpaid' : 'paid')}
                        title="Add Note"
                    >
                        <Icon name="edit" />
                    </button>
                </div>
            ),
        },
    ];

    const total = data.length;

    return (
        <React.Fragment>
            <Head title="Expired Accounts Tracker" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle page tag="h3">
                                Expired Accounts Tracker
                            </BlockTitle>
                            <p className="text-soft">Track expired services and mark payment status daily</p>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <div className="d-flex align-items-center gap-2">
                                <DatePicker
                                    selected={selectedDate}
                                    onChange={(date) => setSelectedDate(date)}
                                    dateFormat="yyyy-MM-dd"
                                    className="form-control form-control-sm"
                                    maxDate={new Date()}
                                />
                                <Button color="primary" size="sm" onClick={fetchExpired}>
                                    <Icon name="reload" /> Refresh
                                </Button>
                                <Button color="light" size="sm" onClick={exportData}>
                                    <Icon name="download" /> Export
                                </Button>
                            </div>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>

                {/* Summary Cards */}
                <Block>
                    <Row className="g-gs mb-3">
                        <Col sm="3">
                            <div className="card card-bordered" style={{ borderLeft: '4px solid #f4bd0e' }}>
                                <div className="card-inner py-2 px-3">
                                    <div className="d-flex justify-content-between align-items-center">
                                        <div>
                                            <div className="card-title" style={{ fontSize: '12px', color: '#8094ae' }}>TOTAL EXPIRED</div>
                                            <h4 className="mb-0">{total}</h4>
                                        </div>
                                        <Icon name="alert-circle" style={{ fontSize: '28px', color: '#f4bd0e' }} />
                                    </div>
                                </div>
                            </div>
                        </Col>
                        <Col sm="3">
                            <div className="card card-bordered" style={{ borderLeft: '4px solid #f4bd0e', cursor: 'pointer' }} onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')}>
                                <div className="card-inner py-2 px-3">
                                    <div className="d-flex justify-content-between align-items-center">
                                        <div>
                                            <div className="card-title" style={{ fontSize: '12px', color: '#8094ae' }}>PENDING</div>
                                            <h4 className="mb-0">{summary.pending}</h4>
                                        </div>
                                        <Icon name="clock" style={{ fontSize: '28px', color: '#f4bd0e' }} />
                                    </div>
                                </div>
                            </div>
                        </Col>
                        <Col sm="3">
                            <div className="card card-bordered" style={{ borderLeft: '4px solid #1ee0ac', cursor: 'pointer' }} onClick={() => setFilter(filter === 'paid' ? 'all' : 'paid')}>
                                <div className="card-inner py-2 px-3">
                                    <div className="d-flex justify-content-between align-items-center">
                                        <div>
                                            <div className="card-title" style={{ fontSize: '12px', color: '#8094ae' }}>PAID</div>
                                            <h4 className="mb-0">{summary.paid}</h4>
                                        </div>
                                        <Icon name="check-circle" style={{ fontSize: '28px', color: '#1ee0ac' }} />
                                    </div>
                                </div>
                            </div>
                        </Col>
                        <Col sm="3">
                            <div className="card card-bordered" style={{ borderLeft: '4px solid #e85347', cursor: 'pointer' }} onClick={() => setFilter(filter === 'unpaid' ? 'all' : 'unpaid')}>
                                <div className="card-inner py-2 px-3">
                                    <div className="d-flex justify-content-between align-items-center">
                                        <div>
                                            <div className="card-title" style={{ fontSize: '12px', color: '#8094ae' }}>UNPAID</div>
                                            <h4 className="mb-0">{summary.unpaid}</h4>
                                        </div>
                                        <Icon name="cross-circle" style={{ fontSize: '28px', color: '#e85347' }} />
                                    </div>
                                </div>
                            </div>
                        </Col>
                    </Row>
                </Block>

                {/* Monthly History */}
                {statsData.length > 0 && (
                    <Block>
                        <PreviewCard className="mb-3">
                            <div className="card-title-group mb-2">
                                <div className="card-title">
                                    <h6 className="title">Daily Summary — {dateFormat(selectedDate, "mmmm yyyy")}</h6>
                                </div>
                            </div>
                            <div className="d-flex flex-wrap gap-2">
                                {statsData.map(day => (
                                    <div
                                        key={day.date}
                                        className={`text-center p-2 rounded border ${day.date === dateStr ? 'border-primary bg-light' : ''}`}
                                        style={{ minWidth: '80px', cursor: 'pointer' }}
                                        onClick={() => setSelectedDate(new Date(day.date + 'T00:00:00'))}
                                    >
                                        <small className="d-block text-muted">{dateFormat(new Date(day.date + 'T00:00:00'), "dd mmm")}</small>
                                        <strong>{day.total}</strong>
                                        <div className="d-flex justify-content-center gap-1 mt-1">
                                            {Number(day.paid) > 0 && <Badge color="success" pill style={{ fontSize: '10px' }}>{day.paid}</Badge>}
                                            {Number(day.unpaid) > 0 && <Badge color="danger" pill style={{ fontSize: '10px' }}>{day.unpaid}</Badge>}
                                            {Number(day.pending) > 0 && <Badge color="warning" pill style={{ fontSize: '10px' }}>{day.pending}</Badge>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </PreviewCard>
                    </Block>
                )}

                {/* Bulk Actions */}
                {selectedRows.length > 0 && (
                    <Block>
                        <div className="alert alert-light d-flex align-items-center justify-content-between py-2 mb-2">
                            <span><strong>{selectedRows.length}</strong> accounts selected</span>
                            <div className="d-flex gap-2">
                                <Button color="success" size="sm" onClick={() => markBulk('paid')}>
                                    <Icon name="check" /> Mark All Paid
                                </Button>
                                <Button color="danger" size="sm" onClick={() => markBulk('unpaid')}>
                                    <Icon name="cross" /> Mark All Unpaid
                                </Button>
                            </div>
                        </div>
                    </Block>
                )}

                {/* Data Table */}
                <Block>
                    <PreviewCard>
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <div className="d-flex align-items-center gap-2">
                                <h6 className="mb-0">
                                    Expired on {dateFormat(selectedDate, "dddd, mmmm dS yyyy")}
                                    {filter !== 'all' && <Badge color={statusColors[filter]} className="ms-2 text-capitalize">{filter}</Badge>}
                                </h6>
                            </div>
                            <div style={{ width: '250px' }}>
                                <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    placeholder="Search name, phone, plan..."
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                />
                            </div>
                        </div>
                        {loading ? (
                            <div className="text-center py-5">
                                <Spinner color="primary" />
                                <p className="mt-2">Loading expired accounts...</p>
                            </div>
                        ) : (
                            <DataTable
                                columns={columns}
                                data={filteredData}
                                pagination
                                paginationPerPage={50}
                                paginationRowsPerPageOptions={[25, 50, 100]}
                                selectableRows
                                onSelectedRowsChange={({ selectedRows: rows }) => setSelectedRows(rows)}
                                clearSelectedRows={toggleCleared}
                                highlightOnHover
                                striped
                                responsive
                                noDataComponent={
                                    <div className="text-center py-5">
                                        <Icon name="calendar" style={{ fontSize: '48px', color: '#dbdfea' }} />
                                        <p className="mt-2 text-muted">No expired accounts for {dateStr}</p>
                                    </div>
                                }
                                conditionalRowStyles={[
                                    {
                                        when: row => row.tracking_status === 'paid',
                                        style: { backgroundColor: '#f0fdf4' },
                                    },
                                    {
                                        when: row => row.tracking_status === 'unpaid',
                                        style: { backgroundColor: '#fef2f2' },
                                    },
                                ]}
                            />
                        )}
                    </PreviewCard>
                </Block>
            </Content>

            {/* Note Modal */}
            <Modal isOpen={noteModal} toggle={() => setNoteModal(false)}>
                <ModalHeader toggle={() => setNoteModal(false)}>Add Note</ModalHeader>
                <ModalBody>
                    <div className="form-group">
                        <label className="form-label">Note (optional)</label>
                        <textarea
                            className="form-control"
                            rows="3"
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="e.g. Customer promised to pay tomorrow..."
                        />
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button color="secondary" size="sm" onClick={() => setNoteModal(false)}>Cancel</Button>
                    <Button color="primary" size="sm" onClick={submitNote}>
                        Save & Mark as {noteTarget?.status}
                    </Button>
                </ModalFooter>
            </Modal>
        </React.Fragment>
    );
};

export default ExpiredAccounts;
