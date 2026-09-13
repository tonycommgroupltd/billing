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
    Icon,
} from "../../../components/Component";
import { FocusError } from 'focus-formik-error';
import { http } from '../../../helpers';
import { toast } from "react-toastify";
import classnames from "classnames";
import { AsyncPaginate } from 'react-select-async-paginate';
import AsyncSelect from 'react-select/async';

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
    const [inputValue, setValue] = useState('');

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

    const fetchRouters = async (search, loadedOptions, { page }) => {
        return http.get(`/get-routers?q=${search}&page=${page}`).then(result => {

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

    const fetchProfiles = async () => {
        return http.get(`/get-profiles/${inputValue}`).then(result => {
            const res = result.data;
            return res;
        });
    }

    const formik = useFormik({
        initialValues: {
            router: '',
            title: '',
            price: 0,
            rate_limit: '',
        },
        validationSchema: Yup.object({
            title: Yup.string('Title')
                .required('Title is required'),
        }).shape({
            router: Yup.object().shape({
                id: Yup.string().required('Router is required')
            }),
            rate_limit: Yup.object().shape({
                value: Yup.string().required('Rate limit is required')
            }),
        }),
        onSubmit: (data, { resetForm }) => {
            setLoading(true);
            http
                .post("/add-plans", {
                    router_id: data.router.id,
                    title: data.title,
                    price: data.price,
                    rate_limit: data.rate_limit,
                })
                .then(response => {
                    setLoading(false);
                    if (response.data?.message) {
                        successToast("top-right", response.data?.message);
                        resetForm();
                        navigate('/admin/tariffs/internet');
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
            <Head title="Tariff plans" />
            <Content>
                <BlockHead size="lg" wide="sm">
                    <BlockHeadContent>
                        <BackTo link="/admin/tariffs/internet" icon="arrow-left">
                            Tariff plans
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
                                                    Router
                                                    <span className="text-secondary">&nbsp;(required)</span>
                                                </label>
                                            </div>
                                        </Col>
                                        <Col md="8">
                                            <div className="form-group">
                                                <div className="form-control-wrap">
                                                    <div className="form-control-select">
                                                        <AsyncPaginate
                                                            className={`react-select-container`}
                                                            classNamePrefix="react-select"
                                                            cacheOptions
                                                            defaultOptions
                                                            getOptionLabel={e => e.title}
                                                            getOptionValue={e => e.id}
                                                            loadOptions={fetchRouters}
                                                            value={formik.values.router}
                                                            //onInputChange={(value) => console.log(value)}
                                                            onChange={
                                                                (option) => {
                                                                    formik.setFieldValue("router", option);
                                                                    setValue(option.id);
                                                                }
                                                            }
                                                            additional={{
                                                                page: 1,
                                                            }}
                                                        />
                                                    </div>
                                                    {formik.touched.router && formik.errors.router ? (<p className="invalid">{formik.errors.router?.id}</p>) : null}
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
                                                                'is-invalid': formik.touched.price && formik.errors.price
                                                            }
                                                        )}
                                                        name="price"
                                                        value={formik.values.price}
                                                        onChange={formik.handleChange}
                                                    />
                                                    {formik.touched.price && formik.errors.price ? (<p className="invalid">{formik.errors.price}</p>) : null}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>
                                    {inputValue ?
                                        <Row className="align-center">
                                            <Col md="4" className="col-form-label">
                                                <div className="form-group">
                                                    <label className="form-label">
                                                        Rate Limit
                                                        <span className="text-secondary">&nbsp;(required)</span>
                                                    </label>
                                                </div>
                                            </Col>
                                            <Col md="8">
                                                <div className="form-group">
                                                    <div className="form-control-wrap">
                                                        <div className="form-control-select">
                                                            <AsyncSelect
                                                                className={`react-select-container`}
                                                                classNamePrefix="react-select"
                                                                cacheOptions
                                                                defaultOptions
                                                                isSearchable={false}
                                                                value={formik.values.rate_limit}
                                                                loadOptions={fetchProfiles}
                                                                onChange={(option) => formik.setFieldValue("rate_limit", option)}
                                                            />
                                                        </div>
                                                        {formik.touched.rate_limit && formik.errors.rate_limit ? (<p className="invalid">{formik.errors.rate_limit?.value}</p>) : null}
                                                    </div>
                                                </div>
                                            </Col>
                                        </Row>
                                        :
                                        ""
                                    }
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
