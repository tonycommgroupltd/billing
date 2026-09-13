import React, { useState, useEffect, forwardRef } from "react";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { Nav, NavItem, NavLink, TabContent, TabPane, Modal, ModalHeader, ModalBody, ModalFooter, Row, Col, Spinner, Badge, DropdownToggle, DropdownMenu, Dropdown } from "reactstrap";
import classnames from "classnames";
import {
    Block,
    BlockHead,
    BlockBetween,
    BlockDes,
    BlockHeadContent,
    BlockTitle,
    Button,
    RSelect,
    Icon,
    DataTablePagination,
} from "../../components/Component";
import { http } from '../../helpers';
import { httpPortal } from '../../helpers/financeHttp';
import { tr069Http } from '../../helpers/tr069Http';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import * as Yup from 'yup';
import { useFormik } from 'formik';
import { serviceOptions, serviceOptionsCust, billingTypeOptions, categoryOptions, paymentOptions, messageOptions, billingPeriodOptions } from "../components/forms/SelectData";
import { FocusError } from 'focus-formik-error';
import { toast } from "react-toastify";
import DataTable from "react-data-table-component";
import exportFromJSON from "export-from-json";
import CopyToClipboard from "react-copy-to-clipboard";
import Swal from "sweetalert2";
import { Edit20Regular, Delete20Regular, Checkmark24Regular, CalendarEdit20Regular } from '@fluentui/react-icons';
import { AsyncPaginate } from 'react-select-async-paginate';
import DatePicker from "react-datepicker";
import TimeAgo from 'react-timeago';
import dateFormat from 'dateformat';
import { isDate } from "date-fns";
import StatsTab from "./StatsTab";
import DocumentsTab from "./DocumentsTab";
import CustomerLocationMap from "./CustomerLocationMap";
import CustomerPppoeStatsCard from "./CustomerPppoeStatsCard";
import moment from 'moment';
import { triggerDataRefresh } from '../../utils/dataRefresh';
import { connect } from 'react-redux';
import { fetchTicketCustomerLocation } from '../../helpers/ticketLocation';
import TicketsAPI from '../../helpers/TicketsAPI';
import { findPlanForPackage, markTicketConfigured, buildMikrotikNameFromCustomer, buildMikrotikPasswordFromPhone } from '../../helpers/authorizeTicketCustomer';

const ADD_SERVICE_STEPS = [
    { key: 'plan', title: 'Select plan' },
    { key: 'options', title: 'Installation options' },
    { key: 'credentials', title: 'PPPoE credentials' },
    { key: 'defaults', title: 'Billing defaults' },
];

const parseDateString = (value, originalValue) => {
    return isDate(originalValue)
        ? originalValue  // this make sure that a value is provided
        : new Date(originalValue);
}

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const ExampleCustomInput = forwardRef(({ value, onClick, onChange, className, children }, ref) => (
    <div onClick={onClick} ref={ref}>
        <div className="form-icon form-icon-left">
            <Icon name="calendar"></Icon>
        </div>
        <input className={className} type="text" value={value} onChange={onChange} />
        {children}
    </div>
));

const addWeeks = (date, weeks) => {
    date.setDate(date.getDate() + 7 * weeks);
    return moment(date.toISOString()).toDate();
}

const addMonths = (date, months) => {
    date.setMonth(date.getMonth() + months);
    return moment(date.toISOString()).toDate();
}

/** New installs: bill_to stays at start until first invoice is paid (backend extends on payment). */
const billToForNewInstallation = (startDate) => {
    const d = startDate ? new Date(startDate) : new Date();
    d.setHours(0, 0, 0, 0);
    return moment(d.toISOString()).toDate();
};

const billToForRecurringAdd = (billingPeriod, startDate) => {
    if (billingPeriod?.value === 1 || billingPeriod?.value === 2) {
        return addWeeks(new Date(), billingPeriod.value);
    }
    if (billingPeriod?.value === 3) {
        return addMonths(new Date(), 1);
    }
    return billToForNewInstallation(startDate);
};

/** Due date column: unpaid invoice due date, else last due date if expired/disabled, else bill_to */
const serviceDisplayDueDate = (row) => {
    if (!row || Array.isArray(row) || typeof row !== 'object') return null;
    if (row.due_date) return row.due_date;
    const status = row.status?.value;
    if ((status === 1 || status === 3) && row.last_due_date) {
        return row.last_due_date;
    }
    return row.bill_to || null;
};

const invoiceStatusValue = (row) => {
    const st = typeof row?.status === 'string' ? JSON.parse(row.status) : row?.status;
    return Number(st?.value ?? 0);
};

const isInvoiceUnpaid = (row) => invoiceStatusValue(row) === 1;

const parseDisplayDate = (value) => {
    if (!value) return null;
    const m = moment(value);
    return m.isValid() ? m.toDate() : null;
};

const toApiDateTime = (value) => {
    if (value == null || value === '') return null;
    const m = moment(value);
    return m.isValid() ? m.format('YYYY-MM-DD HH:mm:ss') : null;
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

const View = ({ user }) => {
    const { all_roles = [] } = user;
    const isCustomerCare = all_roles.includes("customer-care");
    const { id } = useParams();
    const [serviceId, setServiceId] = useState(0);
    const [data, setData] = useState([]);
    const [formData, setFormData] = useState([]);
    const [formDataPay, setFormDataPay] = useState([]);
    const [formDataInvoice, setFormDataInvoice] = useState([]);
    const [dataServices, setDataServices] = useState([]);
    const [dataInvoices, setDataInvoices] = useState([]);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [apiLoading, setApiLoading] = useState(false);
    const [apiPayLoading, setApiPayLoading] = useState(false);
    const [api2Loading, setApi2Loading] = useState(false);
    const [api3Loading, setApi3Loading] = useState(false);
    const [apiInvoicesLoading, setApiInvoicesLoading] = useState(false);
    const [apiInvoiceLoading, setApiInvoiceLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("1");
    const [page, setPage] = useState(1);
    const [pageInvoices, setPageInvoices] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const [totalRowsInvoices, setTotalRowsInvoices] = useState(0);
    const [perPage, setPerPage] = useState(10);
    const [perPageInvoices, setPerPageInvoices] = useState(10);
    const [sort, setSort] = useState('asc');
    const [sortInvoices, setSortInvoices] = useState('asc');
    const [sortCol, setSortCol] = useState('id');
    const [sortColInvoices, setSortColInvoices] = useState('id');
    const [searchText, setSearchText] = useState("");
    const [searchTextInvoices, setSearchTextInvoices] = useState("");
    const [toggleCleared, setToggleCleared] = useState(false);
    const [toggleClearedInvoices, setToggleClearedInvoices] = useState(false);
    const [reload, setReload] = useState(false);
    const [cust, setCust] = useState(false);
    const [reloadInvoices, setReloadInvoices] = useState(false);
    const [connectivity, setConnectivity] = useState(null);
    const [connectivityLoading, setConnectivityLoading] = useState(false);
    const [connectivityServiceId, setConnectivityServiceId] = useState(null);
    const [wifiOverview, setWifiOverview] = useState(null);
    const [wifiLoading, setWifiLoading] = useState(false);
    const [wifiDevicesLoading, setWifiDevicesLoading] = useState(false);
    const [wifiDevicesModal, setWifiDevicesModal] = useState(false);
    const [wifiPasswordModal, setWifiPasswordModal] = useState(false);
    const [ticketLocation, setTicketLocation] = useState(null);
    const [ticketLocationLoading, setTicketLocationLoading] = useState(false);
    const [ticketSummary, setTicketSummary] = useState({ count: 0, lastTicket: null, loading: false });
    const [onuLoading, setOnuLoading] = useState(false);
    const [modal, setModal] = useState(false);
    const [addServiceStep, setAddServiceStep] = useState(0);
    const [pendingTicketMeta, setPendingTicketMeta] = useState(null);
    const [planGroups, setPlanGroups] = useState([]);
    const [planGroupsLoading, setPlanGroupsLoading] = useState(false);
    const [selectedSpeedKey, setSelectedSpeedKey] = useState(null);
    const [editModal, setEditModal] = useState(false);
    const [editBillDateModal, setEditBillDateModal] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [payModal, setPayModal] = useState(false);
    const [generateInvoiceModal, setGenerateInvoiceModal] = useState(false);
    const [messageModal, setMessageModal] = useState(false);
    const [passwordModal, setPasswordModal] = useState(false);
    const [invoiceId, setInvoiceId] = useState(0);
    const [open, setOpen] = useState(false);
    const toggleAction = () => setOpen((prevState) => !prevState);
    const [passState, setPassState] = useState(false);
    const [wifiPassState, setWifiPassState] = useState(false);
    const [passStateAdd, setPassStateAdd] = useState(false);
    const [passStateEdit, setPassStateEdit] = useState(false);

    const openCustomerMpesaTransactions = () => {
        const params = new URLSearchParams({
            customer_id: String(id),
            customer_q: data?.phone_number || data?.name || String(id),
            customer_name: data?.name || "",
        });

        navigate(`${process.env.PUBLIC_URL}/admin/finance/mpesa?${params.toString()}`);
    };

    const openCustomerTicketsList = () => {
        const phoneOrName = data?.phone_number || data?.name || String(id);
        const params = new URLSearchParams({
            search: phoneOrName,
            status: 'all',
        });
        navigate(`${process.env.PUBLIC_URL}/admin/tickets/list?${params.toString()}`);
    };

    const openOnuWeb = async () => {
        const serviceId = connectivityServiceId
            || (Array.isArray(dataServices) && dataServices.find((s) => Number(s?.status?.value) === 2)?.id)
            || (Array.isArray(dataServices) && dataServices[0]?.id);
        if (!serviceId) {
            window.alert('No internet service found for this customer.');
            return;
        }
        setOnuLoading(true);
        try {
            const response = await http.get(`/services/${serviceId}/onu-web-access`);
            const payload = response.data || {};
            if (!payload.ok || !payload.url) {
                window.alert(payload.message || 'Could not open ONU web UI.');
                return;
            }
            window.open(payload.url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            window.alert(err?.response?.data?.message || err?.message || 'Failed to open ONU.');
        } finally {
            setOnuLoading(false);
        }
    };

    const openCreateTicketForCustomer = () => {
        const params = new URLSearchParams({
            customer_id: String(id),
            customer_phone: data?.phone_number || "",
            customer_name: data?.name || "",
        });
        navigate(`${process.env.PUBLIC_URL}/admin/tickets/create?${params.toString()}`);
    };

    const defaultStartDate = new Date();
    defaultStartDate.setHours(0, 0, 0, 0);
    const bill_date = addMonths(new Date(defaultStartDate), 1);
    bill_date.toISOString();

    const today_date = new Date();
    today_date.toISOString();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // avoid timezone issues

    const phoneRegex = RegExp(
        /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/
    );

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

    /*const execToastInfo = (placement, message) => {
        toast.info(message, {
            position: placement,
            autoClose: true,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: false,
            closeButton: <CloseButton />,
        });
    };*/

    const formik = useFormik({
        initialValues: {
            billing_type: data?.billing_type ?? { value: 1, label: "Recurring" },
            category: data?.category ?? { value: 1, label: "Individual" },
            name: data?.name ?? '',
            address: data?.address ?? '',
            email: data?.email ?? '',
            phone_number: data?.phone_number ?? '',
            dob: data?.dob ?? '',
            city: data?.city ?? ''
        },
        enableReinitialize: true,
        validationSchema: Yup.object({
            name: Yup.string('Enter your full name')
                .required('Full name is required'),
            email: Yup.string('Enter your email')
                .email('Enter a valid email'),
            phone_number: Yup.string().matches(phoneRegex, "Invalid characters in phone number field (allowed only 0-9)").required("Phone is required"),
        }),
        onSubmit: (data) => {
            setLoading(true);
            http
                .post(`/update-customer/${id}`, {
                    billing_type: data.billing_type,
                    category: data.category,
                    name: data.name,
                    address: data.address,
                    email: data.email,
                    phone_number: data.phone_number,
                    dob: data.dob,
                    city: data.city
                })
                .then(response => {
                    setLoading(false);
                    if (response.data?.message) {
                        successToast("top-right", response.data?.message);
                    }
                    if (response.data?.customer) {
                        setData(response.data?.customer);
                    }
                })
                .catch(err => {
                    setLoading(false);
                    if (err.response.status === 422) {
                        execToast("top-right", err.response.data[Object.keys(err.response.data)[0]][0]);
                    } else {
                        execToast("top-right", 'Something went wrong');
                    }
                })
        }
    });

    const formikAdd = useFormik({
        initialValues: {
            plan: '',
            installation: false,
            generate_invoice: false,
            use_credit: false,
            due_date: billToForNewInstallation(new Date(defaultStartDate)),
            billing_type: { value: 1, label: "Recurring" },
            billing_period: { value: 3, label: "Monthly" },
            mikrotik_name: '',
            mikrotik_password: '',
            installation_fee: 0,
            price: 0,
            start_date: new Date(),
            end_date: '',
            bill_to: billToForNewInstallation(new Date(defaultStartDate)),
            status: { value: 2, label: "Active" }
        },
        /*const schema = Yup.object().shape({
            start_date: Yup.date()
                .typeError('Start Date is required')
                .required('Start Date is required'),
            end_date: Yup.date()
                .typeError('End Date is required')
                .required('End Date is required')
                .when('start_date', (start_date) => {
                    if (start_date) {
                        return Yup.date()
                            .min(start_date, 'End Date must be after Start Date')
                            .typeError('End Date is required')
                    }
                }),
        })*/
        validationSchema: Yup.object({
            mikrotik_name: Yup.string('Enter the mikrotik name')
                .required('Mikrotik name field is required')
                .matches(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/, 'Invalid characters in field mikrotik name (allowed only A-Z, a-z, 0-9 and dash)'),
            mikrotik_password: Yup.string('Enter the mikrotik password')
                .min(4, 'Password should be of minimum 4 characters length')
                .max(30, 'Password should be of maximum 30 characters length')
                .required('Password is required'),
            installation_fee: Yup.number()
                /*when("generate_invoice", {
                    is: true,
                    then: Yup.number('Must be a number type').positive()
                })
                .*/
                .when(["generate_invoice", "installation"], (generate_invoice, installation) => {
                    if (generate_invoice === true && installation === true) return Yup.number('Must be a number type').positive();
                }),
            price: Yup.number('Must be a number type')
                .required("Please enter a price. The field cannot be left blank.")
                .positive(),
            due_date: Yup.date()
                .when("generate_invoice", (generate_invoice) => {
                    if (generate_invoice === true) return Yup.date().typeError('Due Date is required').required('Due Date is required');
                }),
            start_date: Yup.date()
                .transform(parseDateString)
                .typeError("Please enter a valid date")
                .required(),
            bill_to: Yup.date()
                .transform(parseDateString)
                .typeError("Please enter a valid date")
                .required()
                .min(today, "Date cannot be in the past"),
            /*start_date: Yup.date()
                .transform(parseDateString)
                .typeError("please enter a valid date")
                .required()
                .min("2025-11-13", "Date is too early"),
            end_date: Yup.date()
                .transform(parseDateString)
                .typeError("please enter a valid date")
            .min("1969-11-13", "Date is too early")*/
        }).shape({
            plan: Yup.object().shape({
                id: Yup.string().required('Plan is required')
            }),
        }),
        onSubmit: (data, { resetForm }) => {

            setFormLoading(true);
            http
                .post(`/add-services`, {
                    customer_id: id,
                    plan_id: data.plan.id,
                    installation: data.installation,
                    generate_invoice: data.generate_invoice,
                    use_credit: data.use_credit,
                    due_date: data.due_date ? new Date(data.due_date).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }) : data.due_date,
                    mikrotik_name: data.mikrotik_name,
                    mikrotik_password: data.mikrotik_password,
                    installation_fee: data.installation_fee,
                    price: data.price,
                    billing_type: data.billing_type,
                    billing_period: data.billing_period,
                    start_date: data.start_date ? new Date(data.start_date).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }) : data.start_date,
                    end_date: data.end_date ? new Date(data.end_date).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }) : data.end_date,
                    bill_to: data.bill_to ? new Date(data.bill_to).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }) : data.bill_to,
                    status: data.status
                })
                .then(async response => {
                    setFormLoading(false);
                    if ((response.data?.message && response.data?.error)) {
                        execToast("top-right", response.data?.message);
                    }
                    else {
                        successToast("top-right", response.data?.message);
                        if (pendingTicketMeta?.ticketId) {
                            try {
                                const serviceId =
                                    response.data?.service?.id ||
                                    response.data?.data?.id ||
                                    response.data?.id ||
                                    null;
                                const ticket = await TicketsAPI.getById(pendingTicketMeta.ticketId);
                                await markTicketConfigured(ticket?.data || ticket || { id: pendingTicketMeta.ticketId }, {
                                    actorName: pendingTicketMeta.actorName || 'System',
                                    customerId: id,
                                    serviceId,
                                    customerCreated: pendingTicketMeta.customerCreated,
                                    packageName: pendingTicketMeta.packageName,
                                });
                            } catch (ticketErr) {
                                console.error(ticketErr);
                                execToast("top-right", 'Service created, but ticket could not be marked configured.');
                            }
                            setPendingTicketMeta(null);
                        }
                        resetForm();
                        setAddServiceStep(0);
                        toggleAdd();
                        setCust(!cust);
                        setReloadInvoices(!reloadInvoices);
                        if (page === 1) {
                            setReload(!reload);
                            triggerDataRefresh(['customers']);
                        } else {
                            setPage(1);
                            triggerDataRefresh(['customers']);
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
            plan: { id: formData?.plan_id ?? '', title: formData?.title ?? '' },
            mikrotik_name: formData?.mikrotik_name ?? '',
            mikrotik_password: formData?.mikrotik_password ?? '',
            price: formData?.price ?? 0,
            start_date: parseDisplayDate(formData?.start_date),
            end_date: parseDisplayDate(formData?.end_date),
            billing_type: formData?.billing_type ?? { value: 1, label: "Recurring" },
            billing_period: formData?.billing_period ?? { value: 3, label: "Monthly" },
            status: formData?.status ?? { value: 2, label: "Active" }
        },
        enableReinitialize: true,
        validationSchema: Yup.object({
            mikrotik_name: Yup.string('Enter the mikrotik name')
                .required('Mikrotik name field is required')
                .matches(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/, 'Invalid characters in field mikrotik name (allowed only A-Z, a-z, 0-9 and dash)'),
            mikrotik_password: Yup.string('Enter the mikrotik password')
                .min(4, 'Password should be of minimum 4 characters length')
                .max(30, 'Password should be of maximum 30 characters length')
                .required('Password is required'),
            price: Yup.number('Must be a number type')
                .required("Please enter a price. The field cannot be left blank.")
                .positive(),
            start_date: Yup.date()
                .transform(parseDateString)
                .typeError("Please enter a valid date")
                .required(),
        }).shape({
            plan: Yup.object().shape({
                id: Yup.string().required('Plan is required')
            }),
        }),
        onSubmit: (data, { resetForm }) => {
            setFormLoading(true);
            http
                .post(`/update-services/${data.id}`, {
                    plan_id: data.plan.id,
                    mikrotik_name: data.mikrotik_name,
                    mikrotik_password: data.mikrotik_password,
                    price: data.price,
                    billing_type: data.billing_type,
                    billing_period: data.billing_period,
                    start_date: data.start_date ? new Date(data.start_date).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }) : data.start_date,
                    end_date: data.end_date ? new Date(data.end_date).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }) : data.end_date,
                    //bill_to: data.bill_to ? new Date(data.bill_to).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }) : data.bill_to,
                    status: data.status
                })
                .then(response => {
                    setFormLoading(false);
                    if (response.data?.error) {
                        execToast("top-right", response.data?.message || "Could not save service");
                    } else {
                        successToast("top-right", response.data?.message || "Service saved");
                        toggleEdit();
                        setReload(!reload);
                        triggerDataRefresh(['customers']);
                        setServiceId(0);
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

    const formikBillDate = useFormik({
        initialValues: {
            id: formData?.id ?? 0,
            due_date: parseDisplayDate(serviceDisplayDueDate(formData)),
        },
        enableReinitialize: true,
        validationSchema: Yup.object({
            due_date: Yup.date()
                .transform(parseDateString)
                .typeError("Please enter a valid date")
                .required("Date is required"),
        }),
        onSubmit: (data, { resetForm }) => {
            const dueDate = toApiDateTime(data.due_date);
            if (!dueDate) {
                execToast("top-right", "Please select a valid due date");
                return;
            }
            setFormLoading(true);
            http
                .post(`/update-bill-date/${data.id}`, {
                    due_date: dueDate,
                })
                .then(response => {
                    setFormLoading(false);
                    if ((response.data?.message && response.data?.error)) {
                        execToast("top-right", response.data?.message);
                    }
                    else {
                        successToast("top-right", response.data?.message);
                        //resetForm();
                        toggleBillDate();
                        setReload(!reload);
                        triggerDataRefresh(['customers']);
                        setServiceId(0);

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

    const formikGenerateInvoice = useFormik({
        initialValues: {
            service: null,
            billing_period: null,
            send_sms: false,
            date: Date.parse(today_date),
            amount: 0,
        },
        validationSchema: Yup.object({
            amount: Yup.number('Must be a number type')
                .required("Please enter amount. The field cannot be left blank.")
                .positive("Amount must be greater than 0."),
            date: Yup.date()
                .transform(parseDateString)
                .typeError("Please enter a valid date")
                .required(),
        }).shape({
            service: Yup.object().shape({
                value: Yup.string().required('Service is required')
            }),
            billing_period: Yup.object().shape({
                value: Yup.string().required('Billing period is required')
            })
        }),
        onSubmit: (data, { resetForm }) => {
            setFormLoading(true);
            http
                .post(`/generate-invoice`, {
                    service_id: data.service.value,
                    send_sms: data.send_sms,
                    amount: data.amount,
                    billing_period: data.billing_period,
                    date: data.date ? new Date(data.date).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }) : data.date
                })
                .then(response => {
                    setFormLoading(false);
                    if ((response.data?.message && response.data?.error)) {
                        execToast("top-right", response.data?.message);
                    }
                    else {
                        successToast("top-right", response.data?.message);
                        resetForm();
                        toggleGenerateInvoice();
                        if (page === 1) {
                            setReloadInvoices(!reloadInvoices);
                        } else {
                            setPageInvoices(1);
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

    const toggle = (tab) => {
        if (activeTab !== tab) setActiveTab(tab);
    };

    const filteredBillingTypeOptions = billingTypeOptions.map(opt => {
        if (isCustomerCare && opt.value === 2) {
            return { ...opt, isDisabled: true };
        }
        return opt;
    });

    useEffect(() => {
        const fetchCustomer = async (id) => {
            setApiLoading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/view-customer/${id}`);
                    if (response.data?.customer) {
                        setData(response.data?.customer);
                    }
                }
                setApiLoading(false);
            } catch (error) {
                //console.log(error)
            }
        };

        fetchCustomer(id);

        return () => {
            setApiLoading(false);
        };

    }, [id, cust]);

    useEffect(() => {

        const fetchServices = async (id) => {
            setApi2Loading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/list-services/${id}?q=${searchText}&page=${page}&per_page=${perPage}&sort_col=${sortCol}&sort=${sort}`);

                    if (response.data?.data) {
                        setDataServices(response.data?.data);
                        setTotalRows(response.data?.total);
                    }
                }
                setApi2Loading(false);
            } catch (error) {
                setApi2Loading(false);
            }
        };

        fetchServices(id);

    }, [id, page, perPage, sortCol, sort, searchText, reload]);

    useEffect(() => {
        if (!Array.isArray(dataServices) || dataServices.length === 0) return;
        if (connectivityServiceId) return;
        const active = dataServices.find((s) => Number(s?.status?.value) === 2);
        setConnectivityServiceId((active || dataServices[0]).id);
    }, [dataServices, connectivityServiceId]);

    useEffect(() => {
        if (!id) return undefined;

        let cancelled = false;
        const fetchConnectivity = async () => {
            setConnectivityLoading(true);
            try {
                const q = connectivityServiceId ? `?serviceId=${connectivityServiceId}` : '';
                const response = await tr069Http.get(`/customer-connectivity/${id}${q}`);
                if (!cancelled) setConnectivity(response.data);
            } catch (_) {
                if (!cancelled) setConnectivity(null);
            } finally {
                if (!cancelled) setConnectivityLoading(false);
            }
        };

        fetchConnectivity();
        return () => {
            cancelled = true;
        };
    }, [id, connectivityServiceId]);

    useEffect(() => {
        if (!id || !connectivityServiceId) {
            setWifiOverview(null);
            return undefined;
        }

        const primary = connectivity?.primary;
        const genieacsId = primary?.genieacsId || primary?.tr069?.genieacsId || null;
        const onuExternalId = primary?.onuExternalId || primary?.smartolt?.onuExternalId || null;
        const serialNumber = primary?.sn || primary?.serialNumber || primary?.smartolt?.sn || primary?.tr069?.serialNumber || null;

        // Same device the connectivity badge resolved (SmartOLT or TR-069)
        const params = {
            customer_id: id,
            service_id: connectivityServiceId,
            ...(onuExternalId ? { onu_external_id: onuExternalId } : {}),
            ...(genieacsId ? { genieacs_id: genieacsId } : {}),
            ...(serialNumber ? { serial_number: serialNumber } : {}),
        };

        let cancelled = false;
        const fetchWifi = async () => {
            setWifiLoading(true);
            try {
                const response = await httpPortal.get(`/staff/wifi/overview`, { params });
                if (cancelled) return;
                setWifiOverview(response.data);

                // The client list needs a live OLT query, so it trails the card.
                if (response.data?.success && !response.data?.devices_loaded) {
                    setWifiDevicesLoading(true);
                    httpPortal
                        .get(`/staff/wifi/devices`, { params })
                        .then((devicesResponse) => {
                            if (cancelled || !devicesResponse.data?.success) return;
                            setWifiOverview((current) => (current ? {
                                ...current,
                                devices_loaded: true,
                                device_count: devicesResponse.data.device_count,
                                connected_devices: devicesResponse.data.connected_devices || [],
                            } : current));
                        })
                        .catch(() => {})
                        .finally(() => {
                            if (!cancelled) setWifiDevicesLoading(false);
                        });
                }
            } catch (_) {
                if (!cancelled) setWifiOverview(null);
            } finally {
                if (!cancelled) setWifiLoading(false);
            }
        };

        fetchWifi();
        return () => {
            cancelled = true;
        };
    }, [id, connectivityServiceId, connectivity?.primary, reload]);

    useEffect(() => {
        const phone = data?.phone_number;
        if (!phone) {
            setTicketLocation(null);
            return undefined;
        }

        let cancelled = false;

        const loadTicketLocation = async () => {
            setTicketLocationLoading(true);
            try {
                const location = await fetchTicketCustomerLocation(phone);
                if (!cancelled) {
                    setTicketLocation(location);
                }
            } catch (_) {
                if (!cancelled) {
                    setTicketLocation(null);
                }
            } finally {
                if (!cancelled) {
                    setTicketLocationLoading(false);
                }
            }
        };

        loadTicketLocation();

        return () => {
            cancelled = true;
        };
    }, [data?.phone_number]);

    useEffect(() => {
        const phone = data?.phone_number;
        if (!phone) {
            setTicketSummary({ count: 0, lastTicket: null, loading: false });
            return undefined;
        }

        let cancelled = false;

        const loadTicketSummary = async () => {
            setTicketSummary((prev) => ({ ...prev, loading: true }));
            try {
                const [activeResp, archivedResp] = await Promise.allSettled([
                    TicketsAPI.getAll({ search: phone, per_page: 100 }),
                    TicketsAPI.getArchived({ search: phone, per_page: 100 }),
                ]);

                const active = activeResp.status === 'fulfilled'
                    ? (activeResp.value?.data || activeResp.value?.tickets || [])
                    : [];
                const archived = archivedResp.status === 'fulfilled'
                    ? (archivedResp.value?.data || archivedResp.value?.tickets || [])
                    : [];

                const all = [...active, ...archived].sort((a, b) => {
                    const dateA = new Date(a?.created_at || a?.createdAt || 0).getTime();
                    const dateB = new Date(b?.created_at || b?.createdAt || 0).getTime();
                    return dateB - dateA;
                });

                if (!cancelled) {
                    setTicketSummary({
                        count: all.length,
                        lastTicket: all[0] || null,
                        loading: false,
                    });
                }
            } catch (_) {
                if (!cancelled) {
                    setTicketSummary({ count: 0, lastTicket: null, loading: false });
                }
            }
        };

        loadTicketSummary();

        return () => {
            cancelled = true;
        };
    }, [data?.phone_number]);

    useEffect(() => {
        const fetchService = async (id) => {

            setApi3Loading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/view-services/${id}`);

                    if (response.data?.service) {
                        setFormData(response.data?.service);
                        console.log(response);
                    }
                }
                setApi3Loading(false);
            } catch (error) {
                setApi3Loading(false);
            }
        };

        if (serviceId > 0) { fetchService(serviceId) };
    }, [serviceId]);

    useEffect(() => {
        const fetchInvoice = async (id) => {

            setApiPayLoading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/view-invoices/${id}`);

                    if (response.data?.invoice) {
                        setFormDataPay(response.data.invoice);
                    }
                }
                setApiPayLoading(false);
            } catch (error) {
                setApiPayLoading(false);
            }
        };

        if (invoiceId > 0) { fetchInvoice(invoiceId) };
    }, [invoiceId]);

    useEffect(() => {

        const fetchServices = async (id) => {

            setApiInvoiceLoading(true);
            try {
                const response = await http.get(`${process.env.REACT_APP_API_URL}/fetch-services/${id}`);
                if (response.data?.services) {
                    setFormDataInvoice(response.data);
                }
                setApiInvoiceLoading(false);
            } catch (error) {
                setApiInvoiceLoading(false);
            }
        };

        if (generateInvoiceModal) { fetchServices(id) };
    }, [id, generateInvoiceModal]);

    useEffect(() => {

        const fetchInvoices = async (id) => {
            setApiInvoicesLoading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/list-customer-invoices/${id}?q=${searchTextInvoices}&page=${pageInvoices}&per_page=${perPageInvoices}&sort_col=${sortColInvoices}&sort=${sortInvoices}`);

                    if (response.data?.data) {
                        setDataInvoices(response.data?.data);
                        setTotalRowsInvoices(response.data?.total);
                    }
                }
                setApiInvoicesLoading(false);
            } catch (error) {
                setApiInvoicesLoading(false);
            }
        };

        fetchInvoices(id);

    }, [id, pageInvoices, perPageInvoices, sortColInvoices, sortInvoices, searchTextInvoices, reloadInvoices]);

    const baseColumns = [
        {
            id: 1,
            name: "ID",
            selector: (row) => row.id,
            width: "80px",
            sortable: true,
            ref: "id"
        },
        {
            id: 2,
            name: "Status",
            cell: (row) =>
                row.online === 1
                    ? <Badge color="success">Online</Badge>
                    : row.status.value === 0
                        ? <Badge color="warning">Pending</Badge>
                        : row.status.value === 1
                            ? <Badge color="dark">Disabled</Badge>
                            : row.status.value === 2
                                ? <Badge color="primary">Active</Badge>
                                : row.status.value === 3
                                    ? <Badge color="info">Expired</Badge>
                                    : '',
            sortable: true,
            ref: "status"
        },
        {
            id: 3,
            name: "Plan",
            selector: (row) => row.title,
            sortable: true,
            ref: "title",
        },
        {
            id: 4,
            name: "Price",
            selector: (row) => Number(row.price).toFixed(2) + " Sh",
            sortable: true,
            ref: "price",
        },
        {
            id: 5,
            name: "Start date",
            selector: (row) =>
                row.start_date ? dateFormat(row.start_date, "dd-mm-yyyy") : "",
            sortable: true,
            ref: "start_date",
        },
        {
            id: 6,
            name: "Billing type",
            selector: (row) => (
                <Badge color="dark">{row?.billing_type?.label ?? "None"}</Badge>
            ),
            width: "140px",
            sortable: true,
            ref: "billing_type->value",
        },
        {
            id: 7,
            name: "Due date",
            selector: (row) => {
                const displayDate = serviceDisplayDueDate(row);
                return displayDate ? dateFormat(displayDate, "dd-mm-yyyy") : "";
            },
            sortable: true,
            ref: "due_date",
        },
        {
            id: 8,
            name: "Service login",
            selector: (row) => row.mikrotik_name,
            sortable: true,
            ref: "mikrotik_name",
        },
        {
            id: 9,
            name: "IPv4",
            selector: (row) => row.mikrotik_ipv4,
        },
    ];

    const actionColumn = {
        name: "Actions",
        cell: (row) => (
            <ul className="nk-tb-actions gx-1">

                <li>
                    <div
                        className="button-link"
                        onClick={() => {
                            setServiceId(parseInt(row.id));
                            toggleEdit();
                        }}
                    >
                        <Edit20Regular />
                    </div>
                </li>

                {/* ❌ bill date hidden for customer care */}
                {!isCustomerCare && (
                    <li>
                        <div
                            className="button-link"
                            onClick={() => {
                                setServiceId(parseInt(row.id));
                                toggleBillDate();
                            }}
                        >
                            <CalendarEdit20Regular />
                        </div>
                    </li>
                )}

                {/* ❌ delete hidden for customer care */}
                {!isCustomerCare && (
                    <li>
                        <div
                            className="button-link"
                            onClick={() => confirmDelete(row.id, row.title)}
                        >
                            <Delete20Regular />
                        </div>
                    </li>
                )}

            </ul>
        ),
        ignoreRowClick: true,
        allowOverflow: true,
    };

    const columns = [...baseColumns, actionColumn];

    const baseColumnsInvoices = [
        {
            id: 1,
            name: "Status",
            cell: (row) =>
                row.status && row.status.value === 1 ? <Badge color="danger">Unpaid</Badge> : row.status && row.status.value === 2 ? <Badge color="success">Paid</Badge> : <Badge color="danger">Unpaid</Badge>
            ,
            selector: (row) => row.status,
            wrap: true,
            sortable: true,
            ref: "invoices.status->value"
        },
        {
            id: 2,
            name: "Service",
            cell: (row) => row.services_id ? `#${row.services_id}` : '',
            selector: (row) => row.services_id,
            wrap: true,
            sortable: true,
            ref: "services_id",
        },
        {
            id: 3,
            name: "Customer name",
            selector: (row) => <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${row.customer_id}`}>{row.name}</Link>,
            wrap: false,
            sortable: false,
            ref: "customer_name",
        },
        {
            id: 4,
            name: "Date",
            selector: (row) => dateFormat(row.invoice_date, "yyyy-mm-dd"),
            wrap: true,
            sortable: true,
            ref: "invoice_date",
        },
        {
            id: 5,
            name: "Total",
            selector: (row) => Number(row.total).toFixed(2) + ' Sh',
            wrap: true,
            sortable: true,
            ref: "total",
        },
        {
            id: 6,
            name: "Due",
            cell: (row) => {
                const due = Number(row.due ?? 0);
                const afterCredit = Number(row.due_after_credit ?? due);
                if (!due) return '';
                if (afterCredit < due && afterCredit >= 0) {
                    return `${afterCredit.toFixed(2)} Sh (${due.toFixed(2)} − credit)`;
                }
                return `${due.toFixed(2)} Sh`;
            },
            selector: (row) => row.due,
            wrap: true,
            sortable: false,
            ref: "due",
        },
        {
            id: 7,
            name: "Payment date",
            cell: (row) => row.payment_date ? dateFormat(row.payment_date, "yyyy-mm-dd") : '',
            selector: (row) => row.payment_date,
            wrap: true,
            sortable: false,
            ref: "payment_date",
        },
    ];

    const actionColumnInvoices = {
        name: "Actions",
        cell: (row) => (
            <ul className="nk-tb-actions gx-1">
                {isInvoiceUnpaid(row) ?
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
                {!isCustomerCare && (<li >
                    <div className="button-link" onClick={() => confirmDeleteInvoices(row.id, row.id)}>
                        <Delete20Regular />
                    </div>
                </li>)}

            </ul>
        ),
        ignoreRowClick: true,
        allowOverflow: true,
    };

    const columnsInvoices = [...baseColumnsInvoices, actionColumnInvoices];

    const handlePageChange = page => {
        setPage(page);
        setToggleCleared(!toggleCleared);
    };

    const handlePageChangeInvoices = page => {
        setPageInvoices(page);
        setToggleClearedInvoices(!toggleClearedInvoices);
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

    const handlePerRowsChangeInvoices = (e, perPageO) => {

        let newPage = 1;
        if (parseInt(perPageO) > parseInt(e.target.value) && page !== 1) {
            newPage = (Math.ceil((parseInt(perPageO) / parseInt(e.target.value))) * (page - 1)) + 1;
        } else if (page !== 1) {
            newPage = Math.ceil((parseInt(perPageO) / parseInt(e.target.value)) * page);
        }
        setPerPageInvoices(e.target.value);
        setPageInvoices(newPage);
        setToggleClearedInvoices(!toggleClearedInvoices);
    };

    const handleSort = async (column, sortDirection) => {
        //setSort(column.name);
        //setOrder(sortDirection);
        setSort(sortDirection);
        setSortCol(column.ref);
    };

    const handleSortInvoices = async (column, sortDirection) => {
        //setSort(column.name);
        //setOrder(sortDirection);
        setSortInvoices(sortDirection);
        setSortColInvoices(column.ref);
    };

    const confirmDelete = (id, title) => {
        Swal.fire({
            title: "Delete internet service",
            text: `Are you sure you want to delete "${title}"?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
        }).then((result) => {
            if (result.isConfirmed) {
                http.delete(`/services/${id}`)
                    .then(response => {
                        Swal.fire("Deleted!", response.data?.message, "success");

                        if (page === 1) {
                            setReload(!reload);
                            triggerDataRefresh(['customers']);
                        } else {
                            setPage(1);
                            triggerDataRefresh(['customers']);
                        }
                    })
                    .catch(err => {
                        const message = err.response?.data?.message || err.message;

                        Swal.fire("Error!", message, "error");
                    });
            }
        });
    };

    const confirmDeleteInvoices = (id, title) => {
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
                                setReloadInvoices(!reloadInvoices);
                            } else {
                                setPageInvoices(1);
                            }
                        }
                    })
                    .catch(err => {
                        Swal.fire("Error!", err.message, "warning");
                    })

            }
        });
    };

    const toggleAdd = () => {
        setModal((open) => {
            if (open) {
                setAddServiceStep(0);
                setPendingTicketMeta(null);
                setSelectedSpeedKey(null);
                formikAdd.resetForm();
            } else {
                // Prefill PPPoE from customer account
                const uname = buildMikrotikNameFromCustomer(data?.name);
                const pass = buildMikrotikPasswordFromPhone(data?.phone_number);
                formikAdd.setFieldValue('mikrotik_name', uname);
                formikAdd.setFieldValue('mikrotik_password', pass);
                setAddServiceStep(0);
                setSelectedSpeedKey(null);
                loadPlanGroups();
            }
            return !open;
        });
    };

    const validateAddServiceStep = async (step) => {
        const fieldsByStep = {
            0: ['plan'],
            1: ['installation', 'generate_invoice', 'use_credit', 'due_date'],
            2: ['mikrotik_name', 'mikrotik_password', 'installation_fee'],
            3: ['price', 'start_date', 'bill_to', 'billing_type', 'billing_period', 'status'],
        };
        const fields = fieldsByStep[step] || [];
        const errors = await formikAdd.validateForm();
        fields.forEach((field) => formikAdd.setFieldTouched(field, true, false));
        return fields.every((field) => {
            if (field === 'plan') return !errors.plan;
            return !errors[field];
        });
    };

    const goAddServiceNext = async () => {
        const ok = await validateAddServiceStep(addServiceStep);
        if (!ok) return;
        setAddServiceStep((s) => Math.min(s + 1, ADD_SERVICE_STEPS.length - 1));
    };

    const goAddServiceBack = () => {
        setAddServiceStep((s) => Math.max(s - 1, 0));
    };

    // Open Create service wizard from Unconfigured authorize (?addService=1&...)
    useEffect(() => {
        if (searchParams.get('addService') !== '1') return;

        let cancelled = false;
        (async () => {
            const packageName = searchParams.get('package') || '';
            const planId = searchParams.get('planId') || '';
            const mikrotikName = searchParams.get('mikrotikName') || '';
            const mikrotikPassword = searchParams.get('mikrotikPassword') || '';
            const ticketId = searchParams.get('ticketId') || '';
            const actorName = searchParams.get('actor') || 'System';
            const customerCreated = searchParams.get('customerCreated') === '1';
            const installation = searchParams.get('installation') === '1';

            setPendingTicketMeta({
                ticketId: ticketId ? Number(ticketId) : null,
                actorName,
                customerCreated,
                packageName,
            });

            let plan = null;
            try {
                if (packageName) {
                    plan = await findPlanForPackage(packageName);
                }
            } catch (e) {
                console.warn(e);
            }

            if (cancelled) return;

            formikAdd.resetForm();
            formikAdd.setFieldValue('installation', installation);
            if (installation) {
                const start = billToForNewInstallation(new Date());
                formikAdd.setFieldValue('start_date', start);
                formikAdd.setFieldValue('bill_to', start);
                formikAdd.setFieldValue('due_date', start);
            }
            formikAdd.setFieldValue(
                'mikrotik_name',
                mikrotikName || buildMikrotikNameFromCustomer(data?.name || packageName)
            );
            formikAdd.setFieldValue(
                'mikrotik_password',
                mikrotikPassword || buildMikrotikPasswordFromPhone(data?.phone_number)
            );
            const groups = await loadPlanGroups();
            // Always land on Plan step so the tech can confirm or change speed/router.
            // Prefill from ticket package / planId when available.
            let prefilled = false;
            if (planId) {
                prefilled = selectPlanByIdInGroups(groups, planId);
            }
            if (!prefilled && plan?.id) {
                prefilled = selectPlanByIdInGroups(groups, plan.id);
                if (!prefilled) {
                    applySelectedPlan(plan);
                    const rate = plan.rate_limit?.label || plan.rate_limit?.value || '';
                    if (rate) setSelectedSpeedKey(String(rate).toUpperCase());
                }
            }
            if (!prefilled && !plan) {
                setSelectedSpeedKey(null);
                applySelectedPlan(null);
            }
            setAddServiceStep(0);
            setModal(true);

            // clear query so refresh doesn't reopen
            const next = new URLSearchParams(searchParams);
            ['addService', 'package', 'planId', 'mikrotikName', 'mikrotikPassword', 'ticketId', 'actor', 'customerCreated', 'installation'].forEach((k) => next.delete(k));
            setSearchParams(next, { replace: true });
        })();

        return () => {
            cancelled = true;
        };
        // intentionally once when landing with addService
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const toggleGenerateInvoice = () => {
        setGenerateInvoiceModal(!generateInvoiceModal);
    };

    const toggleEdit = () => {
        setEditModal(!editModal);
    };

    const toggleBillDate = () => {
        setEditBillDateModal(!editBillDateModal);
    };

    const togglePay = () => {
        setPayModal(!payModal);
    };

    const toggleMessage = () => {
        setMessageModal(!messageModal);
    };

    const togglePassword = () => {
        setPasswordModal(!passwordModal);
    };

    const toggleWifiDevices = () => setWifiDevicesModal((open) => !open);
    const toggleWifiPassword = () => {
        setWifiPasswordModal((open) => !open);
        setWifiPassState(false);
    };

    const wifiSourceLabel = {
        both: 'SmartOLT + TR-069',
        tr069: 'TR-069',
        smartolt: 'SmartOLT',
    }[wifiOverview?.source] || 'SmartOLT';

    // SmartOLT reports every provisioned SSID; the primary one is shown above.
    const extraWifiSsids = (wifiOverview?.ssids || []).filter(
        (entry) => entry.ssid && entry.ssid !== wifiOverview?.wifi_ssid
    );

    const primaryWifiPort =
        (wifiOverview?.ssids || []).find((entry) => entry.ssid === wifiOverview?.wifi_ssid)?.port
        || undefined;

    const copyWifiValue = (value) => {
        if (!value) return;
        try {
            navigator.clipboard.writeText(value);
            successToast("top-right", 'Copied to clipboard');
        } catch (_) {
            /* clipboard unavailable */
        }
    };

    const fetchPlans = async (search, loadedOptions, { page }) => {
        return http.get(`/get-plans?q=${search}&page=${page}`).then(result => {

            const res = result.data;

            return {
                options: res.options,
                hasMore: res.has_more,
                additional: {
                    page: page + 1,
                },
            };
        });
    }

    const loadPlanGroups = async () => {
        if (planGroups.length > 0) return planGroups;
        setPlanGroupsLoading(true);
        try {
            const result = await http.get('/get-plan-groups');
            const groups = Array.isArray(result.data?.groups) ? result.data.groups : [];
            setPlanGroups(groups);
            return groups;
        } catch (err) {
            console.warn('Failed to load plan groups', err);
            setPlanGroups([]);
            return [];
        } finally {
            setPlanGroupsLoading(false);
        }
    };

    const applySelectedPlan = (plan) => {
        if (!plan) {
            formikAdd.setFieldValue('plan', '');
            formikAdd.setFieldValue('price', '');
            return;
        }
        formikAdd.setFieldValue('plan', {
            id: plan.id,
            title: plan.title,
            price: plan.price,
            router_id: plan.router_id,
            router_name: plan.router_name,
            rate_limit: plan.rate_limit,
        });
        formikAdd.setFieldValue('price', plan.price ?? 0);
    };

    const selectPlanByIdInGroups = (groups, planId) => {
        const id = Number(planId);
        if (!id) return false;
        for (const group of groups || []) {
            const variant = (group.variants || []).find((v) => Number(v.id) === id);
            if (variant) {
                setSelectedSpeedKey(group.key);
                applySelectedPlan(variant);
                return true;
            }
        }
        return false;
    };

    const selectedSpeedGroup = planGroups.find((g) => g.key === selectedSpeedKey) || null;
    const speedOptions = planGroups.map((g) => ({
        value: g.key,
        label: g.label,
        group: g,
    }));
    const routerOptions = (selectedSpeedGroup?.variants || []).map((v) => ({
        value: v.id,
        label: v.router_name
            ? `${v.router_name}${v.price != null ? ` — KES ${v.price}` : ''}`
            : v.label,
        plan: v,
    }));
    const selectedSpeedOption = speedOptions.find((o) => o.value === selectedSpeedKey) || null;
    const selectedRouterOption =
        routerOptions.find((o) => Number(o.value) === Number(formikAdd.values.plan?.id)) || null;

    const fetchRouterPlans = async (search, loadedOptions, { page }) => {
        return http.get(`/get-router-plans/${serviceId}?q=${search}&page=${page}`).then(result => {

            const res = result.data;

            return {
                options: res.options,
                hasMore: res.has_more,
                additional: {
                    page: page + 1,
                },
            };
        });
    }

    const formikPay = useFormik({
        initialValues: {
            invoice_id: formDataPay?.id ?? 0,
            use_credit: (() => {
                const balance = Number(data?.balance ?? 0);
                const invoiceDue = Number(formDataPay?.due ?? 0);
                return balance > 0 && invoiceDue > 0 && balance + 0.009 >= invoiceDue;
            })(),
            customer_id: formDataPay?.customer_id ?? null,
            trans_id: '',
            payment_type: { label: "Mpesa", value: "mpesa" },
            date: '',
            sum: formDataPay?.due ?? 0,
        },
        enableReinitialize: true,
        validationSchema: Yup.object({
            trans_id: Yup.string()
                .when("use_credit", (use_credit) => {
                    if (use_credit === false) return Yup.string().required("Please enter an mpesa transaction id. The field cannot be left blank.").min(10, 'Invalid code, enter a valid mpesa transaction code!');
                }),
            sum: Yup.number("Must be a number type")
                .when("use_credit", (use_credit) => {
                    if (use_credit === false) return Yup.number('Must be a number type').required("Please enter a sum. The field cannot be left blank.").moreThan(0, 'Invalid sum, only a value greater than 0 is allowed!');
                }),
            date: Yup.string()
                .when("use_credit", (use_credit) => {
                    if (use_credit === false) return Yup.string().required();
                }),
        }),
        onSubmit: (data, { resetForm }) => {

            setFormLoading(true);
            http
                .post(`/add-payment`, {
                    invoice_id: data.invoice_id,
                    use_credit: data.use_credit,
                    customer_id: data.customer_id,
                    trans_id: data.trans_id,
                    payment_type: data.payment_type?.value,
                    payment_date: data.date ? new Date(data.date).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }) : data.date,
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
                        setReloadInvoices(!reloadInvoices);
                        setCust(!cust);
                        setReload(!reload);
                        triggerDataRefresh(['customers']);
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

    const formikMessage = useFormik({
        initialValues: {
            message_type: { label: "SMS", value: "sms" },
        },
        enableReinitialize: true,
        validationSchema: Yup.object().shape({
            message_type: Yup.object().shape({
                value: Yup.string().required('Message type is required')
            }),
        }),
        onSubmit: (data, { resetForm }) => {

            setFormLoading(true);
            http
                .post(`/send-welcome-message`, {
                    customer_id: id,
                    message_type: data.message_type,
                })
                .then(response => {
                    setFormLoading(false);
                    if (response.data?.status) {
                        successToast("top-right", response.data?.status);
                        resetForm();
                        toggleMessage();
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

    const formikPassword = useFormik({
        initialValues: {
            password: '',
        },
        enableReinitialize: true,
        validationSchema: Yup.object({
            password: Yup.string('Enter your password')
                .min(6, 'Password should be of minimum 6 characters length')
                .max(30, 'Password should be of maximum 30 characters length')
                .required('Password is required')
        }),
        onSubmit: (data, { resetForm }) => {

            setFormLoading(true);
            http
                .post(`/reset-customer-password`, {
                    customer_id: id,
                    password: data.password,
                })
                .then(response => {
                    setFormLoading(false);
                    if (response.data?.status) {
                        successToast("top-right", response.data?.status);
                        resetForm();
                        togglePassword();
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

    const formikWifiPassword = useFormik({
        initialValues: {
            ssid: wifiOverview?.wifi_ssid || '',
            password: wifiOverview?.wifi_password || '',
            confirm_password: wifiOverview?.wifi_password || '',
        },
        enableReinitialize: true,
        validationSchema: Yup.object({
            ssid: Yup.string('Enter Wi‑Fi name')
                .min(1, 'Wi‑Fi name is required')
                .max(32, 'Wi‑Fi name should be at most 32 characters')
                .required('Wi‑Fi name is required'),
            password: Yup.string('Enter Wi‑Fi password')
                .min(8, 'Wi‑Fi password must be at least 8 characters')
                .max(64, 'Wi‑Fi password should be at most 64 characters')
                .required('Wi‑Fi password is required'),
            confirm_password: Yup.string()
                .oneOf([Yup.ref('password'), null], 'Passwords must match')
                .required('Confirm password is required'),
        }),
        onSubmit: (formValues, { resetForm }) => {
            if (!connectivityServiceId) {
                execToast("top-right", 'Select a service first');
                return;
            }

            const primary = connectivity?.primary;
            const genieacsId = primary?.genieacsId || primary?.tr069?.genieacsId || null;
            const onuExternalId = primary?.onuExternalId || primary?.smartolt?.onuExternalId || null;
            const serialNumber = primary?.sn || primary?.serialNumber || primary?.smartolt?.sn || primary?.tr069?.serialNumber || null;

            setFormLoading(true);
            httpPortal
                .post(`/staff/wifi/password`, {
                    customer_id: Number(id),
                    service_id: connectivityServiceId,
                    ssid: formValues.ssid.trim(),
                    password: formValues.password,
                    wifi_port: primaryWifiPort,
                    ...(onuExternalId ? { onu_external_id: onuExternalId } : {}),
                    ...(genieacsId ? { genieacs_id: genieacsId } : {}),
                    ...(serialNumber ? { serial_number: serialNumber } : {}),
                })
                .then((response) => {
                    setFormLoading(false);
                    if (response.data?.success) {
                        successToast("top-right", response.data?.message || 'Wi‑Fi password updated');
                        resetForm();
                        toggleWifiPassword();
                        setReload((value) => !value);
                        triggerDataRefresh(['customers']);
                    } else {
                        execToast("top-right", response.data?.message || response.data?.error || 'Failed to update Wi‑Fi');
                    }
                })
                .catch((err) => {
                    setFormLoading(false);
                    const msg =
                        err.response?.data?.message ||
                        err.response?.data?.error ||
                        'Failed to update Wi‑Fi';
                    execToast("top-right", msg);
                });
        },
    });

    return (
        <>
            <Head title={`${data?.name ?? "Customer"}`} />
            <Content>
                <BlockHead size="sm" className="customer-view-head">
                    <BlockBetween className="g-3">
                        <BlockHeadContent>
                            <BlockTitle tag="h6" page className="fs-18">
                                Customers / <strong className="text-primary">View</strong> /
                            </BlockTitle>
                            {data && Object.keys(data)?.length > 0 && (
                                <BlockDes className="text-soft">
                                    <ul className="list-inline mb-0">
                                        <li><span className="large">{`${data.name} (${data.id})`}</span></li>
                                    </ul>
                                </BlockDes>
                            )}
                        </BlockHeadContent>
                        <BlockHeadContent className="flex-shrink-0">
                            <Button
                                color="light"
                                outline
                                className="bg-white d-none d-sm-inline-flex"
                                onClick={() => navigate(-1)}
                            >
                                <Icon name="arrow-left"></Icon>
                                <span>Back</span>
                            </Button>
                            <a
                                href="#back"
                                onClick={(ev) => {
                                    ev.preventDefault();
                                    navigate(-1);
                                }}
                                className="btn btn-icon btn-outline-light bg-white d-inline-flex d-sm-none"
                            >
                                <Icon name="arrow-left"></Icon>
                            </a>
                        </BlockHeadContent>
                    </BlockBetween>
                    {data && Object.keys(data)?.length > 0 && (
                        <div
                            className="customer-view-status-row mt-2 pt-2 pb-0"
                            style={{ borderTop: '1px solid rgba(160, 175, 185, 0.15)' }}
                        >
                            <div className="customer-view-connectivity">
                                {Array.isArray(dataServices) && dataServices.length > 1 && (
                                    <div className="mb-2">
                                        <select
                                            className="form-select form-select-sm"
                                            style={{ maxWidth: '280px' }}
                                            value={connectivityServiceId || ''}
                                            onChange={(e) => setConnectivityServiceId(Number(e.target.value))}
                                        >
                                            {dataServices.map((svc) => (
                                                <option key={svc.id} value={svc.id}>
                                                    {svc.mikrotik_name || `Service #${svc.id}`}
                                                    {svc.title ? ` — ${svc.title}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {connectivityLoading ? (
                                    <span className="text-muted small">
                                        <Spinner size="sm" className="me-1" /> Checking SmartOLT / TR-069…
                                    </span>
                                ) : connectivity?.primary ? (
                                    <>
                                        <div className="d-flex flex-wrap align-items-center gap-2">
                                            {connectivity.primary.router?.label && (
                                                <Badge color="dark" className="text-uppercase">
                                                    Router: {connectivity.primary.router.label}
                                                </Badge>
                                            )}
                                            {connectivity.primary.pppoeUsername && (
                                                <span className="small text-muted">
                                                    PPPoE: <strong>{connectivity.primary.pppoeUsername}</strong>
                                                </span>
                                            )}
                                            {connectivity.primary.source !== 'none' ? (
                                                <Badge color={connectivity.primary.online ? 'success' : 'danger'}>
                                                    {connectivity.primary.label}
                                                </Badge>
                                            ) : (
                                                <Badge color="warning">TR069 REQUIRED</Badge>
                                            )}
                                            {connectivity.primary.signal && (
                                                <span className="small">
                                                    Signal: <strong>{connectivity.primary.signal}</strong>
                                                    {connectivity.primary.signalLevel ? (
                                                        <span className="text-muted"> ({connectivity.primary.signalLevel})</span>
                                                    ) : null}
                                                </span>
                                            )}
                                        </div>
                                        {connectivity.primary.message && connectivity.primary.source === 'none' && (
                                            <div className="small text-warning mt-1">{connectivity.primary.message}</div>
                                        )}
                                    </>
                                ) : (
                                    <span className="small text-muted">No service connectivity data</span>
                                )}
                            </div>
                        </div>
                    )}
                </BlockHead>

                <Block className="customer-view-body">
                    <Nav tabs className="custom-tab customer-view-tabs">
                        <NavItem className={classnames({ active: activeTab === "1" })}>
                            <NavLink
                                tag="a"
                                href="#tab"
                                onClick={(ev) => {
                                    ev.preventDefault();
                                    toggle("1");
                                }}
                            >
                                Information
                            </NavLink>
                        </NavItem>
                        <NavItem className={classnames({ active: activeTab === "2" })}>
                            <NavLink
                                tag="a"
                                href="#tab"
                                onClick={(ev) => {
                                    ev.preventDefault();
                                    toggle("2");
                                }}
                            >
                                Services
                            </NavLink>
                        </NavItem>
                        <NavItem className={classnames({ active: activeTab === "3" })}>
                            <NavLink
                                tag="a"
                                href="#tab"
                                onClick={(ev) => {
                                    ev.preventDefault();
                                    toggle("3");
                                }}
                            >
                                Invoices
                            </NavLink>
                        </NavItem>
                        <NavItem className={classnames({ active: activeTab === "4" })}>
                            <NavLink
                                tag="a"
                                href="#tab"
                                onClick={(ev) => {
                                    ev.preventDefault();
                                    toggle("4");
                                }}
                            >
                                Documents
                            </NavLink>
                        </NavItem>
                        <NavItem className={classnames({ active: activeTab === "5" })}>
                            <NavLink
                                tag="a"
                                href="#tab"
                                onClick={(ev) => {
                                    ev.preventDefault();
                                    toggle("5");
                                }}
                            >
                                Statistics
                            </NavLink>
                        </NavItem>
                        <NavItem className={classnames({ active: activeTab === "6" })}>
                            <NavLink
                                tag="a"
                                href="#tab"
                                onClick={(ev) => {
                                    ev.preventDefault();
                                    toggle("6");
                                }}
                            >
                                Live traffic
                            </NavLink>
                        </NavItem>
                    </Nav>
                    <div className="tab-preview">
                        <TabContent activeTab={activeTab}>
                            <TabPane tabId="1" className="tab-content-inner">
                                {apiLoading ? <div className="ps-20 pe-20">Loading...</div> :
                                    <>
                                        <form className="is-alter custom-form" onSubmit={formik.handleSubmit}>
                                            <FocusError formik={formik} />
                                            <div className="customer-buttons-sidebar-wrapper sticky-sidebar">
                                                <div className="customer-name-wrapper">
                                                    <span className="customer-billing-balance-title">
                                                        Account balance: <b className="customer-balance" data-balance-id="5">KES {data?.balance ?? 0.00}</b>
                                                    </span>
                                                </div>
                                                <div className="customer-buttons-wrapper">
                                                    <Dropdown isOpen={open} className="btn-group" toggle={toggleAction}>
                                                        <DropdownToggle
                                                            tag="button"
                                                            className="btn btn-outline-dark dropdown-toggle dropend"
                                                            onClick={(ev) => {
                                                                ev.preventDefault();
                                                            }}
                                                        >
                                                            <span>Actions</span>
                                                            <em className="icon ni ni-chevron-down" style={{ paddingLeft: '0' }}></em>
                                                        </DropdownToggle>
                                                        <DropdownMenu>
                                                            <ul className="link-list">
                                                                <li>
                                                                    <a href={undefined} onClick={(ev) => {
                                                                        ev.preventDefault();
                                                                        toggleAction();
                                                                        toggleMessage();
                                                                    }}>
                                                                        Send welcome message
                                                                    </a>
                                                                </li>
                                                            </ul>
                                                        </DropdownMenu>
                                                    </Dropdown>
                                                    <div className="btn-group">
                                                        <button
                                                            type="button"
                                                            className="btn btn-outline-dark"
                                                            onClick={openCustomerMpesaTransactions}
                                                        >
                                                            Mpesa
                                                        </button>
                                                    </div>
                                                    <div className="btn-group">
                                                        <button
                                                            type="button"
                                                            className="btn btn-outline-dark"
                                                            onClick={openCreateTicketForCustomer}
                                                        >
                                                            Create Ticket
                                                        </button>
                                                    </div>
                                                    <div className="btn-group">
                                                        <button type="submit" className="btn btn-primary">
                                                            {loading ? <Spinner size="sm" color="light" /> : "Save"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <Row className="g-3 align-items-start customer-info-wifi-row">
                                                <Col lg="8" xl="9">
                                            <div className="card-block">
                                                <div className="gy-3">
                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label">
                                                                    Billing type
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <RSelect name="billing_type" options={filteredBillingTypeOptions} value={formik.values.billing_type}
                                                                        onChange={(option) => formik.setFieldValue("billing_type", option)} />
                                                                    {formik.touched.billing_type && formik.errors.billing_type ? (<p className="invalid">{formik.errors.billing_type}</p>) : null}
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>

                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label">
                                                                    Category
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <RSelect options={categoryOptions} value={formik.values.category}
                                                                        onChange={(option) => formik.setFieldValue("category", option)} />
                                                                    {formik.touched.category && formik.errors.category ? (<p className="invalid">{formik.errors.category}</p>) : null}
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>
                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="name">
                                                                    Full name
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
                                                                <label className="form-label" htmlFor="phone_number">
                                                                    Phone number
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <input
                                                                        type="text"
                                                                        id="phone_number"
                                                                        className={classnames(
                                                                            'form-control',
                                                                            {
                                                                                'is-invalid': formik.touched.phone_number && formik.errors.phone_number
                                                                            }
                                                                        )}
                                                                        name="phone_number"
                                                                        value={formik.values.phone_number}
                                                                        onChange={formik.handleChange}
                                                                    />
                                                                    {formik.touched.phone_number && formik.errors.phone_number ? (<p className="invalid">{formik.errors.phone_number}</p>) : null}
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>

                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="password">
                                                                    Password
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <input type="button" className="btn btn-outline-primary btn-password" value="Reset" onClick={(ev) => {
                                                                ev.preventDefault();
                                                                togglePassword();
                                                            }} />
                                                        </Col>
                                                    </Row>

                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="dob">
                                                                    Date of birth
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <input
                                                                        type="text"
                                                                        id="dob"
                                                                        className={classnames(
                                                                            'form-control',
                                                                            {
                                                                                'is-invalid': formik.touched.dob && formik.errors.dob
                                                                            }
                                                                        )}
                                                                        name="dob"
                                                                        value={formik.values.dob}
                                                                        onChange={formik.handleChange}
                                                                    />
                                                                    {formik.touched.dob && formik.errors.dob ? (<p className="invalid">{formik.errors.dob}</p>) : null}
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>

                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="address">
                                                                    Address
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <input
                                                                        type="text"
                                                                        id="address"
                                                                        className={classnames(
                                                                            'form-control',
                                                                            {
                                                                                'is-invalid': formik.touched.address && formik.errors.address
                                                                            }
                                                                        )}
                                                                        name="address"
                                                                        value={formik.values.address}
                                                                        onChange={formik.handleChange}
                                                                    />
                                                                    {formik.touched.address && formik.errors.address ? (<p className="invalid">{formik.errors.address}</p>) : null}
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>

                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="city">
                                                                    City
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <input
                                                                        type="text"
                                                                        id="city"
                                                                        className={classnames(
                                                                            'form-control',
                                                                            {
                                                                                'is-invalid': formik.touched.city && formik.errors.city
                                                                            }
                                                                        )}
                                                                        name="city"
                                                                        value={formik.values.city}
                                                                        onChange={formik.handleChange}
                                                                    />
                                                                    {formik.touched.city && formik.errors.city ? (<p className="invalid">{formik.errors.city}</p>) : null}
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>

                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="router_sn">
                                                                    Router SN
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <input
                                                                        type="text"
                                                                        id="router_sn"
                                                                        className="form-control"
                                                                        name="router_sn"
                                                                        value={
                                                                            connectivity?.primary?.sn
                                                                            || connectivity?.primary?.smartolt?.sn
                                                                            || wifiOverview?.serial_number
                                                                            || ''
                                                                        }
                                                                        readOnly
                                                                        disabled
                                                                        placeholder={connectivityLoading ? 'Loading…' : 'Not available'}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>

                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="olt_name">
                                                                    OLT
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <input
                                                                        type="text"
                                                                        id="olt_name"
                                                                        className="form-control"
                                                                        name="olt_name"
                                                                        value={
                                                                            connectivity?.primary?.oltName
                                                                            || connectivity?.primary?.smartolt?.oltName
                                                                            || ''
                                                                        }
                                                                        readOnly
                                                                        disabled
                                                                        placeholder={connectivityLoading ? 'Loading…' : 'Not available'}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>

                                                    <Row>
                                                        <Col md="12">
                                                            <div className="form-group mt-2">
                                                                <Button type="submit" color="primary" className="pull-right">
                                                                    {loading ? <Spinner size="sm" color="light" /> : "Save"}
                                                                </Button>
                                                            </div>
                                                        </Col>
                                                    </Row>
                                                </div>
                                            </div>
                                                </Col>
                                                <Col lg="4" xl="3">
                                                    <div className="customer-info-side-stack">
                                                    <div className="card-block customer-wifi-info-card">
                                                        <div className="customer-wifi-info-head">
                                                            <div className="d-flex align-items-center gap-2">
                                                                <Icon name="wifi" className="text-primary" />
                                                                <span className="customer-wifi-info-title">Wi‑Fi</span>
                                                            </div>
                                                            <Badge color={wifiOverview?.success === false ? 'secondary' : 'success'} pill>
                                                                {wifiLoading || wifiDevicesLoading
                                                                    ? '…'
                                                                    : `${wifiOverview?.device_count ?? 0} online`}
                                                            </Badge>
                                                        </div>
                                                        <div className="customer-wifi-info-body">
                                                            <div className="customer-wifi-info-label">
                                                                SSID
                                                                {wifiOverview?.source ? (
                                                                    <span className="text-soft ms-1">· {wifiSourceLabel}</span>
                                                                ) : null}
                                                            </div>
                                                            <div className="customer-wifi-info-ssid" title={wifiOverview?.wifi_ssid || ''}>
                                                                {wifiLoading
                                                                    ? 'Loading…'
                                                                    : (wifiOverview?.wifi_ssid || wifiOverview?.message || 'Unavailable')}
                                                            </div>

                                                            {wifiOverview?.wifi_password ? (
                                                                <>
                                                                    <div className="customer-wifi-info-label">Password</div>
                                                                    <div
                                                                        className="customer-wifi-info-secret"
                                                                        role="button"
                                                                        tabIndex={0}
                                                                        title="Click to copy"
                                                                        onClick={() => copyWifiValue(wifiOverview.wifi_password)}
                                                                        onKeyDown={(ev) => {
                                                                            if (ev.key === 'Enter' || ev.key === ' ') {
                                                                                ev.preventDefault();
                                                                                copyWifiValue(wifiOverview.wifi_password);
                                                                            }
                                                                        }}
                                                                    >
                                                                        {wifiOverview.wifi_password}
                                                                    </div>
                                                                </>
                                                            ) : null}

                                                            {extraWifiSsids.length > 0 ? (
                                                                <div className="customer-wifi-info-extra">
                                                                    {extraWifiSsids.map((entry) => (
                                                                        <div key={entry.port || entry.ssid} className="customer-wifi-info-extra-row">
                                                                            <span className="customer-wifi-info-extra-name">{entry.ssid}</span>
                                                                            {entry.password ? (
                                                                                <span
                                                                                    className="customer-wifi-info-extra-pass"
                                                                                    role="button"
                                                                                    tabIndex={0}
                                                                                    title="Click to copy"
                                                                                    onClick={() => copyWifiValue(entry.password)}
                                                                                    onKeyDown={(ev) => {
                                                                                        if (ev.key === 'Enter' || ev.key === ' ') {
                                                                                            ev.preventDefault();
                                                                                            copyWifiValue(entry.password);
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    {entry.password}
                                                                                </span>
                                                                            ) : null}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : null}
                                                            <div className="customer-wifi-info-actions">
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    color="light"
                                                                    className="btn-dim"
                                                                    onClick={(ev) => {
                                                                        ev.preventDefault();
                                                                        toggleWifiDevices();
                                                                    }}
                                                                    disabled={wifiLoading || !wifiOverview?.success}
                                                                >
                                                                    Devices
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    color="primary"
                                                                    outline
                                                                    onClick={(ev) => {
                                                                        ev.preventDefault();
                                                                        toggleWifiPassword();
                                                                    }}
                                                                    disabled={!connectivityServiceId || wifiLoading || !wifiOverview?.success}
                                                                >
                                                                    Password
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="customer-ticket-summary border-0 bg-transparent p-0 text-start w-100"
                                                        onClick={openCustomerTicketsList}
                                                        title="View all tickets for this customer"
                                                    >
                                                        <div className="customer-ticket-summary-inner customer-ticket-info-card">
                                                            <div className="customer-ticket-summary-top justify-content-between">
                                                                <span className="d-flex align-items-center gap-2">
                                                                    <Icon name="ticket" className="text-primary" />
                                                                    <span className="customer-ticket-summary-label">Tickets</span>
                                                                </span>
                                                                <Badge color="primary" pill className="px-2">
                                                                    {ticketSummary.loading ? '…' : ticketSummary.count}
                                                                </Badge>
                                                            </div>
                                                            <div className="customer-ticket-summary-meta align-items-start">
                                                                <span className="customer-ticket-summary-caption">Last ticket</span>
                                                                {ticketSummary.lastTicket ? (
                                                                    <>
                                                                        <span className="customer-ticket-summary-type">
                                                                            {(ticketSummary.lastTicket.type_label || ticketSummary.lastTicket.type_name || ticketSummary.lastTicket.type || 'General')}
                                                                        </span>
                                                                        <span className="customer-ticket-summary-date">
                                                                            {dateFormat(ticketSummary.lastTicket.created_at || ticketSummary.lastTicket.createdAt, 'd mmm yyyy, h:MM TT')}
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <span className="customer-ticket-summary-empty">No tickets yet</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="customer-onu-open border-0 bg-transparent p-0 text-start w-100"
                                                        onClick={openOnuWeb}
                                                        disabled={onuLoading || !connectivityServiceId}
                                                        title="Open customer ONU / router web UI"
                                                    >
                                                        <div className="customer-onu-open-inner customer-onu-info-card">
                                                            <div className="customer-onu-open-top">
                                                                <span className="d-flex align-items-center gap-2">
                                                                    <Icon name="router" className="text-danger" />
                                                                    <span className="customer-onu-open-label">
                                                                        {onuLoading ? 'Opening ONU…' : 'Open ONU'}
                                                                    </span>
                                                                </span>
                                                                {onuLoading ? (
                                                                    <Spinner size="sm" color="danger" />
                                                                ) : (
                                                                    <Icon name="external" className="text-danger" />
                                                                )}
                                                            </div>
                                                            <div className="customer-onu-open-meta">
                                                                <span className="customer-onu-open-caption">
                                                                    Router web portal via hub proxy
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                    </div>
                                                </Col>
                                            </Row>
                                        </form>
                                        <CustomerLocationMap
                                            location={ticketLocation}
                                            loading={ticketLocationLoading}
                                            phone={data?.phone_number}
                                        />
                                        {(all_roles.includes("super-administrator") || all_roles.includes("administrator")) &&
                                            <div className="card-block mt-3">
                                                <div className="gy-3">
                                                    <div className="card-block-header d-flex justify-content-between" style={{ borderBottom: '1px solid rgba(160, 175, 185, 0.15)' }}>
                                                        <div>Account Balance: <strong>{data?.balance ?? 0}</strong></div>
                                                        <Link to={`/admin/credit/${id}`} className="btn btn-sm btn-primary">
                                                            <Icon name="plus"></Icon>
                                                            <span>Add/Deduct</span>
                                                        </Link>
                                                    </div>
                                                    <div className="card-block-body">
                                                        <div className="timeline">
                                                            {
                                                                data && data.balances?.map((item) => (
                                                                    <div className="tl-item" key={item.id}>
                                                                        <div className={"tl-dot " + (item.amount < 0 ? 'border-danger' : 'border-success')}>
                                                                        </div>
                                                                        <div className="tl-content">
                                                                            <div>
                                                                                <span style={{ color: '#6576ff' }}>Credits: {Math.abs(item.amount)}</span>
                                                                                <span> - {item.reason}</span>
                                                                            </div>
                                                                            <small className="text-muted"><TimeAgo date={item.created_at} locale="en-US" /> ({dateFormat(item.created_at, "mmmm dS, yyyy HH:MM")})</small>
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        }
                                    </>
                                }
                            </TabPane>
                            <TabPane tabId="2" className="tab-content-inner">
                                <div className="text-end pb-2">
                                    <div className="btn btn-primary" onClick={() => toggleAdd()}>
                                        <span>Add service</span>
                                    </div>
                                </div>
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
                                        data={dataServices}
                                        columns={columns}
                                        defaultSortFieldId={1}
                                        defaultSortAsc={true}
                                        sortServer
                                        onSort={handleSort}
                                        progressPending={api2Loading}
                                        //selectableRows={true}
                                        //selectableRowsComponent={CustomCheckbox}
                                        //clearSelectedRows={toggleCleared}
                                        //expandableRowsComponent={ExpandableRowComponent}
                                        //expandableRows
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
                            </TabPane>
                            <TabPane tabId="3" className="tab-content-inner">
                                <div className="text-end pb-2 d-flex justify-content-end g-2">
                                    <button type="button" className="btn btn-outline-dark me-2" onClick={openCustomerMpesaTransactions}>
                                        <span>Mpesa</span>
                                    </button>
                                    <button type="button" className="btn btn-outline-dark me-2" onClick={openCreateTicketForCustomer}>
                                        <span>Create Ticket</span>
                                    </button>
                                    <div className="btn btn-primary" onClick={() => toggleGenerateInvoice()}>
                                        <span>Generate invoice</span>
                                    </div>
                                </div>
                                <div className="dataTables_wrapper dt-bootstrap4 no-footer">
                                    <Row className="justify-between g-2 with-export">
                                        <Col className="col-7 text-start" sm="4">
                                            <div id="DataTables_Table_1_filter" className="dataTables_filter">
                                                <label>
                                                    <input
                                                        type="search"
                                                        className="form-control form-control-sm"
                                                        placeholder="Search by name"
                                                        onChange={(ev) => {
                                                            setSearchTextInvoices(ev.target.value);
                                                            setPageInvoices(1);
                                                        }
                                                        }
                                                    />
                                                </label>
                                            </div>
                                        </Col>
                                        <Col className="col-5 text-end" sm="8">
                                            <div className="datatable-filter">
                                                <div className="d-flex justify-content-end g-2">
                                                    <Export data={dataInvoices} />
                                                    <div className="dataTables_length" id="DataTables_Table_1_length">
                                                        <label>
                                                            <span className="d-none d-sm-inline-block">Show</span>
                                                            <div className="form-control-select">
                                                                {" "}
                                                                <select
                                                                    name="DataTables_Table_1_length"
                                                                    className="custom-select custom-select-sm form-control form-control-sm"
                                                                    onChange={(e) => handlePerRowsChangeInvoices(e, perPageInvoices)}
                                                                    value={perPageInvoices}
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
                                        data={dataInvoices}
                                        columns={columnsInvoices}
                                        defaultSortFieldId={1}
                                        defaultSortAsc={true}
                                        sortServer
                                        onSort={handleSortInvoices}
                                        progressPending={apiInvoicesLoading}
                                        //selectableRows={true}
                                        //selectableRowsComponent={CustomCheckbox}
                                        //clearSelectedRows={toggleCleared}
                                        //expandableRowsComponent={ExpandableRowComponent}
                                        //expandableRows
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
                                                customItemPerPage={perPageInvoices}
                                                itemPerPage={perPageInvoices}
                                                totalItems={totalRowsInvoices}
                                                paginate={handlePageChangeInvoices}
                                                currentPage={pageInvoices}
                                                onChangeRowsPerPage={handlePerRowsChangeInvoices}
                                                setRowsPerPage={setPerPageInvoices}
                                            />
                                        )}
                                    ></DataTable>
                                </div>
                            </TabPane>
                            <TabPane tabId="4" className="tab-content-inner">
                                <DocumentsTab customerId={id} active={activeTab === "4"} />
                            </TabPane>
                            <TabPane tabId="5" className="tab-content-inner">
                                <StatsTab customer_id={id} />
                            </TabPane>
                            <TabPane tabId="6" className="tab-content-inner">
                                <CustomerPppoeStatsCard
                                    customerId={id}
                                    serviceId={connectivityServiceId}
                                    active={activeTab === "6"}
                                />
                            </TabPane>
                        </TabContent>
                    </div>
                </Block>
            </Content>

            <Modal isOpen={modal} toggle={toggleAdd} className="modal-md">
                <ModalHeader toggle={toggleAdd}>
                    Create service
                    <div className="text-soft small fw-normal mt-1">
                        Step {addServiceStep + 1} of {ADD_SERVICE_STEPS.length}: {ADD_SERVICE_STEPS[addServiceStep].title}
                    </div>
                </ModalHeader>
                <ModalBody>
                    <form className="gy-3 is-alter custom-form" onSubmit={formikAdd.handleSubmit}>
                        <FocusError formik={formikAdd} />

                        <div className="d-flex flex-wrap g-1 mb-3">
                            {ADD_SERVICE_STEPS.map((step, index) => (
                                <span
                                    key={step.key}
                                    className={`badge ${index === addServiceStep ? 'bg-primary' : index < addServiceStep ? 'bg-success' : 'bg-light text-dark'}`}
                                >
                                    {index + 1}. {step.title}
                                </span>
                            ))}
                        </div>

                        {addServiceStep === 0 && (
                            <>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label">Speed</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <RSelect
                                                    options={speedOptions}
                                                    isLoading={planGroupsLoading}
                                                    value={selectedSpeedOption}
                                                    placeholder={planGroupsLoading ? 'Loading speeds…' : 'Select speed (e.g. 5 Mbps)'}
                                                    onChange={(option) => {
                                                        setSelectedSpeedKey(option?.value || null);
                                                        applySelectedPlan(null);
                                                    }}
                                                />
                                                <small className="text-soft">Same speed across all networks — pick the router next.</small>
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label">Router / network</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <RSelect
                                                    options={routerOptions}
                                                    isDisabled={!selectedSpeedKey}
                                                    value={selectedRouterOption}
                                                    placeholder={selectedSpeedKey ? 'Select router (e.g. Faiba 2)' : 'Select speed first'}
                                                    onChange={(option) => {
                                                        applySelectedPlan(option?.plan || null);
                                                    }}
                                                />
                                                {formikAdd.touched.plan && formikAdd.errors.plan ? (
                                                    <p className="invalid">{formikAdd.errors.plan?.id}</p>
                                                ) : null}
                                                {formikAdd.values.plan?.title ? (
                                                    <small className="text-soft d-block mt-1">
                                                        Plan: <strong>{formikAdd.values.plan.title}</strong>
                                                        {formikAdd.values.plan.router_name
                                                            ? ` → ${formikAdd.values.plan.router_name}`
                                                            : ''}
                                                    </small>
                                                ) : null}
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                            </>
                        )}

                        {addServiceStep === 1 && (
                            <>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="installation">New installation</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="custom-control custom-checkbox notext">
                                                <input
                                                    type="checkbox"
                                                    className="custom-control-input"
                                                    id="installation"
                                                    name="installation"
                                                    onChange={(e) => {
                                                        const checked = e.currentTarget.checked;
                                                        formikAdd.setFieldValue("installation", checked);
                                                        if (checked) {
                                                            const start = billToForNewInstallation(formikAdd.values.start_date);
                                                            formikAdd.setFieldValue("bill_to", start);
                                                            formikAdd.setFieldValue("due_date", start);
                                                        } else {
                                                            const next = billToForRecurringAdd(formikAdd.values.billing_period, formikAdd.values.start_date);
                                                            formikAdd.setFieldValue("bill_to", next);
                                                            formikAdd.setFieldValue("due_date", next);
                                                        }
                                                    }}
                                                    checked={formikAdd.values.installation}
                                                />
                                                <label className="custom-control-label" htmlFor="installation"></label>
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="generate_invoice">Generate invoice</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="custom-control custom-checkbox notext">
                                                <input
                                                    type="checkbox"
                                                    className="custom-control-input"
                                                    id="generate_invoice"
                                                    name="generate_invoice"
                                                    onChange={(e) => formikAdd.setFieldValue("generate_invoice", e.currentTarget.checked)}
                                                    checked={formikAdd.values.generate_invoice}
                                                />
                                                <label className="custom-control-label" htmlFor="generate_invoice"></label>
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                {formikAdd.values.generate_invoice && (
                                    <Row className="align-center">
                                        <Col md="8" className="offset-md-4">
                                            <div className="form-group">
                                                Available Credit: <strong>{data?.balance ?? 0}</strong>
                                            </div>
                                        </Col>
                                    </Row>
                                )}
                                {data?.balance > 0 && formikAdd.values.generate_invoice && (
                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label" htmlFor="use_credit">Use credit</label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="custom-control custom-checkbox notext">
                                                    <input
                                                        type="checkbox"
                                                        className="custom-control-input"
                                                        id="use_credit"
                                                        name="use_credit"
                                                        onChange={(e) => formikAdd.setFieldValue("use_credit", e.currentTarget.checked)}
                                                        checked={formikAdd.values.use_credit}
                                                    />
                                                    <label className="custom-control-label" htmlFor="use_credit"></label>
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>
                                )}
                                {formikAdd.values.generate_invoice && (
                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label" htmlFor="due_date">Invoice due date</label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <DatePicker
                                                        selected={formikAdd.values.due_date}
                                                        className={classnames('form-control date-picker', {
                                                            'is-invalid': formikAdd.touched.due_date && formikAdd.errors.due_date
                                                        })}
                                                        onChange={(date) => formikAdd.setFieldValue("due_date", date)}
                                                        name="due_date"
                                                        dateFormat="dd/MM/yyyy"
                                                        customInput={<ExampleCustomInput>{formikAdd.touched.due_date && formikAdd.errors.due_date ? (<p className="invalid">{formikAdd.errors.due_date}</p>) : null}</ExampleCustomInput>}
                                                    />
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>
                                )}
                            </>
                        )}

                        {addServiceStep === 2 && (
                            <>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="mikrotik_name">
                                                Mikrotik name
                                                <span className="text-secondary">&nbsp;(required)</span>
                                            </label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <input
                                                    type="text"
                                                    id="mikrotik_name"
                                                    className={classnames('form-control', {
                                                        'is-invalid': formikAdd.touched.mikrotik_name && formikAdd.errors.mikrotik_name
                                                    })}
                                                    name="mikrotik_name"
                                                    value={formikAdd.values.mikrotik_name}
                                                    onChange={formikAdd.handleChange}
                                                />
                                                {formikAdd.touched.mikrotik_name && formikAdd.errors.mikrotik_name ? (<p className="invalid">{formikAdd.errors.mikrotik_name}</p>) : null}
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="mikrotik_password">
                                                Mikrotik password
                                                <span className="text-secondary">&nbsp;(required)</span>
                                            </label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <a
                                                    href="#passwordAdd"
                                                    onClick={(ev) => {
                                                        ev.preventDefault();
                                                        setPassStateAdd(!passStateAdd);
                                                    }}
                                                    className={`form-icon form-icon-right passcode-switch ${passStateAdd ? "is-hidden" : "is-shown"}`}
                                                >
                                                    <Icon name="eye" className="passcode-icon icon-show"></Icon>
                                                    <Icon name="eye-off" className="passcode-icon icon-hide"></Icon>
                                                </a>
                                                <input
                                                    type={passStateAdd ? "text" : "password"}
                                                    id="mikrotik_password"
                                                    className={classnames(
                                                        `form-control${passStateAdd ? " is-hidden" : " is-shown"}`,
                                                        { 'is-invalid': formikAdd.touched.mikrotik_password && formikAdd.errors.mikrotik_password }
                                                    )}
                                                    name="mikrotik_password"
                                                    value={formikAdd.values.mikrotik_password}
                                                    onChange={formikAdd.handleChange}
                                                />
                                                {formikAdd.touched.mikrotik_password && formikAdd.errors.mikrotik_password ? (<p className="invalid">{formikAdd.errors.mikrotik_password}</p>) : null}
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                {formikAdd.values.installation && formikAdd.values.generate_invoice && (
                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label" htmlFor="installation_fee">Installation fee</label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <input
                                                        type="number"
                                                        id="installation_fee"
                                                        className={classnames('form-control', {
                                                            'is-invalid': formikAdd.touched.installation_fee && formikAdd.errors.installation_fee
                                                        })}
                                                        name="installation_fee"
                                                        value={formikAdd.values.installation_fee}
                                                        onChange={formikAdd.handleChange}
                                                    />
                                                    {formikAdd.touched.installation_fee && formikAdd.errors.installation_fee ? (<p className="invalid">{formikAdd.errors.installation_fee}</p>) : null}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>
                                )}
                            </>
                        )}

                        {addServiceStep === 3 && (
                            <>
                                <p className="text-soft small mb-3">
                                    These stay on the usual defaults. Change only if needed, then Add.
                                </p>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="price">Price</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <input
                                                    type="number"
                                                    id="price"
                                                    className={classnames('form-control', {
                                                        'is-invalid': formikAdd.touched.price && formikAdd.errors.price
                                                    })}
                                                    name="price"
                                                    value={formikAdd.values.price}
                                                    onChange={formikAdd.handleChange}
                                                />
                                                {formikAdd.touched.price && formikAdd.errors.price ? (<p className="invalid">{formikAdd.errors.price}</p>) : null}
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="start_date">Start date</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <DatePicker
                                                    selected={formikAdd.values.start_date}
                                                    className={classnames('form-control date-picker', {
                                                        'is-invalid': formikAdd.touched.start_date && formikAdd.errors.start_date
                                                    })}
                                                    onChange={(date) => {
                                                        formikAdd.setFieldValue("start_date", date);
                                                        if (formikAdd.values.installation) {
                                                            const start = billToForNewInstallation(date);
                                                            formikAdd.setFieldValue("bill_to", start);
                                                            formikAdd.setFieldValue("due_date", start);
                                                        }
                                                    }}
                                                    name="start_date"
                                                    dateFormat="dd/MM/yyyy"
                                                    customInput={<ExampleCustomInput>{formikAdd.touched.start_date && formikAdd.errors.start_date ? (<p className="invalid">{formikAdd.errors.start_date}</p>) : null}</ExampleCustomInput>}
                                                />
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="end_date">End date</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <DatePicker
                                                    selected={formikAdd.values.end_date}
                                                    className="form-control date-picker"
                                                    onChange={(date) => formikAdd.setFieldValue("end_date", date)}
                                                    name="end_date"
                                                    dateFormat="dd/MM/yyyy"
                                                    customInput={<ExampleCustomInput >{formikAdd.touched.end_date && formikAdd.errors.end_date ? (<p className="invalid">{formikAdd.errors.end_date}</p>) : null}</ExampleCustomInput>}
                                                />
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label">Billing type</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <RSelect name="billing_type" options={filteredBillingTypeOptions} value={formikAdd.values.billing_type}
                                                    onChange={(option) => formikAdd.setFieldValue("billing_type", option)} />
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label">Billing period</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <RSelect name="billing_period" options={billingPeriodOptions} value={formikAdd.values.billing_period}
                                                    onChange={(option) => {
                                                        formikAdd.setFieldValue("billing_period", option);
                                                        if (formikAdd.values.installation) {
                                                            const start = billToForNewInstallation(formikAdd.values.start_date);
                                                            formikAdd.setFieldValue("bill_to", start);
                                                            formikAdd.setFieldValue("due_date", start);
                                                            return;
                                                        }
                                                        const next = billToForRecurringAdd(option, formikAdd.values.start_date);
                                                        formikAdd.setFieldValue("bill_to", next);
                                                        formikAdd.setFieldValue("due_date", next);
                                                    }} />
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="bill_to">Bill to</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <DatePicker
                                                    selected={formikAdd.values.bill_to}
                                                    className="form-control date-picker"
                                                    onChange={(date) => {
                                                        formikAdd.setFieldValue("bill_to", date);
                                                        formikAdd.setFieldValue("due_date", date);
                                                    }}
                                                    name="bill_to"
                                                    dateFormat="dd/MM/yyyy"
                                                    customInput={<ExampleCustomInput >{formikAdd.touched.bill_to && formikAdd.errors.bill_to ? (<p className="invalid">{formikAdd.errors.bill_to}</p>) : null}</ExampleCustomInput>}
                                                />
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                                <Row className="align-center">
                                    <Col md="4" className="col-form-label">
                                        <div className="form-group">
                                            <label className="form-label">Status</label>
                                        </div>
                                    </Col>
                                    <Col md="8">
                                        <div className="form-group">
                                            <div className="form-control-wrap">
                                                <RSelect name="status" options={serviceOptions} value={formikAdd.values.status}
                                                    onChange={(option) => formikAdd.setFieldValue("status", option)} />
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                            </>
                        )}

                        <Row>
                            <Col md="12">
                                <div className="form-group mt-3 d-flex justify-content-between">
                                    <div>
                                        {addServiceStep > 0 && (
                                            <Button type="button" color="light" onClick={goAddServiceBack}>
                                                Back
                                            </Button>
                                        )}
                                    </div>
                                    <div className="d-flex g-2">
                                        {addServiceStep < ADD_SERVICE_STEPS.length - 1 ? (
                                            <Button type="button" color="primary" onClick={goAddServiceNext}>
                                                Next
                                            </Button>
                                        ) : (
                                            <Button type="submit" color="primary">
                                                {formLoading ? <Spinner size="sm" color="light" /> : "Add"}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                    </form>
                </ModalBody>
                <ModalFooter>
                    <Button
                        className="p-0 m-0"
                        onClick={() => {
                            toggleAdd();
                        }}
                    >
                        Close
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal isOpen={editModal} toggle={toggleEdit} className="modal-md">
                <ModalHeader toggle={toggleEdit}>Edit service</ModalHeader>
                <ModalBody>
                    {api3Loading ? <p>Loading...</p> :
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
                                        <label className="form-label">
                                            Plan
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <AsyncPaginate
                                                className={`react-select-container`}
                                                classNamePrefix="react-select"
                                                cacheOptions
                                                defaultOptions
                                                getOptionLabel={e => e.title}
                                                getOptionValue={e => e.id}
                                                loadOptions={fetchRouterPlans}
                                                value={formikEdit.values.plan}
                                                placeholder="Select plan"
                                                //onInputChange={(value) => console.log(value)}
                                                onChange={
                                                    (option) => {
                                                        formikEdit.setFieldValue("plan", option);
                                                        formikEdit.setFieldValue("price", option?.price);
                                                    }
                                                }
                                                additional={{
                                                    page: 1,
                                                }}
                                            //isDisabled={true}
                                            />
                                            {formikEdit.touched.plan && formikEdit.errors.plan ? (<p className="invalid">{formikEdit.errors.plan}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                            {formikEdit.values.plan !== '' &&
                                <>
                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label" htmlFor="mikrotik_name">
                                                    Mikrotik name
                                                    <span className="text-secondary">&nbsp;(required)</span>
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <input
                                                        type="text"
                                                        id="mikrotik_name"
                                                        className={classnames(
                                                            'form-control',
                                                            {
                                                                'is-invalid': formikEdit.touched.mikrotik_name && formikEdit.errors.mikrotik_name
                                                            }
                                                        )}
                                                        name="mikrotik_name"
                                                        value={formikEdit.values.mikrotik_name}
                                                        onChange={formikEdit.handleChange}
                                                    />
                                                    {formikEdit.touched.mikrotik_name && formikEdit.errors.mikrotik_name ? (<p className="invalid">{formikEdit.errors.mikrotik_name}</p>) : null}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label" htmlFor="mikrotik_password">
                                                    Mikrotik password
                                                    <span className="text-secondary">&nbsp;(required)</span>
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <a
                                                        href="#passwordEdit"
                                                        onClick={(ev) => {
                                                            ev.preventDefault();
                                                            setPassStateEdit(!passStateEdit);
                                                        }}
                                                        className={`form-icon form-icon-right passcode-switch ${passStateEdit ? "is-hidden" : "is-shown"}`}
                                                    >
                                                        <Icon name="eye" className="passcode-icon icon-show"></Icon>

                                                        <Icon name="eye-off" className="passcode-icon icon-hide"></Icon>
                                                    </a>
                                                    <input
                                                        type={passStateEdit ? "text" : "password"}
                                                        id="mikrotik_password"
                                                        className={classnames(
                                                            `form-control${passStateEdit ? " is-hidden" : " is-shown"}`,
                                                            {
                                                                'is-invalid': formikEdit.touched.mikrotik_password && formikEdit.errors.mikrotik_password
                                                            }
                                                        )}
                                                        name="mikrotik_password"
                                                        value={formikEdit.values.mikrotik_password}
                                                        onChange={formikEdit.handleChange}
                                                    />
                                                    {formikEdit.touched.mikrotik_password && formikEdit.errors.mikrotik_password ? (<p className="invalid">{formikEdit.errors.mikrotik_password}</p>) : null}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label" htmlFor="price">
                                                    Price
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <input
                                                        type="number"
                                                        id="price"
                                                        className={classnames(
                                                            'form-control',
                                                            {
                                                                'is-invalid': formikEdit.touched.price && formikEdit.errors.price
                                                            }
                                                        )}
                                                        name="price"
                                                        value={formikEdit.values.price}
                                                        onChange={formikEdit.handleChange}
                                                    />
                                                    {formikEdit.touched.price && formikEdit.errors.price ? (<p className="invalid">{formikEdit.errors.price}</p>) : null}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label" htmlFor="start_date">
                                                    Start date
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <div className="form-icon form-icon-left">
                                                        <Icon name="calendar"></Icon>
                                                    </div>
                                                    <DatePicker
                                                        selected={formikEdit.values.start_date}
                                                        className="form-control date-picker"
                                                        onChange={(date) => formikEdit.setFieldValue("start_date", date)}
                                                        name="start_date"
                                                        dateFormat="dd/MM/yyyy"
                                                        customInput={<ExampleCustomInput >{formikEdit.touched.start_date && formikEdit.errors.start_date ? (<p className="invalid">{formikEdit.errors.start_date}</p>) : null}</ExampleCustomInput>}
                                                    />

                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label" htmlFor="end_date">
                                                    End date
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <div className="form-icon form-icon-left">
                                                        <Icon name="calendar"></Icon>
                                                    </div>
                                                    <DatePicker
                                                        selected={formikEdit.values.end_date}
                                                        className="form-control date-picker"
                                                        onChange={(date) => formikEdit.setFieldValue("end_date", date)}
                                                        name="end_date"
                                                        dateFormat="dd/MM/yyyy"
                                                        customInput={<ExampleCustomInput >{formikEdit.touched.end_date && formikEdit.errors.end_date ? (<p className="invalid">{formikEdit.errors.end_date}</p>) : null}</ExampleCustomInput>}
                                                    />

                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label">
                                                    Billing type
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <RSelect name="billing_type" options={filteredBillingTypeOptions} value={formikEdit.values.billing_type}
                                                        onChange={(option) => formikEdit.setFieldValue("billing_type", option)} />
                                                    {formikEdit.touched.billing_type && formikEdit.errors.billing_type ? (<p className="invalid">{formikEdit.errors.billing_type}</p>) : null}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label">
                                                    Billing period
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <RSelect name="billing_period" options={billingPeriodOptions} value={formikEdit.values.billing_period}
                                                        onChange={(option) => formikEdit.setFieldValue("billing_period", option)} />
                                                    {formikEdit.touched.billing_period && formikEdit.errors.billing_period ? (<p className="invalid">{formikEdit.errors.billing_period}</p>) : null}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label">
                                                    Status
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <RSelect name="status" options={serviceOptionsCust} value={formikEdit.values.status}
                                                        onChange={(option) => formikEdit.setFieldValue("status", option)} />
                                                    {formikEdit.touched.status && formikEdit.errors.status ? (<p className="invalid">{formikEdit.errors.status}</p>) : null}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>
                                </>
                            }
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

            <Modal isOpen={editBillDateModal} toggle={toggleBillDate} className="modal-md">
                <ModalHeader toggle={toggleBillDate}>Edit due date</ModalHeader>
                <ModalBody>
                    {api3Loading ? <p>Loading...</p> :
                        <form className="gy-3 is-alter custom-form" onSubmit={formikBillDate.handleSubmit}>
                            <input
                                type="hidden"
                                id="id"
                                readOnly
                                value={formikBillDate.values.id}
                            />
                            <FocusError formik={formikBillDate} />

                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="due_date">
                                            Due date
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <div className="form-icon form-icon-left">
                                                <Icon name="calendar"></Icon>
                                            </div>
                                            <DatePicker
                                                selected={formikBillDate.values.due_date}
                                                className="form-control date-picker"
                                                onChange={(date) => formikBillDate.setFieldValue("due_date", date)}
                                                name="due_date"
                                                dateFormat="dd/MM/yyyy"
                                                customInput={<ExampleCustomInput >{formikBillDate.touched.due_date && formikBillDate.errors.due_date ? (<p className="invalid">{formikBillDate.errors.due_date}</p>) : null}</ExampleCustomInput>}
                                            />

                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            <Row>
                                <Col md="12">
                                    <div className="form-group mt-2">
                                        <Button type="submit" color="primary" className="pull-right">
                                            {formLoading ? <Spinner size="sm" color="light" /> : "Change Date"}
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

            <Modal isOpen={payModal} toggle={togglePay} className="modal-md">
                <ModalHeader toggle={togglePay}>Add payment</ModalHeader>
                <ModalBody>
                    {apiPayLoading ? <p>Loading...</p> :
                        <form className="gy-3" onSubmit={formikPay.handleSubmit}>
                            <p>Invoice #{formikPay.values.invoice_id}{formDataPay?.services_id ? ` · service #${formDataPay.services_id}` : ''}</p>
                            {formDataPay?.due > 0 && Number(data?.balance ?? 0) > 0 && (
                                <p className="text-soft">
                                    Invoice due KES {Number(formDataPay.due).toFixed(0)} · account credit KES {Number(data.balance).toFixed(0)}
                                    {Number(formDataPay.due_after_credit ?? formDataPay.due) < Number(formDataPay.due)
                                        ? ` · after credit KES ${Number(formDataPay.due_after_credit ?? 0).toFixed(0)}`
                                        : ''}
                                </p>
                            )}
                            <FocusError formik={formikPay} />
                            <Row className="align-center">
                                <Col md="8" className="offset-md-4">
                                    <div className="form-group">
                                        Available Credit: <strong>{data?.balance ?? 0}</strong>
                                    </div>
                                </Col>
                            </Row>

                            {data?.balance > 0 && <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="use_credit">
                                            Use credit
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="custom-control custom-checkbox notext">
                                            <input
                                                type="checkbox"
                                                className="custom-control-input"
                                                id="use_credit"
                                                name="use_credit"
                                                key="use_credit_pay"
                                                onChange={(e) => {
                                                    formikPay.setFieldValue("use_credit", e.currentTarget.checked);
                                                }}
                                                checked={formikPay.values.use_credit}
                                            />
                                            <label className="custom-control-label" htmlFor="use_credit"></label>
                                            {formikPay.touched.use_credit && formikPay.errors.use_credit ? (<p className="invalid">{formikPay.errors.use_credit}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>}

                            {!formikPay.values.use_credit && <>
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
                                                    customInput={<ExampleCustomInput >{formikPay.touched.date && formikPay.errors.date ? (<p className="invalid" style={{ color: '#e85347', fontSize: '11px', fontStyle: 'italic' }}>{formikPay.errors.date}</p>) : null}</ExampleCustomInput>}
                                                />

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
                            </>
                            }

                            <Row>
                                <Col md="12">
                                    <div className="form-group mt-2">
                                        <Button type="submit" color="primary" className="pull-right">
                                            {formLoading ? <Spinner size="sm" color="light" /> : "Pay"}
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
            <Modal isOpen={generateInvoiceModal} toggle={toggleGenerateInvoice} className="modal-md">
                <ModalHeader toggle={toggleGenerateInvoice}>Generate invoice</ModalHeader>
                <ModalBody>
                    {apiInvoiceLoading ? <p>Loading...</p> : formDataInvoice?.services?.length != 0 ?
                        <form className="gy-3" onSubmit={formikGenerateInvoice.handleSubmit}>
                            <FocusError formik={formikGenerateInvoice} />
                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label">
                                            Service
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <RSelect name="service" options={formDataInvoice.options} value={formikGenerateInvoice.values.service}
                                                onChange={
                                                    (option) => {
                                                        formikGenerateInvoice.setFieldValue("service", option);
                                                        let service = formDataInvoice.services.find(o => o.id === option.value);
                                                        formikGenerateInvoice.setFieldValue("billing_period", service.billing_period);
                                                        formikGenerateInvoice.setFieldValue("amount", service.formatted_price);
                                                    }
                                                } />
                                            {formikGenerateInvoice.touched.service && formikGenerateInvoice.errors.service ? (<p className="invalid" style={{ color: '#e85347', fontSize: '11px', fontStyle: 'italic' }}>{formikGenerateInvoice.errors.service}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="send_sms">
                                            Send SMS
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="custom-control custom-control-sm custom-checkbox notext">
                                            <input
                                                type="checkbox"
                                                className="custom-control-input"
                                                id="send_sms"
                                                name="send_sms"
                                                key={Math.random()}
                                                onChange={(e) => {
                                                    formikGenerateInvoice.setFieldValue("send_sms", e.currentTarget.checked);
                                                }}
                                                checked={formikGenerateInvoice.values.send_sms}
                                            />
                                            <label className="custom-control-label" htmlFor="send_sms"></label>
                                            {formikGenerateInvoice.touched.send_sms && formikGenerateInvoice.errors.send_sms ? (<p className="invalid">{formikGenerateInvoice.errors.send_sms}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="date">
                                            Due date
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <DatePicker
                                                selected={formikGenerateInvoice.values.date}
                                                className="form-control date-picker"
                                                onChange={(date) => formikGenerateInvoice.setFieldValue("date", date)}
                                                name="date"
                                                dateFormat="dd/MM/yyyy"
                                                customInput={<ExampleCustomInput >{formikGenerateInvoice.touched.date && formikGenerateInvoice.errors.date ? (<p className="invalid" style={{ color: '#e85347', fontSize: '11px', fontStyle: 'italic' }}>{formikGenerateInvoice.errors.date}</p>) : null}</ExampleCustomInput>}
                                            />

                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label">
                                            Billing period
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <RSelect name="billing_period" options={billingPeriodOptions} value={formikGenerateInvoice.values.billing_period}
                                                onChange={
                                                    (option) => {
                                                        formikGenerateInvoice.setFieldValue("billing_period", option)
                                                        let service = formDataInvoice.services.find(o => o.id === formikGenerateInvoice.values.service.value);
                                                        if (option.value == 1 || option.value == 2) {
                                                            formikGenerateInvoice.setFieldValue("amount", ((service.price / 4) * option.value) + 50);
                                                        } else {
                                                            formikGenerateInvoice.setFieldValue("amount", service.price);
                                                        }
                                                    }
                                                } />
                                            {formikGenerateInvoice.touched.billing_period && formikGenerateInvoice.errors.billing_period ? (<p className="invalid" style={{ color: '#e85347', fontSize: '11px', fontStyle: 'italic' }}>{formikGenerateInvoice.errors.billing_period}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            <Row className="align-center">
                                <Col md="4" className="col-form-label">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="amount">
                                            Amount
                                        </label>
                                    </div>
                                </Col>
                                <Col md="8">
                                    <div className="form-group">
                                        <div className="form-control-wrap">
                                            <input
                                                type="number"
                                                id="amount"
                                                className={classnames(
                                                    'form-control',
                                                    {
                                                        'is-invalid': formikGenerateInvoice.touched.amount && formikGenerateInvoice.errors.amount
                                                    }
                                                )}
                                                name="amount"
                                                value={formikGenerateInvoice.values.amount}
                                                onChange={formikGenerateInvoice.handleChange}
                                            />
                                            {formikGenerateInvoice.touched.amount && formikGenerateInvoice.errors.amount ? (<p className="invalid">{formikGenerateInvoice.errors.amount}</p>) : null}
                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            <Row>
                                <Col md="12">
                                    <div className="form-group mt-2">
                                        <Button type="submit" color="primary" className="pull-right">
                                            {formLoading ? <Spinner size="sm" color="light" /> : "Generate"}
                                        </Button>
                                    </div>
                                </Col>
                            </Row>
                        </form> : <div className="alert alert-warning alert-icon"><em className="icon ni ni-alert-circle"></em> There are no unbilled services for this customer.</div>
                    }
                </ModalBody>
                <ModalFooter>
                    <Button
                        className="p-0 m-0"
                        onClick={() => {
                            toggleGenerateInvoice();
                        }}
                    >
                        Close
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal isOpen={messageModal} toggle={toggleMessage} className="modal-sm" backdrop="static">
                <ModalHeader toggle={toggleMessage}>Send welcome message</ModalHeader>
                <ModalBody>
                    <form className="gy-3 is-alter custom-form" onSubmit={formikMessage.handleSubmit}>
                        <FocusError formik={formikMessage} />
                        <Row className="align-center">
                            <Col md="4" className="col-form-label">
                                <div className="form-group">
                                    <label className="form-label">
                                        Type
                                    </label>
                                </div>
                            </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <RSelect name="message_type" options={messageOptions} value={formikMessage.values.message_type}
                                            onChange={(option) => formikMessage.setFieldValue("message_type", option)} />
                                        {formikMessage.touched.message_type && formikMessage.errors.message_type ? (<p className="invalid">{formikMessage.errors.message_type}</p>) : null}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                        <Row>
                            <Col md="12">
                                <div className="form-group mt-2">
                                    <Button type="submit" color="primary" className="pull-right">
                                        {formLoading ? <Spinner size="sm" color="light" /> : "Send"}
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
                            toggleMessage();
                        }}
                    >
                        Close
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal isOpen={passwordModal} toggle={togglePassword} className="modal-sm" backdrop="static">
                <ModalHeader toggle={togglePassword}>Reset password</ModalHeader>
                <ModalBody>
                    <form className="is-alter custom-form" onSubmit={formikPassword.handleSubmit}>
                        <FocusError formik={formikPassword} />
                        <Row className="align-center">
                            <Col md="4" className="col-form-label">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="password">
                                        Password
                                    </label>
                                </div>
                            </Col>
                            <Col md="8">
                                <div className="form-group">
                                    <div className="form-control-wrap">
                                        <a
                                            href="#password"
                                            onClick={(ev) => {
                                                ev.preventDefault();
                                                setPassState(!passState);
                                            }}
                                            className={`form-icon form-icon-right passcode-switch ${passState ? "is-hidden" : "is-shown"}`}
                                        >
                                            <Icon name="eye" className="passcode-icon icon-show"></Icon>

                                            <Icon name="eye-off" className="passcode-icon icon-hide"></Icon>
                                        </a>
                                        <input
                                            type={passState ? "text" : "password"}
                                            id="password"
                                            name="password"
                                            value={formikPassword.values.password}
                                            onChange={formikPassword.handleChange}
                                            placeholder="Enter your password"
                                            className={classnames(
                                                `form-control${passState ? " is-hidden" : " is-shown"}`,
                                                {
                                                    'is-invalid': formikPassword.touched.password && formikPassword.errors.password
                                                }
                                            )}
                                        />
                                        {formikPassword.touched.password && formikPassword.errors.password ? (<span className="invalid">{formikPassword.errors.password}</span>) : null}
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
                </ModalBody>
                <ModalFooter>
                    <Button
                        className="p-0 m-0"
                        onClick={() => {
                            togglePassword();
                        }}
                    >
                        Close
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal isOpen={wifiDevicesModal} toggle={toggleWifiDevices} className="modal-lg" backdrop="static">
                <ModalHeader
                    toggle={toggleWifiDevices}
                    close={
                        <button className="close" onClick={toggleWifiDevices}>
                            <Icon name="cross" />
                        </button>
                    }
                >
                    Connected Wi‑Fi Devices
                </ModalHeader>
                <ModalBody>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <div>
                            <div className="small text-muted">Network</div>
                            <div className="fw-bold">{wifiOverview?.wifi_ssid || '—'}</div>
                        </div>
                        <Badge color="primary" pill>
                            {wifiDevicesLoading ? '…' : `${wifiOverview?.device_count ?? 0} online`}
                        </Badge>
                    </div>
                    {(wifiOverview?.connected_devices || []).length > 0 ? (
                        <div className="table-responsive">
                            <table className="table table-sm align-middle mb-0 customer-wifi-devices-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Device</th>
                                        <th>IP address</th>
                                        <th>MAC address</th>
                                        <th>Connection</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {wifiOverview.connected_devices.map((device, index) => (
                                        <tr key={`${device.mac}-${index}`}>
                                            <td>{index + 1}</td>
                                            <td>{device.hostname || '—'}</td>
                                            <td className="font-monospace">{device.ip || '—'}</td>
                                            <td className="font-monospace">{device.mac}</td>
                                            <td>{device.port || '—'}</td>
                                            <td>
                                                <Badge color={device.online === false ? 'secondary' : 'success'} pill>
                                                    {device.online === false ? 'Offline' : 'Online'}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center text-soft py-4">
                            {wifiLoading || wifiDevicesLoading
                                ? 'Loading devices…'
                                : 'No devices currently connected to this Wi‑Fi.'}
                        </div>
                    )}
                </ModalBody>
                <ModalFooter className="justify-content-between">
                    <Button
                        color="light"
                        size="sm"
                        onClick={() => setReload((value) => !value)}
                        disabled={wifiLoading}
                    >
                        {wifiLoading ? <Spinner size="sm" /> : 'Refresh'}
                    </Button>
                    <Button className="p-0 m-0" onClick={toggleWifiDevices}>
                        Close
                    </Button>
                </ModalFooter>
            </Modal>

            <Modal isOpen={wifiPasswordModal} toggle={toggleWifiPassword} className="modal-sm" backdrop="static">
                <ModalHeader
                    toggle={toggleWifiPassword}
                    close={
                        <button className="close" onClick={toggleWifiPassword}>
                            <Icon name="cross" />
                        </button>
                    }
                >
                    Change Wi‑Fi Password
                </ModalHeader>
                <ModalBody>
                    <form noValidate onSubmit={formikWifiPassword.handleSubmit} autoComplete="off">
                        <FocusError formik={formikWifiPassword} />
                        <p className="small text-muted mb-3">
                            Updates the Wi‑Fi name and password on the customer ONU via {wifiSourceLabel}.
                            {wifiOverview?.source === 'both'
                                ? ' Both channels are written so the stored password cannot drift.'
                                : ''}
                            {' '}Devices will need to reconnect.
                        </p>
                        <Row>
                            <Col md="12">
                                <div className="form-group">
                                    <label className="form-label" htmlFor="wifi_ssid">
                                        Wi‑Fi name (SSID)
                                    </label>
                                    <input
                                        type="text"
                                        id="wifi_ssid"
                                        name="ssid"
                                        value={formikWifiPassword.values.ssid}
                                        onChange={formikWifiPassword.handleChange}
                                        placeholder="Wi‑Fi name"
                                        className={classnames('form-control', {
                                            'is-invalid': formikWifiPassword.touched.ssid && formikWifiPassword.errors.ssid
                                        })}
                                    />
                                    {formikWifiPassword.touched.ssid && formikWifiPassword.errors.ssid ? (
                                        <span className="invalid">{formikWifiPassword.errors.ssid}</span>
                                    ) : null}
                                </div>
                            </Col>
                            <Col md="12">
                                <div className="form-group mt-2">
                                    <label className="form-label" htmlFor="wifi_password">
                                        New Wi‑Fi password
                                    </label>
                                    <div className="form-control-wrap">
                                        <a
                                            href="#password"
                                            onClick={(ev) => {
                                                ev.preventDefault();
                                                setWifiPassState(!wifiPassState);
                                            }}
                                            className={`form-icon lg form-icon-right passcode-switch ${wifiPassState ? "is-hidden" : "is-shown"}`}
                                        >
                                            <Icon name="eye" className="passcode-icon icon-show"></Icon>
                                            <Icon name="eye-off" className="passcode-icon icon-hide"></Icon>
                                        </a>
                                        <input
                                            type={wifiPassState ? "text" : "password"}
                                            id="wifi_password"
                                            name="password"
                                            value={formikWifiPassword.values.password}
                                            onChange={formikWifiPassword.handleChange}
                                            placeholder="At least 8 characters"
                                            className={classnames(
                                                `form-control${wifiPassState ? " is-hidden" : " is-shown"}`,
                                                {
                                                    'is-invalid': formikWifiPassword.touched.password && formikWifiPassword.errors.password
                                                }
                                            )}
                                        />
                                        {formikWifiPassword.touched.password && formikWifiPassword.errors.password ? (
                                            <span className="invalid">{formikWifiPassword.errors.password}</span>
                                        ) : null}
                                    </div>
                                </div>
                            </Col>
                            <Col md="12">
                                <div className="form-group mt-2">
                                    <label className="form-label" htmlFor="wifi_confirm_password">
                                        Confirm password
                                    </label>
                                    <input
                                        type={wifiPassState ? "text" : "password"}
                                        id="wifi_confirm_password"
                                        name="confirm_password"
                                        value={formikWifiPassword.values.confirm_password}
                                        onChange={formikWifiPassword.handleChange}
                                        placeholder="Confirm password"
                                        className={classnames('form-control', {
                                            'is-invalid': formikWifiPassword.touched.confirm_password && formikWifiPassword.errors.confirm_password
                                        })}
                                    />
                                    {formikWifiPassword.touched.confirm_password && formikWifiPassword.errors.confirm_password ? (
                                        <span className="invalid">{formikWifiPassword.errors.confirm_password}</span>
                                    ) : null}
                                </div>
                            </Col>
                        </Row>
                        <Row>
                            <Col md="12">
                                <div className="form-group mt-3">
                                    <Button type="submit" color="primary" className="w-100">
                                        {formLoading ? <Spinner size="sm" color="light" /> : "Update Wi‑Fi"}
                                    </Button>
                                </div>
                            </Col>
                        </Row>
                    </form>
                </ModalBody>
                <ModalFooter>
                    <Button className="p-0 m-0" onClick={toggleWifiPassword}>
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

export default connect(mapStateToProps)(View);
