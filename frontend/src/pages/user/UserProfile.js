import React, { useEffect, useState } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Modal, ModalBody, Card, Spinner, ModalFooter } from "reactstrap";
import {
    Block,
    BlockBetween,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
    Icon,
    Row,
    Col,
    Button,
} from "../../components/Component";
import { connect, useDispatch } from 'react-redux';
import ActionTypes from '../../store/action-types';
import UserProfileAside from "./UserProfileAside";
import * as Yup from 'yup';
import { useFormik } from 'formik';
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

const UserProfile = ({ user }) => {
    const [sm, updateSm] = useState(false);
    const [mobileView, setMobileView] = useState(false);
    const dispatch = useDispatch();

    const [loading, setLoading] = useState(false);

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

    // function to change the design view under 990 px
    const viewChange = () => {
        if (window.innerWidth < 990) {
            setMobileView(true);
        } else {
            setMobileView(false);
            updateSm(false);
        }
    };

    useEffect(() => {
        viewChange();
        window.addEventListener("load", viewChange);
        window.addEventListener("resize", viewChange);
        document.getElementsByClassName("nk-header")[0].addEventListener("click", function () {
            updateSm(false);
        });
        return () => {
            window.removeEventListener("resize", viewChange);
            window.removeEventListener("load", viewChange);
        };
    }, []);
    const [modal, setModal] = useState(false);

    const formik = useFormik({
        initialValues: {
            name: user.name,
            email: user.email,
        },
        validationSchema: Yup.object({
            name: Yup.string('Enter your full name')
                .required('Full name is required'),
            email: Yup.string('Enter your email')
                .email('Enter a valid email'),
        }),
        onSubmit: (data) => {
            setLoading(true);
            http
                .post("/update-profile", {
                    name: data.name,
                    email: data.email,
                })
                .then(response => {
                    setLoading(false);
                    if (response.data?.status) {
                        dispatch({
                            type: ActionTypes.LOAD_USER,
                            currentUser: response.data.user,
                        })
                        successToast("top-right", response.data?.status);
                        setModal(false);
                    }
                })
                .catch(err => {
                    setLoading(false);
                    if (err.response.status === 422) {
                        execToast("top-right", err.response.data[Object.keys(err.response.data)[0]][0]);
                    } else {
                        execToast("top-right", err.message);
                    }
                })
        }
    });

    return (
        <React.Fragment>
            <Head title="Profile"></Head>
            <Content>
                <Card className="card-bordered">
                    <div className="card-aside-wrap">
                        <div
                            className={`card-aside card-aside-left user-aside toggle-slide toggle-slide-left toggle-break-lg ${sm ? "content-active" : ""
                                }`}
                        >
                            <UserProfileAside updateSm={updateSm} sm={sm} user={user} />
                        </div>
                        <div className="card-inner card-inner-lg">
                            {sm && mobileView && <div className="toggle-overlay" onClick={() => updateSm(!sm)}></div>}
                            <BlockHead size="lg">
                                <BlockBetween>
                                    <BlockHeadContent>
                                        <BlockTitle tag="h4">Personal Information</BlockTitle>
                                    </BlockHeadContent>
                                    <BlockHeadContent className="align-self-start d-lg-none">
                                        <Button
                                            className={`toggle btn btn-icon btn-trigger mt-n1 ${sm ? "active" : ""}`}
                                            onClick={() => updateSm(!sm)}
                                        >
                                            <Icon name="menu-alt-r"></Icon>
                                        </Button>
                                    </BlockHeadContent>
                                </BlockBetween>
                            </BlockHead>

                            <Block>
                                <div className="nk-data data-list">
                                    <div className="data-head">
                                        <h6 className="overline-title">Basics</h6>
                                    </div>
                                    <div className="data-item" onClick={() => setModal(true)}>
                                        <div className="data-col">
                                            <span className="data-label">Full Name</span>
                                            <span className="data-value">{user.name}</span>
                                        </div>
                                        <div className="data-col data-col-end">
                                            <span className="data-more">
                                                <Icon name="forward-ios"></Icon>
                                            </span>
                                        </div>
                                    </div>
                                    <div className="data-item">
                                        <div className="data-col">
                                            <span className="data-label">Phone Number</span>
                                            <span className="data-value text-soft">{user.phone}</span>
                                        </div>
                                        <div className="data-col data-col-end">
                                            <span className="data-more">
                                                <Icon name="lock-alt"></Icon>
                                            </span>
                                        </div>
                                    </div>
                                    <div className="data-item" onClick={() => setModal(true)}>
                                        <div className="data-col">
                                            <span className="data-label">Email</span>
                                            <span className="data-value">{user.email}</span>
                                        </div>
                                        <div className="data-col data-col-end">
                                            <span className="data-more disable">
                                                <Icon name="forward-ios"></Icon>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Block>

                            <Modal isOpen={modal} className="modal-dialog-centered" size="lg" toggle={() => {
                                setModal(false);
                                formik.resetForm();
                            }
                            }>
                                <a
                                    href="#dropdownitem"
                                    onClick={(ev) => {
                                        ev.preventDefault();
                                        setModal(false);
                                        formik.resetForm()
                                    }}
                                    className="close"
                                >
                                    <Icon name="cross-sm"></Icon>
                                </a>
                                <ModalBody>
                                    <div className="p-2">
                                        <h5 className="title">Update Profile</h5>
                                        <form className="gy-3 is-alter" onSubmit={formik.handleSubmit}>
                                            <FocusError formik={formik} />
                                            <Row className="align-center">
                                                <Col md="4" className="col-form-label">
                                                    <div className="form-group">
                                                        <label className="form-label" htmlFor="name">
                                                            Full Name
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
                                            <Row>
                                                <Col md="12">
                                                    <div className="form-group mt-2">
                                                        <Button type="submit" color="primary" className="pull-right">
                                                            {loading ? <Spinner size="sm" color="light" /> : "Update"}
                                                        </Button>
                                                    </div>
                                                </Col>
                                            </Row>
                                        </form>
                                    </div>
                                </ModalBody>
                                <ModalFooter>
                                    <Button
                                        className="p-0 m-0"
                                        onClick={(ev) => {
                                            ev.preventDefault();
                                            setModal(false);
                                            formik.resetForm()
                                        }}
                                    >
                                        Close
                                    </Button>
                                </ModalFooter>
                            </Modal>
                        </div>
                    </div>
                </Card>
            </Content>
        </React.Fragment>
    );
};
const mapStateToProps = (state) => ({
    user: state.auth.currentUser
});

export default connect(mapStateToProps)(UserProfile);
