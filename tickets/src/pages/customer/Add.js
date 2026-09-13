import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
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
} from "../../components/Component";
import { billingTypeOptions, categoryOptions } from "../components/forms/SelectData";
import { FocusError } from 'focus-formik-error';
import { http } from '../../helpers';
import { toast } from "react-toastify";
import classnames from "classnames";

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const phoneRegex = RegExp(
    /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/
);

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
            billing_type: { value: 1, label: "Recurring" },
            category: { value: 1, label: "Individual" },
            name: '',
            address: '',
            email: '',
            password: '',
            phone_number: '',
            dob: '',
            city: ''
        },
        validationSchema: Yup.object({
            name: Yup.string('Enter your full name')
                .required('Full name is required'),
            email: Yup.string('Enter your email')
                .email('Enter a valid email'),
            phone_number: Yup.string().matches(phoneRegex, "Invalid characters in phone number field (allowed only 0-9)").required("Phone is required"),
            password: Yup.string()
                .min(6, 'Password is too short - should be 6 chars minimum.'),
        }),
        onSubmit: (data, { resetForm }) => {
            setLoading(true);
            http
                .post("/add-customers", {
                    billing_type: data.billing_type,
                    category: data.category,
                    name: data.name,
                    address: data.address,
                    email: data.email,
                    password: data.password,
                    phone_number: data.phone_number,
                    dob: data.dob,
                    city: data.city
                })
                .then(response => {
                    setLoading(false);
                    if (response.data?.message) {
                        successToast("top-right", response.data?.message);
                        resetForm();
                        navigate('/admin/customers/list');
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

    return (
        <React.Fragment>
            <Head title="Add customer" />
            <Content>
                <BlockHead size="lg" wide="sm">
                    <BlockHeadContent>
                        <BackTo link="/admin/customers/list" icon="arrow-left">
                            Customers
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
                                                <label className="form-label">
                                                    Billing type
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <RSelect name="billing_type" options={billingTypeOptions} value={formik.values.billing_type}
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
                                                <label className="form-label" htmlFor="password">
                                                    Password
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <input
                                                        type="text"
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
                                    <Row >
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
