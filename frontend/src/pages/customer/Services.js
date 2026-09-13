import React, { useState, useEffect } from "react";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { Modal, ModalHeader, ModalBody, ModalFooter, Row, Col, Spinner } from "reactstrap";
import {
    Block,
    BlockHead,
    BlockBetween,
    BlockHeadContent,
    BlockTitle,
    Button,
    RSelect,
    Icon,
} from "../../components/Component";
import { http } from '../../helpers';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import { serviceOptionsCust } from "../components/forms/SelectData";
import { FocusError } from 'focus-formik-error';
import { toast } from "react-toastify";
import { Edit20Regular } from '@fluentui/react-icons';
import dateFormat from 'dateformat';
import { connect } from 'react-redux';

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const Services = ({ user }) => {
    const [serviceId, setServiceId] = useState(0);
    const [formData, setFormData] = useState([]);
    const [data, setData] = useState([]);
    const navigate = useNavigate();
    const [apiLoading, setApiLoading] = useState(false);
    const [api3Loading, setApi3Loading] = useState(false);
    const [reload, setReload] = useState(false);
    const [editModal, setEditModal] = useState(false);
    const [formLoading, setFormLoading] = useState(false);

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

    const formikEdit = useFormik({
        initialValues: {
            id: formData?.id ?? 0,
            status: formData?.status ?? ''
        },
        enableReinitialize: true,
        onSubmit: (data) => {
            setFormLoading(true);
            http
                .post(`/update-customer-services/${data.id}`, {
                    status: data.status
                })
                .then(response => {
                    setFormLoading(false);
                    if ((response.data?.message && response.data?.error)) {
                        execToast("top-right", response.data?.message);
                    }
                    else {
                        successToast("top-right", response.data?.message);
                        //resetForm();
                        toggleEdit();
                        setReload(!reload);
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

    useEffect(() => {

        const fetchServices = async (id) => {
            setApiLoading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/list-customer-services`);

                    if (response.data?.services) {
                        setData(response.data);
                    }
                }
                setApiLoading(false);
            } catch (error) {
                setApiLoading(false);
            }
        };

        fetchServices(user.id);

    }, [user.id, reload]);

    useEffect(() => {
        const fetchService = async (id) => {

            setApi3Loading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/view-services/${id}`);

                    if (response.data?.service) {
                        setFormData(response.data?.service);
                    }
                }
                setApi3Loading(false);
            } catch (error) {
                setApi3Loading(false);
            }
        };

        if (serviceId > 0) { fetchService(serviceId) };
    }, [serviceId]);

    const toggleEdit = () => {
        setEditModal(!editModal);
    };

    return (
        <>
            <Head title="Services" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle tag="h6" page className="fs-18">
                                My services
                            </BlockTitle>
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
                    <div className="main-content-holder p-20">
                        <Row>
                            <Col>
                                <div className="services-wrapper">
                                    {apiLoading && <p>Loading...</p>}
                                    {data && data.services && data.services.map(service => (
                                        <div className="service-card" key={service.id}>
                                            <div className={"badge status" + (service.online === 1 ? " bg-success" : service.status['value'] === 2 ? " bg-primary" : service.status['value'] === 1 ? " bg-light" : " bg-warning")}> {service.online === 1 ? 'Online' : service.status['label']} </div>
                                            <div className={"type" + (service.online === 1 ? " color-success" : service.status['value'] === 2 ? " color-primary" : service.status['value'] === 1 ? " color-light" : " color-warning")}> Internet </div>
                                            <div className="title mb-12"> {service.plan_title} </div>
                                            <div className="d-flex flex-wrap align-items-center justify-content-center mb-16">
                                                <span className="text-secondary me-8"> Service due date </span>
                                                <span className="title"> {dateFormat(service.bill_to, "dd-mm-yyyy")} </span>
                                            </div>
                                            <div className="d-flex flex-wrap align-items-center justify-content-center mb-16">
                                                <span className="text-secondary me-8"> Mikrotik name </span>
                                                <span className="title"> {service.mikrotik_name} </span>
                                            </div>
                                            {user && user.all_roles.includes("reseller") && <div className="actions">
                                                <div
                                                    className="button-link"
                                                    onClick={() => {
                                                        setServiceId(parseInt(service.id));
                                                        toggleEdit();
                                                    }}
                                                >
                                                    <Edit20Regular />
                                                </div>
                                            </div>}
                                        </div>
                                    ))}
                                </div>
                                {data && data.services && !data.services.length && <div className="checkout-info mt-160">
                                    <div className="checkout-info-title"> You do not currently have any active services </div>
                                    <div className="checkout-info-description"> Please contact us to order a new service </div>
                                </div>}
                            </Col>
                        </Row>
                    </div>
                </Block>
            </Content>

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

export default connect(mapStateToProps)(Services);
