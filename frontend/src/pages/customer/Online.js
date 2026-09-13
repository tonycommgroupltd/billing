import React, { useState, useEffect } from "react";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import DataTable from "react-data-table-component";
import { Col, Modal, ModalBody, Row } from "reactstrap";
import {
    Block,
    BlockHead,
    BlockBetween,
    BlockHeadContent,
    BlockTitle,
    BackTo,
    PreviewCard,
    Button,
    DataTablePagination,
    Icon,
    //TooltipComponent,
} from "../../components/Component";
import { http } from '../../helpers';
import exportFromJSON from "export-from-json";
import CopyToClipboard from "react-copy-to-clipboard";
import Swal from "sweetalert2";
import { Link, useLocation } from 'react-router-dom';
import { Delete20Regular } from '@fluentui/react-icons';
import prettyBytes from 'pretty-bytes';

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

const Online = ({ ...props }) => {
    //let expandableRows = true;
    const { search } = useLocation();
    const searchParams = new URLSearchParams(search);
    const status = searchParams.get('status') || '';
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(100);
    const [sort, setSort] = useState('asc');
    const [sortCol, setSortCol] = useState('id');
    const [searchText, setSearchText] = useState("");
    //const [mobileView, setMobileView] = useState();
    const [toggleCleared, setToggleCleared] = useState(false);
    const [reload, setReload] = useState(false);
    const [sm, updateSm] = useState(false);
    const columns = [
        {
            id: 1,
            name: "ID",
            cell: (row) => (
                <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${row.id}`}>{row.id}</Link>
            ),
            selector: (row) => row.id,
            width: "80px",
            wrap: true,
            sortable: true,
            ref: "id"
        },
        {
            id: 2,
            name: "Name",
            cell: (row) => (
                <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${row.id}`}>{row.name}</Link>
            ),
            selector: (row) => row.name,
            wrap: true,
            sortable: true,
            ref: "name"
        },
        {
            id: 3,
            name: "Service login",
            selector: (row) => row.username,
            wrap: true,
            sortable: true,
            ref: "username",
        },
        {
            id: 4,
            name: "Download",
            selector: (row) => row.download,
            wrap: true,
            sortable: false,
        },
        {
            id: 5,
            name: "Upload",
            selector: (row) => row.upload,
            wrap: true,
            sortable: false,
        },
        {
            id: 6,
            name: "IP",
            selector: (row) => row.ip_address || '—',
            wrap: true,
            sortable: true,
            ref: "ip_address",
        },
        {
            id: 7,
            name: "MAC/IP",
            selector: (row) => row.mac_address,
            //wrap: true,
            sortable: true,
            ref: "mac_address",
        },
        {
            id: 8,
            name: "Time online",
            selector: (row) => formatDuration(row.time_diff),
            wrap: true,
            sortable: false,
        }
    ];

    const formatDuration = (seconds) => {
        if (!seconds) return "0:00:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

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
        let cancelled = false;

        const fetchCustomers = async () => {
            setLoading(true);
            try {
                const response = await http.get('/list-online-customers', {
                    params: {
                        q: searchText,
                        page,
                        per_page: perPage,
                        sort_col: sortCol,
                        sort,
                        status,
                    },
                });
                if (cancelled) return;
                const pageData = response.data?.data;
                setData(pageData?.data || []);
                setTotalRows(pageData?.total || response.data?.total || 0);
            } catch (_) {
                if (!cancelled) {
                    setData([]);
                    setTotalRows(0);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchCustomers();
        return () => {
            cancelled = true;
        };

    }, [page, perPage, sortCol, sort, searchText, status, reload]);

    return (
        <>
            <Head title="Customers online" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BackTo link="/admin/customers/online" icon="arrow-left">
                                Customers
                            </BackTo>
                            <BlockTitle tag="h2" className="fw-normal">
                                Online
                            </BlockTitle>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <div className="nk-block-tools-toggle">
                                <Button
                                    className={`btn-icon btn-trigger toggle-expand me-n1 ${sm ? "active" : ""}`}
                                    onClick={() => updateSm(!sm)}
                                >
                                    <Icon name="menu-alt-r"></Icon>
                                </Button>
                                <div className="toggle-expand-content" style={{ display: sm ? "block" : "none" }}>
                                    <ul className="nk-block-tools g-3">
                                        <li>
                                            <Link to="/admin/customers/add" className="btn btn-primary">
                                                <Icon name="users"></Icon>
                                                <span>Add Customer</span>
                                            </Link>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </BlockHeadContent>
                    </BlockBetween>
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
                                                placeholder="Search by name, phone"
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
                                                            <option value="100">100</option>
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
                                defaultSortAsc={true}
                                sortServer
                                onSort={handleSort}
                                progressPending={loading}
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

export default Online;
