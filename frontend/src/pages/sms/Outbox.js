
import React, { useState, useEffect } from "react";
import { Open20Regular, Delete20Regular, ArrowRepeatAll20Regular } from '@fluentui/react-icons';
import { Link } from "react-router-dom";
import {
    Block,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
    Icon,
    PreviewCard,
    Button,
    DataTablePagination,
    TooltipComponent
} from "../../components/Component";
import { http } from '../../helpers';
import exportFromJSON from "export-from-json";
import CopyToClipboard from "react-copy-to-clipboard";
import Swal from "sweetalert2";
import { Col, Modal, ModalBody, Row, Badge } from "reactstrap";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import DataTable from "react-data-table-component";
import dateFormat from 'dateformat';
import { toast } from "react-toastify";

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const Export = ({ data }) => {
    const [modal, setModal] = useState(false);

    useEffect(() => {
        if (modal === true) {
            setTimeout(() => setModal(false), 2000);
        }
    }, [modal]);

    const fileName = "user-data";

    const exportCSV = () => {
        const exportType = exportFromJSON.types.csv;
        exportFromJSON({ data, fileName, exportType });
    };

    const exportExcel = () => {
        const exportType = exportFromJSON.types.xls;
        exportFromJSON({ data, fileName, exportType });
    };

    const copyToClipboard = () => {
        setModal(true);
    };

    return (
        <React.Fragment>
            <div className="dt-export-buttons d-flex align-center">
                <div className="dt-export-title d-none d-md-inline-block">Export</div>
                <div className="dt-buttons btn-group flex-wrap">
                    <CopyToClipboard text={JSON.stringify(data)}>
                        <Button className="btn btn-secondary buttons-copy buttons-html5" onClick={() => copyToClipboard()}>
                            <span>Copy</span>
                        </Button>
                    </CopyToClipboard>{" "}
                    <button className="btn btn-secondary buttons-csv buttons-html5" type="button" onClick={() => exportCSV()}>
                        <span>CSV</span>
                    </button>{" "}
                    <button className="btn btn-secondary buttons-excel buttons-html5" type="button" onClick={() => exportExcel()}>
                        <span>Excel</span>
                    </button>{" "}
                </div>
            </div>
            <Modal isOpen={modal} className="modal-dialog-centered text-center" size="sm">
                <ModalBody className="text-center m-2">
                    <h5>Copied to clipboard</h5>
                </ModalBody>
                <div className="p-3 bg-light">
                    <div className="text-center">Copied {data.length} rows to clipboard</div>
                </div>
            </Modal>
        </React.Fragment>
    );
};

const ExpandableRowComponent = ({ data }) => {
    return (
        <ul className="dtr-details p-2 border-bottom ms-1">
            <li className="d-block d-sm-none">
                <span className="dtr-title">NAS type</span> <span className="dtr-data">{data.nas_type}</span>
            </li>
            <li className="d-block d-sm-none">
                <span className="dtr-title ">Vendor/Model</span> <span className="dtr-data">{data.model}</span>
            </li>
            <li>
                <span className="dtr-title">IP/Host</span> <span className="dtr-data">{data.host}</span>
            </li>
            <li>
                <span className="dtr-title">Physical address</span> <span className="dtr-data">{data.physical_address}</span>
            </li>
            <li>
                <span className="dtr-title">Status</span> <span className="dtr-data">{data.status !== 0 ? <Badge color="success">API Enabled</Badge> : <Badge color="dark">API Disabled</Badge>}</span>
            </li>
        </ul>
    );
};

const Outbox = () => {
    let expandableRows = false;
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(10);
    const [sort, setSort] = useState('desc');
    const [sortCol, setSortCol] = useState('id');
    const [searchText, setSearchText] = useState("");
    const [mobileView, setMobileView] = useState();
    const [toggleCleared, setToggleCleared] = useState(false);
    const [reload, setReload] = useState(false);

    const execToast = (placement, message) => {
        toast.error(message, {
            position: placement,
            autoClose: true,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: false,
            closeButton: <CloseButton />,
        });
    };

    const successToast = (placement, message) => {
        toast.success(message, {
            position: placement,
            autoClose: true,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: false,
            closeButton: <CloseButton />,
        });
    };

    const columns = [
        {
            id: 1,
            name: "ID",
            cell: (row) => (
                <Link to={`${process.env.PUBLIC_URL}/admin/sms/outbox/${row.id}`}>{row.id}</Link>
            ),
            selector: (row) => row.id,
            width: "80px",
            wrap: true,
            sortable: true,
            ref: "id"
        },
        {
            id: 2,
            name: "Customer",
            cell: (row) => (
                row.customer_id ? <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${row.customer_id}`}>{row.name}</Link> : row.recipient
            ),
            selector: (row) => row.name,
            wrap: true,
            sortable: true,
            ref: "name"
        },
        {
            id: 3,
            name: "Message",
            cell: (row) => row.message.length > 80 ? row.message.substr(0, 80) + '...' : row.message,
            selector: (row) => row.message,
            grow: 3,
            wrap: true,
            sortable: true,
            ref: "message"
        },
        {
            id: 4,
            name: "Status",
            cell: (row) =>
                row.status === 'sent' ? row.network_report && row.network_report.description === 'AbsentSubscriber' ? <Badge color="gray">AbsentSubscriber</Badge> : row.network_report && row.network_report.description === 'DeliveredToTerminal' ? <Badge color="success">Success</Badge> : row.network_report && row.network_report.description === 'SenderName Blacklisted' ? <Badge color="danger">Blacklisted</Badge> : row.network_report && row.network_report.description === 'DeliveryImpossible' ? <Badge color="danger">Failed</Badge> : <Badge color="primary">Sent</Badge> : row.status === 'failed' ? <Badge color="danger">Failed</Badge> : <Badge color="dark">Unkwown</Badge>
            ,
            selector: (row) => row.status,
            wrap: true,
            sortable: true,
            ref: "status",
        },
        {
            id: 5,
            name: "Sent On",
            cell: (row) => <>{dateFormat(row.created_at, "mmm d yyyy")} <br /> {dateFormat(row.created_at, "HH:MM")}</>,
            selector: (row) => row.created_at,
            wrap: true,
            sortable: true,
            ref: "created_at",
        },
        {
            id: 6,
            name: "TAT",
            cell: (row) => row.network_report?.timeTaken ?? '',
            selector: (row) => row.network_report,
            wrap: true,
            sortable: false,
            ref: "network_report",
        },
        {
            name: "Actions",
            cell: (row) => (
                <ul className="nk-tb-actions gx-1">
                    <li>
                        <div
                            id={"resend" + row.id}
                            className="button-link"
                            onClick={() => resendSms(row.id)}
                        >
                            <TooltipComponent
                                id={"resend" + row.id}
                                direction="top"
                                text="Resend sms"
                            >
                                <ArrowRepeatAll20Regular />
                            </TooltipComponent>
                        </div>
                    </li>
                    <li>
                        <Link to={`${process.env.PUBLIC_URL}/admin/sms/outbox/${row.id}`}>
                            <Open20Regular />
                        </Link>
                    </li>
                    <li>
                        <div
                            className="button-link"
                            onClick={() => confirmDelete(row.id, row.id)}
                        >
                            <Delete20Regular />
                        </div>
                    </li>
                </ul>
            ),
            ignoreRowClick: true,
            allowOverflow: true,
        },
    ];

    const handlePageChange = page => {
        setPage(page);
        setToggleCleared(!toggleCleared);
    };
    const handlePerRowsChange = (e, perPageO) => {

        let newPage = 1;
        if (parseInt(perPageO) > parseInt(e.target.value) && page !== 1) {
            newPage = (Math.ceil((parseInt(perPageO) / parseInt(e.target.value))) * (page - 1)) + 1;
        } else if (page !== 1) {
            newPage = Math.ceil((parseInt(perPageO) / parseInt(e.target.value)) * page);
        }
        setPerPage(e.target.value);
        setPage(newPage);
        setToggleCleared(!toggleCleared);
    };
    const handleSort = async (column, sortDirection) => {
        //setSort(column.name);
        //setOrder(sortDirection);
        setSort(sortDirection);
        setSortCol(column.ref);
    };
    useEffect(() => {
        const fetchMessages = async () => {
            setLoading(true);
            const response = await http.get(`${process.env.REACT_APP_API_URL}/list-messages?q=${searchText}&page=${page}&per_page=${perPage}&sort_col=${sortCol}&sort=${sort}`);
            setData(response.data.data);
            setTotalRows(response.data.total);
            setLoading(false);
        };

        fetchMessages();

    }, [page, perPage, sortCol, sort, searchText, reload]);

    // function to change the design view under 1200 px
    const viewChange = () => {
        if (window.innerWidth < 960 && expandableRows) {
            setMobileView(true);
        } else {
            setMobileView(false);
        }
    };

    const confirmDelete = (id, title) => {
        Swal.fire({
            title: "Delete Message",
            text: `Are you sure you want to delete "${title}"?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
        }).then((result) => {
            if (result.isConfirmed) {
                http
                    .delete(`/messages/${id}`)
                    .then(response => {
                        if (response.data?.message) {
                            Swal.fire("Deleted!", response.data?.message, "success");
                            if (page === 1) {
                                setReload(!reload);
                            } else {
                                setPage(1);
                            }
                        }
                    })
                    .catch(err => {
                        Swal.fire("Error!", err.message, "warning");
                    })

            }
        });
    };

    const resendSms = (id) => {
        http.post(`/resend-sms/${id}`).then(response => {
            if ((response.data?.message && response.data?.error)) {
                execToast("top-right", response.data?.message);
            }
            else {
                successToast("top-right", response.data?.message);
                if (page === 1) {
                    setReload(!reload);
                } else {
                    setPage(1);
                }
            }
        })
            .catch(err => {
                execToast("top-right", err.message);
            })
    }

    useEffect(() => {
        window.addEventListener("load", viewChange);
        window.addEventListener("resize", viewChange);
        return () => {
            window.removeEventListener("resize", viewChange);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            <Head title="Sent messages" />
            <Content>
                <BlockHead size="lg" wide="sm">
                    <BlockHeadContent>
                        <BlockTitle tag="h2" className="fw-normal">
                            Sent Messages
                        </BlockTitle>
                    </BlockHeadContent>
                </BlockHead>

                <Block size="lg">
                    <PreviewCard>
                        <div className="dataTables_wrapper dt-bootstrap4 no-footer">
                            <Row className="justify-between g-2 with-export">
                                <Col className="col-7 text-start" sm="4">
                                    <div id="DataTables_Table_0_filter" className="dataTables_filter">
                                        <label>
                                            <input
                                                type="search"
                                                className="form-control form-control-sm"
                                                placeholder="Search by name, status"
                                                onChange={(ev) => {
                                                    setSearchText(ev.target.value);
                                                    setPage(1);
                                                }
                                                }
                                            />
                                        </label>
                                    </div>
                                </Col>
                                <Col className="col-5 text-end" sm="8">
                                    <div className="datatable-filter">
                                        <div className="d-flex justify-content-end g-2">
                                            <Export data={data} />
                                            <div className="dataTables_length" id="DataTables_Table_0_length">
                                                <label>
                                                    <span className="d-none d-sm-inline-block">Show</span>
                                                    <div className="form-control-select">
                                                        {" "}
                                                        <select
                                                            name="DataTables_Table_0_length"
                                                            className="custom-select custom-select-sm form-control form-control-sm"
                                                            onChange={(e) => handlePerRowsChange(e, perPage)}
                                                            value={perPage}
                                                        >
                                                            <option value="10">10</option>
                                                            <option value="25">25</option>
                                                            <option value="40">40</option>
                                                            <option value="50">50</option>
                                                        </select>{" "}
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                            <DataTable
                                data={data}
                                columns={columns}
                                defaultSortFieldId={1}
                                defaultSortDesc={true}
                                sortServer
                                onSort={handleSort}
                                progressPending={loading}
                                //selectableRows={true}
                                //selectableRowsComponent={CustomCheckbox}
                                //clearSelectedRows={toggleCleared}
                                expandableRowsComponent={ExpandableRowComponent}
                                expandableRows={mobileView}
                                noDataComponent={<div className="p-2">There are no records found</div>}
                                sortIcon={
                                    <div>
                                        <span>&darr;</span>
                                        <span>&uarr;</span>
                                    </div>
                                }
                                pagination={true}
                                paginationServer
                                paginationComponent={({ currentPage, rowsPerPage, rowCount, onChangePage, onChangeRowsPerPage }) => (
                                    <DataTablePagination
                                        customItemPerPage={perPage}
                                        itemPerPage={perPage}
                                        totalItems={totalRows}
                                        paginate={handlePageChange}
                                        currentPage={page}
                                        onChangeRowsPerPage={handlePerRowsChange}
                                        setRowsPerPage={setPerPage}
                                    />
                                )}
                            ></DataTable>
                        </div>
                    </PreviewCard>
                </Block>
            </Content>
        </>
    );

};

export default Outbox;