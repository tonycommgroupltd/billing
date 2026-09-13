import React, { useState, useEffect } from "react";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import DataTable from "react-data-table-component";
import { Col, Modal, ModalBody, Row, Badge } from "reactstrap";
import {
    Block,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
    BackTo,
    PreviewCard,
    Button,
    DataTablePagination,
    TooltipComponent,
} from "../../../components/Component";
import { http } from '../../../helpers';
import exportFromJSON from "export-from-json";
import CopyToClipboard from "react-copy-to-clipboard";
import Swal from "sweetalert2";
import { Link } from "react-router-dom";

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

/*const CustomCheckbox = React.forwardRef(({ onClick, ...rest }, ref) => (
    <div className="custom-control custom-control-sm custom-checkbox notext">
        <input
            id={rest.name}
            type="checkbox"
            className="custom-control-input"
            ref={ref}
            onClick={onClick}
            {...rest}
        />
        <label className="custom-control-label" htmlFor={rest.name} />
    </div>
));*/

const List = ({ ...props }) => {
    let expandableRows = true;
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(10);
    const [sort, setSort] = useState('asc');
    const [sortCol, setSortCol] = useState('id');
    const [searchText, setSearchText] = useState("");
    const [mobileView, setMobileView] = useState();
    const [toggleCleared, setToggleCleared] = useState(false);
    const [reload, setReload] = useState(false);
    const columns = [
        {
            id: 1,
            name: "ID",
            cell: (row) => (
                <Link to={`${process.env.PUBLIC_URL}/admin/networking/routers/view/${row.id}`}>{row.id}</Link>
            ),
            selector: (row) => row.id,
            width: "80px",
            wrap: true,
            sortable: true,
            ref: "id"
        },
        {
            id: 2,
            name: "Title",
            cell: (row) => (
                <Link to={`${process.env.PUBLIC_URL}/admin/networking/routers/view/${row.id}`}>{row.title}</Link>
            ),
            selector: (row) => row.title,
            wrap: true,
            sortable: true,
            ref: "title"
        },
        {
            id: 3,
            name: "NAS type",
            selector: (row) => (row.nas_type && row.nas_type.hasOwnProperty('label')) ? row.nas_type.label : row.nas_type,
            wrap: true,
            sortable: true,
            ref: "nas_type->label",
            hide: "sm"
        },
        {
            id: 4,
            name: "Vendor/Model",
            selector: (row) => row.model,
            wrap: true,
            sortable: true,
            ref: "model",
            hide: "sm"
        },
        {
            id: 5,
            name: "IP/Host",
            selector: (row) => row.host,
            wrap: true,
            sortable: true,
            ref: "host",
            hide: "sm"
        },
        {
            id: 6,
            name: "Physical address",
            selector: (row) => row.physical_address,
            wrap: true,
            sortable: true,
            ref: "physical_address",
            hide: "sm"
        },
        {
            id: 7,
            name: "Status",
            cell: (row) => (
                row.api === 1 ? <Badge color="success">API OK</Badge> : <Badge color="dark">API Disabled</Badge>
            ),
            selector: (row) => row.status,
            wrap: true,
            sortable: true,
            ref: "status",
            hide: "sm"
        },
        {
            name: "Actions",
            cell: (row) => (
                <ul className="nk-tb-actions gx-1">
                    <li>
                        <Link to={`${process.env.PUBLIC_URL}/admin/networking/routers/view/${row.id}`}>
                            <TooltipComponent
                                tag="span"
                                containerClassName="btn btn-trigger btn-icon"
                                id={"edit" + row.id}
                                icon="edit"
                                direction="top"
                                text="Edit"
                            />
                        </Link>
                    </li>
                    <li onClick={() => confirmDelete(row.id, row.title)}>
                        <TooltipComponent
                            tag="a"
                            containerClassName="btn btn-trigger btn-icon"
                            id={"delete" + row.id}
                            icon="trash-alt"
                            direction="top"
                            text="Delete"
                        />
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
        const fetchRouters = async () => {
            setLoading(true);
            const response = await http.get(`${process.env.REACT_APP_API_URL}/list-routers?q=${searchText}&page=${page}&per_page=${perPage}&sort_col=${sortCol}&sort=${sort}`);
            setData(response.data.data);
            setTotalRows(response.data.total);
            setLoading(false);
        };

        fetchRouters();

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
            title: "Delete Router",
            text: `Are you sure you want to delete "${title}"?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
        }).then((result) => {
            if (result.isConfirmed) {
                http
                    .delete(`/routers/${id}`)
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

    useEffect(() => {
        window.addEventListener("load", viewChange);
        window.addEventListener("resize", viewChange);
        return () => {
            window.removeEventListener("resize", viewChange);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            <Head title="Router list" />
            <Content>
                <BlockHead size="lg" wide="sm">
                    <BlockHeadContent>
                        <BackTo link="/admin/networking/routers/list" icon="arrow-left">
                            Routers
                        </BackTo>
                        <BlockTitle tag="h2" className="fw-normal">
                            List
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
                                                placeholder="Search by title"
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
                                defaultSortAsc={true}
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

export default List;
