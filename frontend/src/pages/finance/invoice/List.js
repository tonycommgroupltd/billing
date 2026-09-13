import React, { useState, useEffect, forwardRef } from "react";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import DataTable from "react-data-table-component";
import { Col, Modal, ModalHeader, ModalBody, ModalFooter, Row, Badge, Spinner } from "reactstrap";
import {
    Block,
    BlockBetween,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
    PreviewCard,
    Button,
    DataTablePagination,
    Icon,
    TooltipComponent,
    RSelect,
} from "../../../components/Component";
import { http } from '../../../helpers';
import exportFromJSON from "export-from-json";
import CopyToClipboard from "react-copy-to-clipboard";
import Swal from "sweetalert2";
import dateFormat from 'dateformat';
import DateRangePicker from 'react-bootstrap-daterangepicker';
import moment from 'moment';
import 'bootstrap-daterangepicker/daterangepicker.css';
import { Link, useLocation } from 'react-router-dom';
import { toast } from "react-toastify";
import classnames from "classnames";
import { paymentOptions, invoiceStatusOptions } from "../../components/forms/SelectData";
import * as Yup from 'yup';
import { useFormik } from 'formik';
import { FocusError } from 'focus-formik-error';
import DatePicker from "react-datepicker";
import { Checkmark24Regular } from '@fluentui/react-icons';

const invoiceStatusValue = (row) => {
    const st = typeof row?.status === 'string' ? JSON.parse(row.status) : row?.status;
    return Number(st?.value ?? 0);
};

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const ExampleCustomInput = forwardRef(({ value, onClick, onChange }, ref) => (
    <div onClick={onClick} ref={ref}>
        <div className="form-icon form-icon-left">
            <Icon name="calendar"></Icon>
        </div>
        <input className="form-control date-picker" type="text" value={value} onChange={onChange} />
    </div>
));

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

const CustomCheckbox = React.forwardRef(({ onClick, ...rest }, ref) => (
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
));

const List = ({ ...props }) => {
    let expandableRows = true;
    const { search } = useLocation();
    const searchParams = new URLSearchParams(search);
    const status = searchParams.get('status') || '';
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
    const [smOption, setSmOption] = useState(false);
    const [startDate, setStartDate] = useState(dateFormat(moment().startOf('month').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
    const [endDate, setEndDate] = useState(dateFormat(moment().endOf('month').toDate(), 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
    const [payModal, setPayModal] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [apiLoading, setApiLoading] = useState(false);
    const [invoiceId, setInvoiceId] = useState(0);
    const [formData, setFormData] = useState([]);
    const [invoiceStatus, setInvoiceStatus] = useState(status);

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

    const onChangeStatus = (e) => {
        setInvoiceStatus(e.value);
        if(page === 1){
            setReload(!reload);
        }else{
            setPage(1);
        }
    };

    const ExpandableRowComponent = ({ data }) => {
        return (
            <ul className="dtr-details p-2 border-bottom ms-1">
                <li className="d-block d-sm-none">
                    <span className="dtr-title">Customer name</span> <span className="dtr-data">{data.name}</span>
                </li>
                <li className="d-block d-sm-none">
                    <span className="dtr-title">Date</span> <span className="dtr-data">{dateFormat(data.invoice_date, "YYYY-mm-dd")}</span>
                </li>
                <div className="d-flex align-items-center pt-1 d-sm-none">
                    <span className="dtr-title">Actions</span>
                    <div className="dtr-data">
                        <ul className="nk-tb-actions gx-1">
                            <li onClick={() => confirmDelete(data.id, data.id)}>
                                <TooltipComponent
                                    tag="a"
                                    containerClassName="btn btn-trigger btn-icon"
                                    id={"delete" + data.id}
                                    icon="trash-alt"
                                    direction="top"
                                    text="Delete"
                                />
                            </li>
                        </ul>
                    </div>
                </div>
            </ul>
        );
    };

    const columns = [
        {
            id: 1,
            name: "Status",
            cell: (row) =>
                row.status && row.status.value === 1 ? <Badge color="danger">Unpaid</Badge> : row.status && row.status.value === 2 ? <Badge color="success">Paid</Badge> : ''
            ,
            selector: (row) => row.status,
            wrap: true,
            sortable: true,
            ref: "invoices.status->value"
        },
        {
            id: 2,
            name: "Customer name",
            selector: (row) => <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${row.customer_id}`}>{row.name}</Link>,
            wrap: false,
            sortable: false,
            ref: "customer_name",
            hide: "sm"
        },
        {
            id: 3,
            name: "Date",
            selector: (row) => dateFormat(row.invoice_date, "yyyy-mm-dd"),
            wrap: true,
            sortable: true,
            ref: "invoice_date",
            hide: "sm",
        },
        {
            id: 4,
            name: "Total",
            selector: (row) => Number(row.total).toFixed(2) + ' Sh',
            wrap: true,
            sortable: true,
            ref: "total",
        },
        {
            id: 5,
            name: "Due",
            cell: (row) => row.due ? Number(row.due).toFixed(2) + ' Sh' : '',
            selector: (row) => row.due,
            wrap: true,
            sortable: false,
            ref: "due",
        },
        {
            id: 6,
            name: "Payment date",
            cell: (row) => row.payment_date ? dateFormat(row.payment_date, "yyyy-mm-dd") : '',
            selector: (row) => row.payment_date,
            wrap: true,
            sortable: false,
            ref: "payment_date",
            hide: "sm",
        },
        {
            name: "Actions",
            cell: (row) => (
                <ul className="nk-tb-actions gx-1">
                    {row.due || invoiceStatusValue(row) === 1 ?
                        <li>
                            <div
                                className="button-link"
                                title="Pay invoice (use account credit or M-Pesa)"
                                onClick={() => {
                                    setInvoiceId(parseInt(row.id));
                                    togglePay();
                                }}
                            >
                                <Checkmark24Regular />
                            </div>
                        </li> : null}
                    <li onClick={() => confirmDelete(row.id, row.id)}>
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
            hide: "sm"
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
        const fetchInvoices = async () => {
            setLoading(true);
            const response = await http.get(`${process.env.REACT_APP_API_URL}/list-invoices?q=${searchText}&page=${page}&per_page=${perPage}&sort_col=${sortCol}&sort=${sort}&start=${startDate}&end=${endDate}&status=${invoiceStatus}`);
            setData(response.data.data);
            setTotalRows(response.data.total);
            setLoading(false);
        };

        fetchInvoices();

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
            title: "Delete Invoice",
            text: `Are you sure you want to delete "${title}"?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
        }).then((result) => {
            if (result.isConfirmed) {
                http
                    .delete(`/invoices/${id}`)
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

    const handleCallback = (start, end, label) => {
        setStartDate(dateFormat(start, 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
        setEndDate(dateFormat(end, 'dddd, mmmm dS, yyyy, h:MM:ss TT'));
        setReload(!reload);
    }

    useEffect(() => {
        window.addEventListener("load", viewChange);
        window.addEventListener("resize", viewChange);
        return () => {
            window.removeEventListener("resize", viewChange);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const togglePay = () => {
        setPayModal(!payModal);
    };

    const formikPay = useFormik({
        initialValues: {
            invoice_id: formData?.id ?? 0,
            customer_id: formData?.customer_id ?? null,
            trans_id: '',
            payment_type: { label: "Mpesa", value: "mpesa" },
            date: '',
            sum: formData?.due ?? 0,
        },
        enableReinitialize: true,
        validationSchema: Yup.object({
            sum: Yup.number("Must be a number type")
                .required("Please enter a sum. The field cannot be left blank.")
                .moreThan(0, 'Invalid sum, only a value greater than 0 is allowed!'),
            date: Yup.string()
                .required(),
        }),
        onSubmit: (data, { resetForm }) => {

            setFormLoading(true);
            http
                .post(`/add-payment`, {
                    invoice_id: data.invoice_id,
                    customer_id: data.customer_id,
                    trans_id: data.trans_id,
                    payment_type: data.payment_type?.value,
                    payment_date: data.date,
                    sum: data.sum
                })
                .then(response => {
                    setFormLoading(false);
                    if ((response.data?.message && response.data?.error)) {
                        execToast("top-right", response.data?.message);
                    }
                    else {
                        setInvoiceId(0);
                        successToast("top-right", response.data?.message);
                        resetForm();
                        togglePay();
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
        const fetchInvoice = async (id) => {

            setApiLoading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/view-invoices/${id}`);
                    if (response.data?.invoice) {
                        setFormData(response.data?.invoice);
                    }
                }
                setApiLoading(false);
            } catch (error) {
                setApiLoading(false);
            }
        };

        if (invoiceId > 0) { fetchInvoice(invoiceId) };
    }, [invoiceId]);

    return (
        <>
            <Head title="Invoices" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle page>Invoices</BlockTitle>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <div className="toggle-wrap nk-block-tools-toggle">
                                <a
                                    href="#toggle"
                                    onClick={(ev) => {
                                        ev.preventDefault();
                                        setSmOption(!smOption);
                                    }}
                                    className="btn btn-icon btn-trigger toggle-expand me-n1"
                                >
                                    <Icon name="menu-alt-r"></Icon>
                                </a>
                                <div className="toggle-expand-content" style={{ display: smOption ? "block" : "none" }}>

                                    <ul className="nk-block-tools g-3">
                                        <li className="align-items-center">
                                            <label className="overline-title overline-title-alt pe-1">Status</label>
                                            <div style={{ width: "180px" }}>
                                                <RSelect options={invoiceStatusOptions} placeholder="Any Status" onChange={(e) => onChangeStatus(e)} defaultValue={ status === '1' ? { label: "Unpaid", value: 1 } : status === '2' ? { label: "Paid", value: 2 } : ''}/>
                                            </div>
                                        </li>
                                        <li className="align-items-center">
                                            <label className="overline-title overline-title-alt pe-1">Period&nbsp;&nbsp;</label>
                                            <DateRangePicker
                                                initialSettings={{
                                                    ranges: {
                                                        Today: [moment().toDate(), moment().toDate()],
                                                        Yesterday: [
                                                            moment().subtract(1, 'days').toDate(),
                                                            moment().subtract(1, 'days').toDate(),
                                                        ],
                                                        'Last 7 Days': [
                                                            moment().subtract(6, 'days').toDate(),
                                                            moment().toDate(),
                                                        ],
                                                        'Last 30 Days': [
                                                            moment().subtract(29, 'days').toDate(),
                                                            moment().toDate(),
                                                        ],
                                                        'This Month': [
                                                            moment().startOf('month').toDate(),
                                                            moment().endOf('month').toDate(),
                                                        ],
                                                        'Last Month': [
                                                            moment().subtract(1, 'month').startOf('month').toDate(),
                                                            moment().subtract(1, 'month').endOf('month').toDate(),
                                                        ],
                                                    },
                                                    alwaysShowCalendars: true,
                                                    opens: "left",
                                                    startDate: moment().startOf('month').toDate(),
                                                    endDate: moment().endOf('month').toDate(),
                                                }}
                                                onCallback={handleCallback}
                                            >
                                                <input type="text" className="form-control" style={{ minWidth: "180px" }} />
                                            </DateRangePicker>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>
                <Block>
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
                                selectableRows={true}
                                selectableRowsComponent={CustomCheckbox}
                                clearSelectedRows={toggleCleared}
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
            <Modal isOpen={payModal} toggle={togglePay} className="modal-md">
                <ModalHeader toggle={togglePay}>Add payment</ModalHeader>
                <ModalBody>
                    {apiLoading ? <p>Loading...</p> :
                        <form className="gy-3" onSubmit={formikPay.handleSubmit}>
                            <p>Invoice number: {formikPay.values.invoice_id}</p>
                            <FocusError formik={formikPay} />
                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label">
                                            Payment type
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <RSelect name="payment_type" options={paymentOptions} value={formikPay.values.payment_type}
                                                onChange={(option) => formikPay.setFieldValue("payment_type", option)} />
                                            {formikPay.touched.payment_type && formikPay.errors.payment_type ? (<p className="invalid" style={{ color: '#e85347', fontSize: '11px', fontStyle: 'italic' }}>{formikPay.errors.payment_type}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="trans_id">
                                            Trans ID
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <input
                                                type="text"
                                                id="trans_id"
                                                className={classnames(
                                                    'form-control',
                                                    {
                                                        'is-invalid': formikPay.touched.trans_id && formikPay.errors.trans_id
                                                    }
                                                )}
                                                name="trans_id"
                                                value={formikPay.values.trans_id}
                                                onChange={formikPay.handleChange}
                                            />
                                            {formikPay.touched.trans_id && formikPay.errors.trans_id ? (<p className="invalid">{formikPay.errors.trans_id}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="date">
                                            Date
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <DatePicker
                                                selected={formikPay.values.date}
                                                className="form-control date-picker"
                                                onChange={(date) => formikPay.setFieldValue("date", date)}
                                                name="date"
                                                dateFormat="dd/MM/yyyy"
                                                customInput={<ExampleCustomInput />}
                                            />
                                            {formikPay.touched.date && formikPay.errors.date ? (<p className="invalid" style={{ color: '#e85347', fontSize: '11px', fontStyle: 'italic' }}>{formikPay.errors.date}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="sum">
                                            Sum
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <input
                                                type="number"
                                                id="sum"
                                                className={classnames(
                                                    'form-control',
                                                    {
                                                        'is-invalid': formikPay.touched.sum && formikPay.errors.sum
                                                    }
                                                )}
                                                name="sum"
                                                value={formikPay.values.sum}
                                                onChange={formikPay.handleChange}
                                            />
                                            {formikPay.touched.sum && formikPay.errors.sum ? (<p className="invalid">{formikPay.errors.sum}</p>) : null}
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
                            togglePay();
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
