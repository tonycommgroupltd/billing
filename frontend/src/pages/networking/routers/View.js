import React, { useState, useEffect } from "react";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import { Nav, NavItem, NavLink, TabContent, TabPane, Row, Col, Spinner, Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";
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
} from "../../../components/Component";
import { http } from '../../../helpers';
import { useNavigate, useParams } from 'react-router-dom';
import * as Yup from 'yup';
import { useFormik } from 'formik';
import { nasTypeOptions, authorizationOptions, accountingOptions } from "../../components/forms/SelectData";
import { FocusError } from 'focus-formik-error';
import { toast } from "react-toastify";
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-luxon';
import StreamingPlugin from 'chartjs-plugin-streaming';
import Chart from "chart.js/auto";

Chart.register(StreamingPlugin);

const formatFileSize = (e, t, n, i) => {
    let r, o;
    for ("undefined" === typeof t && (t = 2), "undefined" === typeof n && (n = 1024), "undefined" === typeof i && (i = !1), e = parseFloat(e), r = i ? ["b", "Kb", "Mb", "Gb", "Tb", "Pb", "Eb", "Zb", "Yb"] : ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"], o = 0; e >= n && o < r.length - 1; o++)
        e /= n;
    return `${e.toFixed(t) / 1} ${r[o]}`
}

const formatInternetSpeed = (e, t, n, i) => {
    return `${formatFileSize(e, t, n, i)}ps`
}

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const View = () => {
    const { id } = useParams();
    const [data, setData] = useState([]);
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [apiLoading, setApiLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("1");
    const [isOpen, setIsOpen] = useState(false);
    const [interfaceOptions, setInterfaceOptions] = useState([]);
    const [interfac, setInterfac] = useState([]);
    const [passState, setPassState] = useState(false);
    const [checked, setChecked] = useState(false);
    const chartpluginsset = [
        {
            afterDraw: (chart) => {
                var showEmptyDataLabel = true;

                chart.data.datasets.forEach(dataset => {
                    if (dataset.data.length > 0) {
                        showEmptyDataLabel = false;
                    }
                });

                const { ctx } = chart
                let chartWidth = chart.width;
                let chartHeight = chart.height;

                if (showEmptyDataLabel) {
                    chart.clear();

                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#323232';
                    ctx.font = "14px sans-serif";
                    ctx.fillText('No data to display', chartWidth / 2, 100);
                    ctx.restore();
                } else {

                    var up = '0';
                    var down = '0';

                    if (chart.data.datasets[0].data[chart.data.datasets[0].data.length - 1]?.y !== undefined) {
                        up = chart.data.datasets[0].data[chart.data.datasets[0].data.length - 1]?.y;
                    }
                    if (chart.data.datasets[1].data[chart.data.datasets[1].data.length - 1]?.y !== undefined) {
                        down = chart.data.datasets[1].data[chart.data.datasets[1].data.length - 1]?.y;
                    }

                    // Clear bottom text area
                    ctx.clearRect(0, chartHeight - 30, chartWidth, 30);

                    ctx.save();
                    ctx.font = "12px 'Helvetica', 'Arial', sans-serif";
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#666';

                    ctx.textAlign = 'right';
                    ctx.fillText('Upload', (chartWidth / 2) - 5, chartHeight - 25);

                    ctx.textAlign = 'center';
                    ctx.fillText(' / ', (chartWidth / 2), chartHeight - 25);

                    ctx.textAlign = 'left';
                    ctx.fillText('Download', (chartWidth / 2) + 5, chartHeight - 25);
                    ctx.restore();

                    ctx.save();
                    ctx.font = "bold 14px 'Helvetica', 'Arial', sans-serif";
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#323232';
                    let trafficUpText = formatInternetSpeed(up, 2, 1024, true);
                    ctx.textAlign = 'right';
                    ctx.fillText(trafficUpText, (chartWidth / 2) - 5, chartHeight - 10);

                    let trafficDownText = formatInternetSpeed(down, 2, 1024, true);
                    ctx.textAlign = 'left';
                    ctx.fillText(trafficDownText, (chartWidth / 2) + 5, chartHeight - 10);

                    let delimiterText = ' / ';
                    ctx.textAlign = 'center';
                    ctx.fillText(delimiterText, (chartWidth / 2), chartHeight - 10);
                    ctx.restore();
                }
            }
        }
    ];

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

    const execToastInfo = (placement, message) => {
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
    };

    const formik = useFormik({
        initialValues: {
            title: data?.title ?? "",
            nas_type: data?.nas_type ?? { label: "MikroTik", value: "MikroTik" },
            model: data?.model ?? "",
            physical_address: data?.physical_address ?? "",
            host: data?.host ?? "",
            nas_ip: data?.nas_ip ?? "",
            radius_secret: data?.radius_secret ?? "",
            authorization: data?.authorization ?? { label: "None", value: "" },
            accounting: data?.accounting ?? { label: "None", value: "" },
        },
        enableReinitialize: true,
        validationSchema: Yup.object({
            title: Yup.string('Title')
                .required('Title is required'),
            host: Yup.string('IP/ Host')
                .required('IP/ Host is required'),
        }),
        onSubmit: (data, { resetForm }) => {
            setLoading(true);
            http
                .post(`/update-router/${id}`, {
                    title: data.title,
                    nas_type: data.nas_type,
                    model: data.model,
                    physical_address: data.physical_address,
                    host: data.host,
                    nas_ip: data.nas_ip,
                    radius_secret: data.radius_secret,
                    authorization: data.authorization,
                    accounting: data.accounting,
                })
                .then(response => {
                    setLoading(false);
                    if (response.data?.message) {
                        successToast("top-right", response.data?.message);
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

    const formikApi = useFormik({
        initialValues: {
            api_login: data?.api_login ?? '',
            api_password: data?.api_password ?? "",
            api_port: data?.api_port ?? 8728,
            title: data?.title,
            host: data?.host
        },
        enableReinitialize: true,
        onSubmit: (data) => {
            setLoading(true);
            http
                .post(`/update-router/${id}`, {
                    api: checked,
                    api_login: data.api_login,
                    api_password: data.api_password,
                    api_port: data.api_port,
                    title: data.title,
                    host: data.host
                })
                .then(response => {
                    setLoading(false);
                    if (response.data?.message) {
                        successToast("top-right", response.data?.message);
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

    const toggle = (tab) => {
        if (activeTab !== tab) setActiveTab(tab);
    };

    const handleChange = () => {
        setChecked(!checked);
    };

    const checkApiStatus = async () => {
        execToastInfo("top-right", 'Please wait...');
        try {
            const response = await http.get(`${process.env.REACT_APP_API_URL}/api-status/${id}?username=${formikApi?.values?.api_login}&password=${formikApi?.values?.api_password}&port=${formikApi?.values?.api_port}`);
            if (response.data && response.data.error) {
                execToast("top-right", response.data.error);
            } else {
                successToast("top-right", 'Successful connection');
            }
        }
        catch (err) {
            execToast("top-right", err.message);
        }
    }

    const toggleModal = () => { setIsOpen(!isOpen) };

    useEffect(() => {
        const fetchRouter = async (id) => {
            setApiLoading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/view-router/${id}`);

                    if (response.data?.router) {
                        setData(response.data?.router);
                        setInterfaceOptions(response.data?.interfaces)
                        setChecked(response.data?.router.api === 1 ? true : false)
                    }
                }
                setApiLoading(false);
            } catch (error) {
                setApiLoading(false);
            }
        };

        fetchRouter(id);

    }, [id]);

    const timeFormat = 'HH:mm:ss';

    return (
        <>
            <Head title="View Router" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle tag="h6" page className="fs-18">
                                Routers / <strong className="text-primary">View</strong> /
                            </BlockTitle>
                            {data && Object.keys(data)?.length > 0 && <BlockDes className="text-soft">
                                <ul className="list-inline">
                                    <li><span className="large">{`${data.title} (${data.host})`}</span></li>
                                </ul>
                            </BlockDes>}
                        </BlockHeadContent>
                        <BlockHeadContent>
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
                </BlockHead>

                <Block>
                    <Nav tabs className="mt-n3 custom-tab">
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
                                MikroTik
                            </NavLink>
                        </NavItem>
                    </Nav>
                    <div className="tab-preview">
                        <TabContent activeTab={activeTab}>
                            <TabPane tabId="1" className="tab-content-inner">
                                {apiLoading ? <div className="ps-20 pe-20">Loading...</div> :
                                    <form className="custom-form" onSubmit={formik.handleSubmit}>
                                        <FocusError formik={formik} />
                                        <div className="card-block">
                                            <div className="gy-3">
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
                                                                NAS type
                                                            </label>
                                                        </div>
                                                    </Col>
                                                    <Col md="8">
                                                        <div className="form-group">
                                                            <div className="form-control-wrap">
                                                                <RSelect name="nas_type" options={nasTypeOptions} value={formik.values.nas_type}
                                                                    onChange={(option) => formik.setFieldValue("nas_type", option)} />
                                                                {formik.touched.nas_type && formik.errors.nas_type ? (<p className="invalid">{formik.errors.nas_type}</p>) : null}
                                                            </div>
                                                        </div>
                                                    </Col>
                                                </Row>
                                                <Row className="align-center">
                                                    <Col md="4" className="col-form-label">
                                                        <div className="form-group">
                                                            <label className="form-label" htmlFor="model">
                                                                Vendor/ Model
                                                            </label>
                                                        </div>
                                                    </Col>
                                                    <Col md="8">
                                                        <div className="form-group">
                                                            <div className="form-control-wrap">
                                                                <input
                                                                    type="text"
                                                                    id="model"
                                                                    className={classnames(
                                                                        'form-control',
                                                                        {
                                                                            'is-invalid': formik.touched.model && formik.errors.model
                                                                        }
                                                                    )}
                                                                    name="model"
                                                                    value={formik.values.model}
                                                                    onChange={formik.handleChange}
                                                                />
                                                                {formik.touched.model && formik.errors.model ? (<p className="invalid">{formik.errors.model}</p>) : null}
                                                            </div>
                                                        </div>
                                                    </Col>
                                                </Row>
                                                <Row className="align-center">
                                                    <Col md="4" className="col-form-label">
                                                        <div className="form-group">
                                                            <label className="form-label" htmlFor="physical-address">
                                                                Physical address
                                                            </label>
                                                        </div>
                                                    </Col>
                                                    <Col md="8">
                                                        <div className="form-group">
                                                            <div className="form-control-wrap">
                                                                <input
                                                                    type="text"
                                                                    id="physical-address"
                                                                    className={classnames(
                                                                        'form-control',
                                                                        {
                                                                            'is-invalid': formik.touched.physical_address && formik.errors.physical_address
                                                                        }
                                                                    )}
                                                                    name="physical_address"
                                                                    value={formik.values.physical_address}
                                                                    onChange={formik.handleChange}
                                                                />
                                                                {formik.touched.physical_address && formik.errors.physical_address ? (<p className="invalid">{formik.errors.physical_address}</p>) : null}
                                                            </div>
                                                        </div>
                                                    </Col>
                                                </Row>
                                                <Row className="align-center">
                                                    <Col md="4" className="col-form-label">
                                                        <div className="form-group">
                                                            <label className="form-label" htmlFor="host">
                                                                IP/ Host
                                                                <span className="text-secondary">&nbsp;(required)</span>
                                                            </label>
                                                        </div>
                                                    </Col>
                                                    <Col md="8">
                                                        <div className="form-group">
                                                            <div className={classnames(
                                                                'form-control-wrap',
                                                                'input-group',
                                                                {
                                                                    'is-invalid': formik.touched.host && formik.errors.host
                                                                }
                                                            )}>
                                                                <input
                                                                    type="text"
                                                                    id="host"
                                                                    className={classnames(
                                                                        'form-control',
                                                                        {
                                                                            'is-invalid': formik.touched.host && formik.errors.host
                                                                        }
                                                                    )}
                                                                    name="host"
                                                                    value={formik.values.host}
                                                                    onChange={formik.handleChange}
                                                                />
                                                                <div title="Update" className="input-group-text">
                                                                    <span>Ping:</span> <span><label className="badge bg-success rounded-pill ms-8">0.399 ms</label></span>
                                                                </div>
                                                            </div>
                                                            {formik.touched.host && formik.errors.host ? (<p className="invalid-feedback">{formik.errors.host}</p>) : null}
                                                        </div>
                                                    </Col>
                                                </Row>
                                                <Row className="align-center">
                                                    <Col md="4" className="col-form-label">
                                                        <div className="form-group">
                                                            <label className="form-label">
                                                                Authorization
                                                            </label>
                                                        </div>
                                                    </Col>
                                                    <Col md="8">
                                                        <div className="form-group">
                                                            <div className="form-control-wrap">
                                                                <RSelect options={authorizationOptions} value={formik.values.authorization}
                                                                    onChange={(option) => formik.setFieldValue("authorization", option)} />
                                                                {formik.touched.authorization && formik.errors.authorization ? (<p className="invalid">{formik.errors.authorization}</p>) : null}
                                                            </div>
                                                        </div>
                                                    </Col>
                                                </Row>
                                                <Row className="align-center">
                                                    <Col md="4" className="col-form-label">
                                                        <div className="form-group">
                                                            <label className="form-label">
                                                                Accounting
                                                            </label>
                                                        </div>
                                                    </Col>
                                                    <Col md="8">
                                                        <div className="form-group">
                                                            <div className="form-control-wrap">
                                                                <RSelect options={accountingOptions} value={formik.values.accounting}
                                                                    onChange={(option) => formik.setFieldValue("accounting", option)} />
                                                                {formik.touched.accounting && formik.errors.accounting ? (<p className="invalid">{formik.errors.accounting}</p>) : null}
                                                            </div>
                                                        </div>
                                                    </Col>
                                                </Row>
                                            </div>
                                        </div>
                                        <div className="card-block">
                                            <div className="gy-3">
                                                <Row className="align-center">
                                                    <Col md="4" className="col-form-label">
                                                        <div className="form-group">
                                                            <label className="form-label" htmlFor="radius-secret">
                                                                Radius secret
                                                            </label>
                                                        </div>
                                                    </Col>
                                                    <Col md="8">
                                                        <div className="form-group">
                                                            <div className="form-control-wrap">
                                                                <input
                                                                    type="text"
                                                                    id="radius-secret"
                                                                    className={classnames(
                                                                        'form-control',
                                                                        {
                                                                            'is-invalid': formik.touched.radius_secret && formik.errors.radius_secret
                                                                        }
                                                                    )}
                                                                    name="radius_secret"
                                                                    value={formik.values.radius_secret}
                                                                    onChange={formik.handleChange}
                                                                />
                                                                {formik.touched.radius_secret && formik.errors.radius_secret ? (<p className="invalid">{formik.errors.radius_secret}</p>) : null}
                                                            </div>
                                                        </div>
                                                    </Col>
                                                </Row>
                                                <Row className="align-center">
                                                    <Col md="4" className="col-form-label">
                                                        <div className="form-group">
                                                            <label className="form-label" htmlFor="nas-ip">
                                                                NAS IP
                                                            </label>
                                                        </div>
                                                    </Col>
                                                    <Col md="8">
                                                        <div className="form-group">
                                                            <div className="form-control-wrap">
                                                                <input
                                                                    type="text"
                                                                    id="nas-ip"
                                                                    className={classnames(
                                                                        'form-control',
                                                                        {
                                                                            'is-invalid': formik.touched.nas_ip && formik.errors.nas_ip
                                                                        }
                                                                    )}
                                                                    name="nas_ip"
                                                                    value={formik.values.nas_ip}
                                                                    onChange={formik.handleChange}
                                                                />
                                                                {formik.touched.nas_ip && formik.errors.nas_ip ? (<p className="invalid">{formik.errors.nas_ip}</p>) : null}
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
                                    </form>
                                }
                            </TabPane>
                            <TabPane tabId="2" className="tab-content-inner">
                                {apiLoading ? <div className="ps-20 pe-20">Loading...</div> :
                                    <>
                                        <form className="custom-form" onSubmit={formikApi.handleSubmit}>
                                            <FocusError formik={formikApi} />
                                            <div className="card-block">
                                                <div className="gy-3">
                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="api">
                                                                    Enable API
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <div className="custom-control custom-switch">
                                                                        <input type="checkbox" className="custom-control-input" checked={checked}
                                                                            onChange={handleChange} name="api" id="api" />
                                                                        <label className="custom-control-label" htmlFor="api"></label>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>
                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="api-login">
                                                                    Login (API)
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <input
                                                                        type="text"
                                                                        id="api-login"
                                                                        className={classnames(
                                                                            'form-control',
                                                                            {
                                                                                'is-invalid': formikApi.touched.api_login && formikApi.errors.api_login
                                                                            }
                                                                        )}
                                                                        name="api_login"
                                                                        value={formikApi.values.api_login}
                                                                        onChange={formikApi.handleChange}
                                                                    />
                                                                    {formikApi.touched.api_login && formikApi.errors.api_login ? (<p className="invalid">{formikApi.errors.api_login}</p>) : null}
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>
                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="api-password">
                                                                    Password (API)
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
                                                                        id="api-password"
                                                                        className={classnames(
                                                                            'form-control',
                                                                            {
                                                                                'is-invalid': formikApi.touched.api_password && formikApi.errors.api_password,
                                                                                'is-hidden': passState,
                                                                                'is-shown': !passState
                                                                            }
                                                                        )}
                                                                        name="api_password"
                                                                        value={formikApi.values.api_password}
                                                                        onChange={formikApi.handleChange}
                                                                    />
                                                                    {formikApi.touched.api_password && formikApi.errors.api_password ? (<p className="invalid">{formikApi.errors.api_password}</p>) : null}
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>
                                                    <Row className="align-center">
                                                        <Col md="4" className="col-form-label">
                                                            <div className="form-group">
                                                                <label className="form-label" htmlFor="api-port">
                                                                    Port (API)
                                                                </label>
                                                            </div>
                                                        </Col>
                                                        <Col md="8">
                                                            <div className="form-group">
                                                                <div className="form-control-wrap">
                                                                    <input
                                                                        type="text"
                                                                        id="api-port"
                                                                        className={classnames(
                                                                            'form-control',
                                                                            {
                                                                                'is-invalid': formikApi.touched.api_port && formikApi.errors.api_port
                                                                            }
                                                                        )}
                                                                        name="api_port"
                                                                        value={formikApi.values.api_port}
                                                                        onChange={formikApi.handleChange}
                                                                    />
                                                                    {formikApi.touched.api_port && formikApi.errors.api_port ? (<p className="invalid">{formikApi.errors.api_port}</p>) : null}
                                                                </div>
                                                            </div>
                                                        </Col>
                                                    </Row>
                                                    <Row>
                                                        <Col md="12" className="mt-1">

                                                            <Button type="button" outline color="secondary" className="pull-right" onClick={checkApiStatus}>
                                                                Test API connection
                                                            </Button>
                                                        </Col>
                                                    </Row>
                                                    <Row>
                                                        <Col md="12" className="mt-2">

                                                            <Button type="submit" color="primary" className="pull-right">
                                                                {loading ? <Spinner size="sm" color="light" /> : "Save"}
                                                            </Button>
                                                            <Button type="button" color="primary" className="pull-right mr-2" onClick={toggleModal}>
                                                                Live bandwidth usage
                                                            </Button>
                                                        </Col>
                                                    </Row>
                                                </div>
                                            </div>
                                            <div className="card-block">
                                                <div className="card-block-header"><strong>MikroTik status</strong></div>
                                                <div className="card-block-body"></div>
                                            </div>
                                        </form>

                                    </>
                                }
                            </TabPane>
                        </TabContent>
                    </div>
                </Block>
                <Modal size="lg" isOpen={isOpen} toggle={toggleModal}>
                    <ModalHeader
                        toggle={toggleModal}
                        close={
                            <button className="close" onClick={toggleModal}>
                                <Icon name="cross" />
                            </button>
                        }
                    >
                        Live bandwidth usage
                    </ModalHeader>
                    <ModalBody>
                        <div className="bandwidth-top-nav">
                            <div className="filters-nav">
                                <div className="filter-inputs">
                                    <div className="filter-input">

                                    </div>
                                    <div className="filter-input">
                                        <RSelect options={interfaceOptions} onChange={(e) => setInterfac(e)} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="linechart" style={{ position: "relative", height: "320px", width: "100%" }}>
                            <Line
                                data={{
                                    datasets: [{
                                        data: [],
                                        label: "Upload",
                                        fill: true,
                                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                                        borderColor: 'rgb(255, 99, 132)',
                                        pointRadius: 1,
                                        borderWidth: 1,
                                        spanGaps: true,
                                        pointHitRadius: 5,
                                    }, {
                                        data: [],
                                        label: "Download",
                                        fill: true,
                                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                                        borderColor: 'rgb(54, 162, 235)',
                                        pointRadius: 1,
                                        borderWidth: 1,
                                        spanGaps: true,
                                        pointHitRadius: 15,
                                        cubicInterpolationMode: 'monotone',
                                    }]
                                }}
                                options={{
                                    maintainAspectRatio: false,
                                    responsive: true,
                                    layout: {
                                        padding: {
                                            left: 20,
                                            right: 0,
                                            top: 0,
                                            bottom: 50,
                                        }
                                    },
                                    scales: {
                                        x: {
                                            type: 'realtime',
                                            ticks: {
                                                maxRotation: 45,
                                                minRotation: 45,
                                            },
                                            time: {
                                                displayFormats: {
                                                    millisecond: timeFormat,
                                                    second: timeFormat,
                                                    minute: timeFormat,
                                                    hour: timeFormat,
                                                    day: timeFormat,
                                                    week: timeFormat,
                                                    month: timeFormat,
                                                    quarter: timeFormat,
                                                    year: timeFormat,
                                                }
                                            },
                                            realtime: {
                                                duration: 60000, // data in the past 60000 ms will be displayed
                                                refresh: 1000, // onRefresh callback will be called every 1000 ms
                                                delay: 1500, // delay of 1500 ms, so upcoming values are known before plotting a line
                                                pause: false,
                                                ttl: undefined, // data will be automatically deleted as it disappears off the chart
                                                frameRate: 30,    // data points are drawn 30 times every second
                                                onRefresh: chart => {
                                                    // request data so that it can be received asynchronously
                                                    // assume the response is an array of {x: timestamp, y: value} objects
                                                    if (interfac && interfac.value) {
                                                        http.get(`${process.env.REACT_APP_API_URL}/router-monitor-traffic/${id}?interface=${interfac?.value}`)
                                                            .then(res => {
                                                                // append the new data array to the existing chart data
                                                                chart.data.datasets[0].data.push(...[res.data[0]]);
                                                                chart.data.datasets[1].data.push(...[res.data[1]]);

                                                                // update chart datasets keeping the current animation
                                                                chart.update('quiet');
                                                            });
                                                    }
                                                }
                                            }
                                        },
                                        y: {
                                            type: 'linear',
                                            beginAtZero: true,
                                            ticks: {
                                                callback: (value) => {
                                                    return formatInternetSpeed(value, 0, 1024, true);
                                                }
                                            }
                                        }
                                    },
                                    plugins: {
                                        tooltip: {
                                            callbacks: {
                                                label: function (context) {
                                                    let label = context.dataset.label || '';

                                                    if (label) {
                                                        label += ': ';
                                                    }
                                                    if (context.parsed.y !== null) {
                                                        label += formatInternetSpeed(context.parsed.y, 2, 1024, true);
                                                    }
                                                    return label;
                                                }
                                            }
                                        }
                                    }
                                }}
                                plugins={chartpluginsset}
                            />
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button
                            className="p-0 m-0"
                            onClick={() => {
                                toggleModal();
                            }}
                        >
                            Close
                        </Button>
                    </ModalFooter>
                </Modal>
            </Content>
        </>
    );
};

export default View;
