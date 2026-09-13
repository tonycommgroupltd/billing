import React, { useState, useEffect } from "react";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import DataTable from "react-data-table-component";
import { Col, Modal, ModalHeader, ModalBody, ModalFooter, Row, Spinner } from "reactstrap";
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
    RSelect,
    //TooltipComponent,
} from "../../../components/Component";
import { http } from '../../../helpers';
import exportFromJSON from "export-from-json";
import CopyToClipboard from "react-copy-to-clipboard";
//import Swal from "sweetalert2";
import { Edit20Regular } from '@fluentui/react-icons';
import { rolesSchemeOptions } from "../../components/forms/SelectData";
import { FocusError } from 'focus-formik-error';
import { toast } from "react-toastify";
import classnames from "classnames";
import * as Yup from 'yup';
import { useFormik } from 'formik';

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
    //let expandableRows = true;
    const [id, setId] = useState(0);
    const [data, setData] = useState([]);
    const [formData, setFormData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(10);
    const [sort, setSort] = useState('asc');
    const [sortCol, setSortCol] = useState('name');
    const [searchText, setSearchText] = useState("");
    //const [mobileView, setMobileView] = useState();
    const [toggleCleared, setToggleCleared] = useState(false);
    const [reload, setReload] = useState(false);
    const [sm, updateSm] = useState(false);
    const [modal, setModal] = useState(false);
    const [editModal, setEditModal] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [apiLoading, setApiLoading] = useState(false);

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
            name: "Name",
            selector: (row) => row.name,
            wrap: true,
            sortable: true,
            ref: "name"
        },
        {
            id: 2,
            name: "Title",
            selector: (row) => row.display_name,
            wrap: true,
            sortable: true,
            ref: "display_name"
        },
        {
            name: "Actions",
            cell: (row) => (
                <ul className="nk-tb-actions gx-1">
                    <li>
                        <div 
                        className="button-link" 
                        onClick={() => {
                            setId(parseInt(row.id));
                            toggleEdit();
                          }}
                        >
                            <Edit20Regular />
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
        const fetchRoles = async () => {
            setLoading(true);
            const response = await http.get(`${process.env.REACT_APP_API_URL}/list-roles?q=${searchText}&page=${page}&per_page=${perPage}&sort_col=${sortCol}&sort=${sort}`);
            setData(response.data.data);
            setTotalRows(response.data.total);
            setLoading(false);
        };

        fetchRoles();

    }, [page, perPage, sortCol, sort, searchText, reload]);

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

    const toggle = () => {
        setModal(!modal);
    };

    const toggleEdit = () => {
        setEditModal(!editModal);
    };

    /*const editRole = (id) => {
        if (parseInt(id) > 0) {
            setId(parseInt(id));
            toggleEdit();
        }
    }*/

    const formik = useFormik({
        initialValues: {
            name: '',
            title: '',
            permission_scheme: { value: '', label: "None" },
        },
        validationSchema: Yup.object({
            name: Yup.string('Enter the name')
                .required('Name field is required')
                .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid characters in field name (allowed only a-z, 0-9 and dash)'),
            title: Yup.string('Enter the title')
                .required('Title field is required'),
        }),
        onSubmit: (data, { resetForm }) => {
            setFormLoading(true);
            http
                .post("/add-roles", {
                    name: data.name,
                    title: data.title,
                    permission_scheme: data.permission_scheme
                })
                .then(response => {
                    setFormLoading(false);
                    if (response.data?.message) {
                        successToast("top-right", response.data?.message);
                        resetForm();
                        toggle();
                        if (page === 1) {
                            setReload(!reload);
                        } else {
                            setPage(1);
                        }
                    }
                })
                .catch(err => {
                    setFormLoading(false);
                    if (err.response.status === 422) {
                        execToast("top-right", err.response.data[Object.keys(err.response.data)[0]][0]);
                    } else {
                        execToast("top-right", 'Something went wrong');
                    }
                })
        }
    });

    const formikEdit = useFormik({
        initialValues: {
            id: formData?.id ?? 0,
            name: formData?.name ?? '',
            title: formData?.display_name ?? '',
        },
        enableReinitialize: true,
        validationSchema: Yup.object({
            name: Yup.string('Enter the name')
                .required('Name field is required')
                .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid characters in field name (allowed only a-z, 0-9 and dash)'),
            title: Yup.string('Enter the title')
                .required('Title field is required'),
        }),
        onSubmit: (data, { resetForm }) => {
            setFormLoading(true);
            http
                .post(`/update-roles/${data.id}`, {
                    id: data.id,
                    name: data.name,
                    title: data.title,
                })
                .then(response => {
                    setFormLoading(false);
                    if (response.data?.message) {
                        successToast("top-right", response.data?.message);
                        resetForm();
                        toggleEdit();
                        setReload(!reload);
                    }
                })
                .catch(err => {
                    setFormLoading(false);
                    if (err.response.status === 422) {
                        execToast("top-right", err.response.data[Object.keys(err.response.data)[0]][0]);
                    } else {
                        execToast("top-right", 'Something went wrong');
                    }
                })
        }
    });

    useEffect(() => {
        const fetchRole = async (id) => {
            setApiLoading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/view-roles/${id}`);

                    if (response.data?.role) {
                        setFormData(response.data?.role);
                    }
                }
                setApiLoading(false);
            } catch (error) {
                setApiLoading(false);
            }
        };

        if (id > 0) { fetchRole(id) };
    }, [id]);

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
                                            <Button
                                                color="btn btn-primary"
                                                onClick={() => {
                                                    toggle();
                                                }}
                                            >
                                                Add Role
                                            </Button>
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
                                sortServer
                                onSort={handleSort}
                                progressPending={loading}
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
            <Modal isOpen={modal} toggle={toggle} className="modal-md">
                <ModalHeader toggle={toggle}>Create roles</ModalHeader>
                <ModalBody>
                    <form className="gy-3 is-alter custom-form" onSubmit={formik.handleSubmit}>
                        <FocusError formik={formik} />
                        <Row className="align-center">
                            <Col md="4" className="col-form-label">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="name">
                                        Name
                                        <span className="text-secondary">&nbsp;(required)</span>
                                    </label>
                                </div>
                            </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <input
                                            type="text"
                                            id="name"
                                            className={classnames(
                                                'form-control',
                                                {
                                                    'is-invalid': formik.touched.name && formik.errors.name
                                                }
                                            )}
                                            name="name"
                                            value={formik.values.name}
                                            onChange={formik.handleChange}
                                        />
                                        {formik.touched.name && formik.errors.name ? (<p className="invalid">{formik.errors.name}</p>) : null}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row className="align-center">
                            <Col md="4" className="col-form-label">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="title">
                                        Title
                                        <span className="text-secondary">&nbsp;(required)</span>
                                    </label>
                                </div>
                            </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <input
                                            type="text"
                                            id="title"
                                            className={classnames(
                                                'form-control',
                                                {
                                                    'is-invalid': formik.touched.title && formik.errors.title
                                                }
                                            )}
                                            name="title"
                                            value={formik.values.title}
                                            onChange={formik.handleChange}
                                        />
                                        {formik.touched.title && formik.errors.title ? (<p className="invalid">{formik.errors.title}</p>) : null}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row className="align-center">
                            <Col md="4" className="col-form-label">
                                <div className="form-group">
                                    <label className="form-label">
                                        Permissions scheme
                                    </label>
                                </div>
                            </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <RSelect name="permission_scheme" options={rolesSchemeOptions} value={formik.values.permission_scheme}
                                            onChange={(option) => formik.setFieldValue("permission_scheme", option)} />
                                        {formik.touched.permission_scheme && formik.errors.permission_scheme ? (<p className="invalid">{formik.errors.permission_scheme}</p>) : null}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row>
                            <Col md="12">
                                <div className="form-group mt-2">
                                    <Button type="submit" color="primary" className="pull-right">
                                        {formLoading ? <Spinner size="sm" color="light" /> : "Add"}
                                    </Button>
                                </div>
                            </Col>
                        </Row>
                    </form>
                </ModalBody>
                <ModalFooter>
                    <Button
                        className="p-0 m-0"
                        onClick={() => {
                            toggle();
                        }}
                    >
                        Close
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal isOpen={editModal} toggle={toggleEdit} className="modal-md">
                <ModalHeader toggle={toggleEdit}>Edit roles</ModalHeader>
                <ModalBody>
                    {apiLoading ? <p>Loading</p> :
                        <form className="gy-3 is-alter custom-form" onSubmit={formikEdit.handleSubmit}>
                            <input
                                type="hidden"
                                id="id"
                                readOnly
                                value={formikEdit.values.id}
                            />
                            <FocusError formik={formikEdit} />
                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="name">
                                            Name
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <input
                                                type="text"
                                                id="name"
                                                className={classnames(
                                                    'form-control',
                                                    {
                                                        'is-invalid': formikEdit.touched.name && formikEdit.errors.name
                                                    }
                                                )}
                                                name="name"
                                                value={formikEdit.values.name}
                                                onChange={formikEdit.handleChange}
                                                readOnly
                                            />
                                            {formikEdit.touched.name && formikEdit.errors.name ? (<p className="invalid">{formikEdit.errors.name}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="title">
                                            Title
                                            <span className="text-secondary">&nbsp;(required)</span>
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <input
                                                type="text"
                                                id="title"
                                                className={classnames(
                                                    'form-control',
                                                    {
                                                        'is-invalid': formikEdit.touched.title && formikEdit.errors.title
                                                    }
                                                )}
                                                name="title"
                                                value={formikEdit.values.title}
                                                onChange={formikEdit.handleChange}
                                            />
                                            {formikEdit.touched.title && formikEdit.errors.title ? (<p className="invalid">{formikEdit.errors.title}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                            <Row>
                                <Col md="12">
                                    <div className="form-group mt-2">
                                        <Button type="submit" color="primary" className="pull-right">
                                            {formLoading ? <Spinner size="sm" color="light" /> : "Save"}
                                        </Button>
                                    </div>
                                </Col>
                            </Row>
                        </form>
                    }
                </ModalBody>
                <ModalFooter>
                    <Button
                        className="p-0 m-0"
                        onClick={() => {
                            toggleEdit();
                        }}
                    >
                        Close
                    </Button>
                </ModalFooter>
            </Modal>
        </>
    );
};

export default List;
