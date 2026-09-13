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
import exportFromJSON from "export-from-json";
import CopyToClipboard from "react-copy-to-clipboard";
import Swal from "sweetalert2";
import { Edit20Regular, Delete20Regular } from '@fluentui/react-icons';
// Dynamic roles loaded from API
import { FocusError } from 'focus-formik-error';
import { toast } from "react-toastify";
import classnames from "classnames";
import * as Yup from 'yup';
import { useFormik } from 'formik';
import { connect } from 'react-redux';
import UsersAPI from '../../../helpers/UsersAPI';
import RolesAPI from '../../../helpers/RolesAPI';

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

const List = ({ user }) => {
    const [id, setId] = useState(0);
    const [data, setData] = useState([]);
    const [formData, setFormData] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(10);
    const [sort, setSort] = useState('asc');
    const [sortCol, setSortCol] = useState('id');
    const [searchText, setSearchText] = useState("");
    const [toggleCleared, setToggleCleared] = useState(false);
    const [reload, setReload] = useState(false);
    const [sm, updateSm] = useState(false);
    const [modal, setModal] = useState(false);
    const [editModal, setEditModal] = useState(false);
    const [passwordModal, setPasswordModal] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [apiLoading, setApiLoading] = useState(false);
    const [selectedRoleId, setSelectedRoleId] = useState(null);

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

    // Load users from API
    const loadUsers = async () => {
        try {
            setLoading(true);
            const response = await UsersAPI.getAll({
                page,
                per_page: perPage,
                search: searchText,
                role_id: selectedRoleId
            });
            
            if (response.success && response.data) {
                const formattedData = response.data.map(user => ({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    avatar: user.avatar,
                    lastLogin: user.lastLogin,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                    roles: user.roles || [],
                    roleDisplay: user.roles && user.roles.length > 0 ? user.roles[0].displayName : 'No Role',
                    roleName: user.roles && user.roles.length > 0 ? user.roles[0].name : ''
                }));
                setData(formattedData);
                setTotalRows(response.pagination.total);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error loading users:', error);
            execToast("top-right", error.response?.data?.error || "Failed to load users");
            setLoading(false);
        }
    };

    // Load roles for dropdown
    const loadRoles = async () => {
        try {
            // Use the options endpoint specifically designed for dropdowns
            const { http } = await import('../../../helpers');
            const response = await http.get('roles-management.php/options');
            
            if (response.data.success && response.data.data) {
                const roleOptions = [
                    { value: '', label: 'Select Role' },
                    ...response.data.data.map(role => ({
                        value: role.value, // Use role ID as value
                        label: role.label  // Use display name as label
                    }))
                ];
                setRoles(roleOptions);
                console.log('Roles loaded successfully:', roleOptions);
            } else {
                console.error('Failed to load roles:', response.data);
                setRoles([{ value: '', label: 'No roles available' }]);
            }
        } catch (error) {
            console.error('Error loading roles:', error);
            // Fallback to showing an error message in the dropdown
            setRoles([{ value: '', label: 'Error loading roles' }]);
        }
    };

    const columns = [
        {
            id: 1,
            name: "ID",
            selector: (row) => row.id,
            wrap: true,
            sortable: true,
            ref: "id"
        },
        {
            id: 2,
            name: "Full name",
            selector: (row) => row.name,
            wrap: true,
            sortable: true,
            ref: "name"
        },
        {
            id: 3,
            name: "Email",
            selector: (row) => row.email,
            wrap: true,
            sortable: false,
            ref: "email"
        },
        {
            id: 4,
            name: "Phone",
            selector: (row) => row.phone || 'Not set',
            wrap: true,
            sortable: false,
            ref: "phone"
        },
        {
            id: 5,
            name: "Role",
            selector: (row) => row.roleDisplay,
            wrap: true,
            sortable: false,
            ref: "roleDisplay"
        },
        {
            id: 6,
            name: "Created",
            selector: (row) => new Date(row.createdAt).toLocaleDateString(),
            wrap: true,
            sortable: false,
            ref: "createdAt"
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
                    <li onClick={() => confirmDelete(row.id, row.name)}>
                        <div className="button-link">
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
        setSort(sortDirection);
        setSortCol(column.ref);
    };

    // Load roles on mount
    useEffect(() => {
        loadRoles();
    }, []);

    // Load users when filters change
    useEffect(() => {
        loadUsers();
    }, [page, perPage, searchText, selectedRoleId, reload]);

    // function to change the design view under 1200 px
    /*const viewChange = () => {
        if (window.innerWidth < 960 && expandableRows) {
            setMobileView(true);
        } else {
            setMobileView(false);
        }
    };
    const confirmDelete = (id, title) => {
        if (user.id === id) {
            Swal.fire("Error!", "You cannot delete yourself", "error");
        } else {
            Swal.fire({
                title: "Delete Administrator",
                text: `Are you sure you want to delete "${title}"?`,
                icon: "warning",
                showCancelButton: true,
                confirmButtonText: "Delete",
            }).then((result) => {
                if (result.isConfirmed) {
                    UsersAPI
                        .delete(id)
                        .then(response => {
                            if (response.success || response.message) {
                                Swal.fire("Deleted!", response.message || "Administrator deleted successfully", "success");
                                if (page === 1) {
                                    loadUsers();
                                } else {
                                    setPage(1);
                                }
                            }
                        })
                        .catch(err => {
                            Swal.fire("Error!", err.response?.data?.error || err.message, "warning");
                        })
                }
            });
        }
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
            email: '',
            phone: '',
            password: '',
            passwordRetype: '',
            role: { value: '', label: 'Select Role' },
        },
        validationSchema: Yup.object({
            name: Yup.string('Name')
                .required('Name is required'),
            email: Yup.string('Enter your email')
                .email('Enter a valid email')
                .required('Email is required'),
            phone: Yup.string('Enter phone number')
                .matches(/^[\d\s\-\+\(\)]*$/, 'Phone number can only contain digits, spaces, hyphens, plus signs, and parentheses'),
        }).shape({
            role: Yup.object().shape({
                value: Yup.string().required('Role is required')
            }),
        }),
        onSubmit: (data, { resetForm }) => {
            setFormLoading(true);
            UsersAPI
                .create({
                    name: data.name,
                    email: data.email,
                    phone: data.phone,
                    password: data.password,
                    role_id: data.role.value
                })
                .then(response => {
                    setFormLoading(false);
                    if (response.success || response.message) {
                        successToast("top-right", response.message || "Administrator created successfully");
                        resetForm();
                        toggle();
                        if (page === 1) {
                            loadUsers();
                        } else {
                            setPage(1);
                        }
                    }
                })
        }
    });

    const formikEdit = useFormik({
        initialValues: {
            id: formData?.id ?? 0,
            name: formData?.name ?? '',
            email: formData?.email ?? '',
            phone: formData?.phone ?? '',
            role: { value: formData?.role_id ?? '', label: formData?.role_display_name ?? "Select Role" },
        },
        enableReinitialize: true,
        validationSchema: Yup.object({
            name: Yup.string('Name')
                .required('Name is required'),
            email: Yup.string('Enter your email')
                .email('Enter a valid email')
                .required('Email is required'),
            phone: Yup.string('Enter phone number')
                .matches(/^[\d\s\-\+\(\)]*$/, 'Phone number can only contain digits, spaces, hyphens, plus signs, and parentheses'),
        }).shape({
            role: Yup.object().shape({
                value: Yup.string().required('Role is required')
            }),
        }),
        onSubmit: (data, { resetForm }) => {
            setFormLoading(true);
            UsersAPI
                .update(data.id, {
                    name: data.name,
                    email: data.email,
                    phone: data.phone,
                    role_id: data.role.value
                })
                .then(response => {
                    setFormLoading(false);
                    if (response.success || response.message) {
                        successToast("top-right", response.message || "Administrator updated successfully");
                        resetForm();
                        toggleEdit();
                        if (page === 1) {
                            loadUsers();
                        } else {
                            setPage(1);
                        }
                    }
                })
                .catch(err => {
                    setFormLoading(false);
                    execToast("top-right", err.response?.data?.error || 'Something went wrong');
                })
        }
    });

    useEffect(() => {
        const fetchAdministrator = async (id) => {
            setApiLoading(true);
            try {
                if (id !== undefined && id !== null && id !== "") {
                    const response = await UsersAPI.getById(id);
                    if (response.success && response.data) {
                        setFormData({
                            id: response.data.id,
                            name: response.data.name,
                            email: response.data.email,
                            phone: response.data.phone,
                            role_id: response.data.roles && response.data.roles.length > 0 ? response.data.roles[0].id : '',
                            role_display_name: response.data.roles && response.data.roles.length > 0 ? response.data.roles[0].displayName : "Select Role"
                        });
                    }
                }
                setApiLoading(false);
            } catch (error) {
                console.error('Error fetching administrator:', error);
                setApiLoading(false);
            }
        };

        if (id > 0) { fetchAdministrator(id) };
    }, [id]);

    const confirmDelete = (id, title) => {
        if (user.id === id) {
            Swal.fire("Error!", "You cannot delete yourself", "error");
        } else {
            Swal.fire({
                title: "Delete Administrator",
                text: `Are you sure you want to delete "${title}"?`,
                icon: "warning",
                showCancelButton: true,
                confirmButtonText: "Delete",
            }).then((result) => {
                if (result.isConfirmed) {
                    UsersAPI
                        .delete(id)
                        .then(response => {
                            if (response.success || response.message) {
                                Swal.fire("Deleted!", response.message || "Administrator deleted successfully", "success");
                                if (page === 1) {
                                    loadUsers();
                                } else {
                                    setPage(1);
                                }
                            }
                        })
                        .catch(err => {
                            Swal.fire("Error!", err.response?.data?.error || err.message, "warning");
                        })
                }
            });
        }
    };

    return (
        <>
            <Head title="Administrators" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BackTo link="/admin/administration" icon="arrow-left">
                                Administration
                            </BackTo>
                            <BlockTitle tag="h2" className="fw-normal">
                                Administrators
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
                                                Add Admin
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
                                <Col className="col-4 text-start" sm="4">
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
                                <Col className="col-3 text-center" sm="3">
                                    <div className="datatable-filter">
                                        <label>
                                            <span className="d-none d-sm-inline-block">Filter by Role</span>
                                            <div className="form-control-select">
                                                <select
                                                    className="custom-select custom-select-sm form-control form-control-sm"
                                                    value={selectedRoleId || ''}
                                                    onChange={(e) => {
                                                        setSelectedRoleId(e.target.value || null);
                                                        setPage(1);
                                                    }}
                                                >
                                                    <option value="">All Roles</option>
                                                    {roles.filter(role => role.value !== '').map(role => (
                                                        <option key={role.value} value={role.value}>{role.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </label>
                                    </div>
                                </Col>
                                <Col className="col-5 text-end" sm="5">
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
                <ModalHeader toggle={toggle}>Create administrator</ModalHeader>
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
                                    <label className="form-label" htmlFor="email">
                                        Email
                                        <span className="text-secondary">&nbsp;(required)</span>
                                    </label>
                                </div>
                            </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <input
                                            type="email"
                                            id="email"
                                            className={classnames(
                                                'form-control',
                                                {
                                                    'is-invalid': formik.touched.email && formik.errors.email
                                                }
                                            )}
                                            name="email"
                                            value={formik.values.email}
                                            onChange={formik.handleChange}
                                        />
                                        {formik.touched.email && formik.errors.email ? (<p className="invalid">{formik.errors.email}</p>) : null}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row className="align-center">
                            <Col md="4" className="col-form-label">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="phone">
                                        Phone Number
                                    </label>
                                </div>
                            </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <input
                                            type="tel"
                                            id="phone"
                                            className={classnames(
                                                'form-control',
                                                {
                                                    'is-invalid': formik.touched.phone && formik.errors.phone
                                                }
                                            )}
                                            name="phone"
                                            value={formik.values.phone}
                                            onChange={formik.handleChange}
                                            placeholder="Enter phone number"
                                        />
                                        {formik.touched.phone && formik.errors.phone ? (<p className="invalid">{formik.errors.phone}</p>) : null}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row className="align-center">
                            <Col md="4" className="col-form-label">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="password">
                                        Password
                                        <span className="text-secondary">&nbsp;(required)</span>
                                    </label>
                                </div>
                            </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <input
                                            type="password"
                                            id="password"
                                            className={classnames(
                                                'form-control',
                                                {
                                                    'is-invalid': formik.touched.password && formik.errors.password
                                                }
                                            )}
                                            name="password"
                                            value={formik.values.password}
                                            onChange={formik.handleChange}
                                        />
                                        {formik.touched.password && formik.errors.password ? (<p className="invalid">{formik.errors.password}</p>) : null}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row className="align-center">
                            <Col md="4" className="col-form-label">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="passwordRetype">
                                        Retype Password
                                        <span className="text-secondary">&nbsp;(required)</span>
                                    </label>
                                </div>
                            </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <input
                                            type="password"
                                            id="passwordRetype"
                                            className={classnames(
                                                'form-control',
                                                {
                                                    'is-invalid': formik.touched.passwordRetype && formik.errors.passwordRetype
                                                }
                                            )}
                                            name="passwordRetype"
                                            value={formik.values.passwordRetype}
                                            onChange={formik.handleChange}
                                        />
                                        {formik.touched.passwordRetype && formik.errors.passwordRetype ? (<p className="invalid">{formik.errors.passwordRetype}</p>) : null}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row className="align-center">
                            <Col md="4" className="col-form-label">
                                <div className="form-group">
                                    <label className="form-label">
                                        Role
                                    </label>
                                </div>
                            </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <RSelect name="role" options={roles} value={formik.values.role}
                                            onChange={(option) => formik.setFieldValue("role", option)} />
                                        {formik.touched.role && formik.errors.role ? (<p className="invalid">{formik.errors.role.value}</p>) : null}
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
                <ModalHeader toggle={toggleEdit}>Edit administrator</ModalHeader>
                <ModalBody>
                    {apiLoading ? <p>Loading...</p> :
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
                                                        'is-invalid': formikEdit.touched.name && formikEdit.errors.name
                                                    }
                                                )}
                                                name="name"
                                                value={formikEdit.values.name}
                                                onChange={formikEdit.handleChange}
                                            />
                                            {formikEdit.touched.name && formikEdit.errors.name ? (<p className="invalid">{formikEdit.errors.name}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="email">
                                            Email
                                            <span className="text-secondary">&nbsp;(required)</span>
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <input
                                                type="email"
                                                id="email"
                                                className={classnames(
                                                    'form-control',
                                                    {
                                                        'is-invalid': formikEdit.touched.email && formikEdit.errors.email
                                                    }
                                                )}
                                                name="email"
                                                value={formikEdit.values.email}
                                                onChange={formikEdit.handleChange}
                                            />
                                            {formikEdit.touched.email && formikEdit.errors.email ? (<p className="invalid">{formikEdit.errors.email}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="phone">
                                            Phone Number
                                        </label>
                                    </div>
                                </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <input
                                            type="tel"
                                            id="phone"
                                            className={classnames(
                                                'form-control',
                                                {
                                                    'is-invalid': formikEdit.touched.phone && formikEdit.errors.phone
                                                }
                                            )}
                                            name="phone"
                                            value={formikEdit.values.phone}
                                            onChange={formikEdit.handleChange}
                                            placeholder="Enter phone number"
                                        />
                                        {formikEdit.touched.phone && formikEdit.errors.phone ? (<p className="invalid">{formikEdit.errors.phone}</p>) : null}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row className="align-center">
                            <Col md="4" className="col-form-label">
                                <div className="form-group">
                                    <label className="form-label">
                                        Role
                                    </label>
                                </div>
                            </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <RSelect name="role" options={roles} value={formikEdit.values.role}
                                                onChange={(option) => formikEdit.setFieldValue("role", option)} />
                                            {formikEdit.touched.role && formikEdit.errors.role ? (<p className="invalid">{formikEdit.errors.role.value}</p>) : null}
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

const mapStateToProps = (state) => ({
    user: state.auth.currentUser
});

export default connect(mapStateToProps)(List);
