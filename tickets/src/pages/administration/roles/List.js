import React, { useState, useEffect, useMemo } from "react";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import DataTable from "react-data-table-component";
import { Col, Modal, ModalBody, Row, Spinner } from "reactstrap";
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
} from "../../../components/Component";
import exportFromJSON from "export-from-json";
import CopyToClipboard from "react-copy-to-clipboard";
import RolesAPI from "../../../helpers/RolesAPI";
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

/*const ExpandableRowComponent = ({ data }) => {
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
};*/

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
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [sort, setSort] = useState('asc');
    const [sortCol, setSortCol] = useState('name');
    const [searchText, setSearchText] = useState("");
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [totalRows, setTotalRows] = useState(0);

    // Load roles from API
    const loadRoles = async () => {
        try {
            setLoading(true);
            const response = await RolesAPI.getAll({
                page,
                per_page: perPage,
                search: searchText
            });
            
            if (response.success && response.data) {
                setData(response.data);
                setTotalRows(response.pagination?.total || 0);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error loading roles:', error);
            toast.error(error.response?.data?.error || "Failed to load roles");
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRoles();
    }, [page, perPage, searchText]);
    const columns = [
        {
            id: 1,
            name: "ID",
            selector: (row) => row.id,
            wrap: true,
            sortable: true,
            ref: "id",
            width: "80px"
        },
        {
            id: 2,
            name: "Name",
            selector: (row) => row.name,
            wrap: true,
            sortable: true,
            ref: "name"
        },
        {
            id: 3,
            name: "Display Name",
            selector: (row) => row.display_name,
            wrap: true,
            sortable: true,
            ref: "display_name"
        },
        {
            id: 4,
            name: "Description",
            selector: (row) => row.description || '-',
            wrap: true,
            sortable: false,
            ref: "description"
        },
    ];

    const handlePageChange = page => {
        setPage(page);
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
    };
    const handleSort = async (column, sortDirection) => {
        setSort(sortDirection);
        setSortCol(column.ref);
    };
    useEffect(() => {
        // Reset to first page when search text changes
        setPage(1);
    }, [searchText]);

    // function to change the design view under 1200 px
    /*const viewChange = () => {
        if (window.innerWidth < 960 && expandableRows) {
            setMobileView(true);
        } else {
            setMobileView(false);
        }
    };

    const confirmDelete = (id, title) => {
        Swal.fire({
            title: "Delete Customer",
            text: `Are you sure you want to delete "${title}"?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
        }).then((result) => {
            if (result.isConfirmed) {
                http
                    .delete(`/customers/${id}`)
                    .then(response => {
                        if (response.data?.message) {
                            Swal.fire("Deleted!", response.data?.message, "success");
                            if(page === 1){
                                setReload(!reload);
                            }else{
                                setPage(1);
                            } 
                        }
                    })
                    .catch(err => {
                        Swal.fire("Error!", err.message, "warning");
                    })
                
            }
        });
    };*/

    /*useEffect(() => {
        window.addEventListener("load", viewChange);
        window.addEventListener("resize", viewChange);
        return () => {
            window.removeEventListener("resize", viewChange);
        };
    }, []);*/ // eslint-disable-line react-hooks/exhaustive-deps

    // No add/edit modals in static roles list

    /*const editRole = (id) => {
        if (parseInt(id) > 0) {
            setId(parseInt(id));
            toggleEdit();
        }
    }*/

    // No API calls for static roles

    return (
        <>
            <Head title="Roles" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BackTo link="/admin/administration" icon="arrow-left">
                                Administration
                            </BackTo>
                            <BlockTitle tag="h2" className="fw-normal">
                                Roles
                            </BlockTitle>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <div className="nk-block-tools-toggle"></div>
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
                                                placeholder="Table search"
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
                                onSort={handleSort}
                                progressPending={loading}
                                progressComponent={<Spinner color="primary" />}
                                //selectableRows={true}
                                //selectableRowsComponent={CustomCheckbox}
                                //clearSelectedRows={toggleCleared}
                                //expandableRowsComponent={ExpandableRowComponent}
                                //expandableRows={mobileView}
                                noDataComponent={<div className="p-2">There are no records found</div>}
                                sortIcon={
                                    <div>
                                        <span>&darr;</span>
                                        <span>&uarr;</span>
                                    </div>
                                }
                                pagination={true}
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
            {/* Removed add/edit modals for static roles list */}
        </>
    );
};

export default List;
