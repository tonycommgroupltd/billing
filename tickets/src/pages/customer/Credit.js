import React, { useState } from "react";
import { useNavigate, Link, useParams } from "react-router-dom";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { Row, Col, Spinner } from "reactstrap";
import * as Yup from 'yup';
import { useFormik } from 'formik';
import {
    Block,
    BlockHead,
    BlockHeadContent,
    BlockBetween,
    BlockDes,
    BlockTitle,
    PreviewCard,
    Button,
    RSelect,
    Icon,
} from "../../components/Component";
import { creditOptions } from "../components/forms/SelectData";
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

const Credit = ({ ...props }) => {
    const { id } = useParams();
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
            credit_type: '',
            amount: '',
            reason: '',
        },
        validationSchema: Yup.object({
            amount: Yup.number('Enter amount')
                .positive()
                .required('Amount is required')
                .min(1),
            reason: Yup.string('Enter reason')
                .required('Reason is required'),
        }).shape({
            credit_type: Yup.object().shape({
                value: Yup.string().required('Type is required')
            }),
        }),
        onSubmit: (data, { resetForm }) => {
            setLoading(true);
            http
                .post(`/add-credits/${id}`, {
                    credit_type: data.credit_type,
                    amount: data.amount,
                    reason: data.reason,
                })
                .then(response => {
                    setLoading(false);
                    if (response.data?.message) {
                        successToast("top-right", response.data?.message);
                        resetForm();
                        navigate(`/admin/customers/view/${id}`);
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
            <Head title="Add or Deduct Credit Units" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle tag="h6" page className="fs-18">
                                Add or Deduct Credit Units
                            </BlockTitle>
                            <BlockDes className="text-soft">
                                <p>Manually Add or Deduct Sms Units from a customer</p>
                            </BlockDes>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <Link to={`/admin/customers/view/${id}`} className="btn btn-light d-none d-sm-inline-flex">
                                <Icon name="arrow-left"></Icon>
                                <span>Back to Customer</span>
                            </Link>
                            <Link to={`/admin/customers/view/${id}`} className="btn btn-icon btn-outline-light bg-white d-inline-flex d-sm-none">
                                <Icon name="arrow-left"></Icon>
                            </Link>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>

                <Block size="lg">
                    <Row className="g-gs">
                        <Col md="12">
                            <PreviewCard>
                                <form className="gy-3 is-alter custom-form" onSubmit={formik.handleSubmit}>
                                    <FocusError formik={formik} />
                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label">
                                                    Type
                                                    <span className="text-secondary">&nbsp;(required)</span>
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <RSelect name="credit_type" options={creditOptions} value={formik.values.credit_type}
                                                        onChange={(option) => formik.setFieldValue("credit_type", option)} placeholder="-- Select type --" />
                                                    {formik.touched.credit_type && formik.errors.credit_type ? (<p className="invalid">{formik.errors.credit_type?.value}</p>) : null}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>
                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label" htmlFor="amount">
                                                    Amount
                                                    <span className="text-secondary">&nbsp;(required)</span>
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
                                                                'is-invalid': formik.touched.amount && formik.errors.amount
                                                            }
                                                        )}
                                                        name="amount"
                                                        value={formik.values.amount}
                                                        onChange={formik.handleChange}
                                                    />
                                                    {formik.touched.amount && formik.errors.amount ? (<p className="invalid">{formik.errors.amount}</p>) : null}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    <Row className="align-center">
                                        <Col md="4" className="col-form-label">
                                            <div className="form-group">
                                                <label className="form-label" htmlFor="reason">
                                                    Reason
                                                    <span className="text-secondary">&nbsp;(required)</span>
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <textarea
                                                        id="reason"
                                                        className={classnames(
                                                            'form-control',
                                                            {
                                                                'is-invalid': formik.touched.reason && formik.errors.reason
                                                            }
                                                        )}
                                                        name="reason"
                                                        value={formik.values.reason}
                                                        onChange={formik.handleChange}
                                                    />
                                                    {formik.touched.reason && formik.errors.reason ? (<p className="invalid">{formik.errors.reason}</p>) : null}
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

export default Credit;
