import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import { Row, Col, Spinner } from "reactstrap";
import * as Yup from 'yup';
import { useFormik } from 'formik';
import {
    Block,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
    BackTo,
    PreviewCard,
    Button,
    RSelect,
    Icon,
} from "../../../components/Component";
import { nasTypeOptions, authorizationOptions, accountingOptions } from "../../components/forms/SelectData";
import { FocusError } from 'focus-formik-error';
import { http } from '../../../helpers';
import { toast } from "react-toastify";
import classnames from "classnames";

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const Add = ({ ...props }) => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

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

    const formik = useFormik({
        initialValues: {
            title: '',
            nas_type: { label: "MikroTik", value: "MikroTik" },
            model: '',
            physical_address: '',
            host: '',
            nas_ip: '',
            authorization: { label: "None", value: "" },
            accounting: { label: "None", value: "" },
        },
        validationSchema: Yup.object({
            title: Yup.string('Title')
                .required('Title is required'),
            host: Yup.string('IP/ Host')
                .required('IP/ Host is required'),
        }),
        onSubmit: (data, { resetForm }) => {
            setLoading(true);
            http
                .post("/add-router", {
                    title: data.title,
                    nas_type: data.nas_type,
                    model: data.model,
                    physical_address: data.physical_address,
                    host: data.host,
                    nas_ip: data.nas_ip,
                    authorization: data.authorization,
                    accounting: data.accounting,
                })
                .then(response => {
                    setLoading(false);
                    if (response.data?.message) {
                        successToast("top-right", response.data?.message);
                        resetForm();
                        navigate('/admin/networking/routers/list');
                    }
                })
                .catch(err => {
                    setLoading(false);
                    if (err.response.status === 422) {
                        execToast("top-right", err.response.data[Object.keys(err.response.data)[0]][0]);
                    }else {
                        execToast("top-right", 'Something went wrong');
                    }
                })
        }
    });

    return (
        <React.Fragment>
            <Head title="Add router" />
            <Content>
                <BlockHead size="lg" wide="sm">
                    <BlockHeadContent>
                        <BackTo link="/admin/networking/routers/list" icon="arrow-left">
                            Routers
                        </BackTo>
                        <BlockTitle tag="h2" className="fw-normal">
                            Add
                        </BlockTitle>
                    </BlockHeadContent>
                </BlockHead>

                <Block size="lg">
                    <Row className="g-gs">
                        <Col md="9">
                            <PreviewCard>
                                <form className="gy-3 is-alter custom-form" onSubmit={formik.handleSubmit}>
                                    <FocusError formik={formik} />
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
                                                <div className="form-control-wrap">
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
                                                    {formik.touched.host && formik.errors.host ? (<p className="invalid">{formik.errors.host}</p>) : null}
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
                                    <Row>
                                        <Col md="12">
                                            <div className="form-group mt-2">
                                                <Button type="submit" color="primary" className="pull-right">
                                                    {loading ? <Spinner size="sm" color="light" /> : "Add"}
                                                </Button>
                                            </div>
                                        </Col>
                                    </Row>
                                </form>
                            </PreviewCard>
                        </Col>
                    </Row>
                </Block>
            </Content>
        </React.Fragment>
    );
};

export default Add;
