import React, { useEffect, useState } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Modal, ModalBody, Card, Spinner, ModalFooter } from "reactstrap";
import {
    Block,
    BlockBetween,
    BlockDes,
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
import { useNavigate } from "react-router-dom";
// Bonus system disabled
// import BonusProfile from '../profile/BonusProfile';

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
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);

    // ── Change Password State (Forgot Password-like flow) ──
    // idle | request-code | enter-code
    const [pwdStep, setPwdStep] = useState("idle");
    const [identifier, setIdentifier] = useState("");
    const [maskedPhone, setMaskedPhone] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [otpId, setOtpId] = useState(null);
    const [resetUserId, setResetUserId] = useState(null);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdError, setPwdError] = useState("");
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        setIdentifier(user?.phone || "");
    }, [user]);

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
                                        <BlockDes>
                                            <p>Basic info, like your name and address, that you use on {process.env.REACT_APP_SITE_TITLE}.</p>
                                        </BlockDes>
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

                            {/* Bonus system disabled */}
                            {/* {user && user.email && user.all_roles && (user.all_roles.includes('technician') || user.all_roles.includes('engineer')) && (
                                <Block className="mt-4">
                                    <BonusProfile userEmail={user.email} />
                                </Block>
                            )} */}

                            {/* ── Change Password Section ── */}
                            <Block className="mt-5">
                                <div className="nk-data data-list">
                                    <div className="data-head">
                                        <h6 className="overline-title">Change Password</h6>
                                    </div>

                                    {pwdError && (
                                        <div className="alert alert-danger alert-sm mt-2 mx-3 mb-2" style={{ fontSize: 13 }}>
                                            <Icon name="alert-circle" className="me-1" />{pwdError}
                                        </div>
                                    )}

                                    {/* Step: idle */}
                                    {pwdStep === "idle" && (
                                        <div className="p-3">
                                            <p className="text-soft mb-2" style={{ fontSize: 13 }}>
                                                Reset your password using an SMS verification code (same flow as “Forgot Password”).
                                            </p>
                                            <Button
                                                color="primary"
                                                size="sm"
                                                onClick={() => {
                                                    setPwdStep("request-code");
                                                    setPwdError("");
                                                    setOtpCode("");
                                                    setOtpId(null);
                                                    setResetUserId(null);
                                                    setMaskedPhone("");
                                                    setNewPassword("");
                                                    setConfirmPassword("");
                                                    setShowNew(false);
                                                    setShowConfirm(false);
                                                    setIdentifier(user?.phone || "");
                                                }}
                                            >
                                                <Icon name="lock" className="me-1" />Change Password
                                            </Button>
                                        </div>
                                    )}

                                    {/* Step: request verification code */}
                                    {pwdStep === "request-code" && (
                                        <div className="p-3">
                                            <p className="text-soft mb-2" style={{ fontSize: 13 }}>
                                                Enter your registered phone number. We&apos;ll send a 6-digit verification code to that number.
                                            </p>
                                            <Row className="g-2 align-items-end">
                                                <Col sm="6">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Phone Number</label>
                                                    <input
                                                        type="tel"
                                                        className="form-control"
                                                        placeholder="07XXXXXXXX"
                                                        value={identifier}
                                                        onChange={e => { setIdentifier(e.target.value); setPwdError(""); }}
                                                    />
                                                </Col>
                                                <Col sm="6" className="d-flex gap-2">
                                                    <Button
                                                        color="primary"
                                                        size="sm"
                                                        disabled={pwdLoading || !identifier.trim()}
                                                        onClick={() => {
                                                            setPwdLoading(true);
                                                            setPwdError("");
                                                            http.post("/forgot-password", { identifier: identifier.trim() }).then(res => {
                                                                if (res.data?.success) {
                                                                    setOtpId(res.data.otp_id);
                                                                    setResetUserId(res.data.user_id);
                                                                    setMaskedPhone(res.data.masked_phone);
                                                                    setPwdStep("enter-code");
                                                                    setOtpCode("");
                                                                    successToast("top-right", res.data.message);
                                                                }
                                                            }).catch(err => {
                                                                setPwdError(err.response?.data?.error || "Failed to send verification code");
                                                            }).finally(() => setPwdLoading(false));
                                                        }}
                                                    >
                                                        {pwdLoading ? <Spinner size="sm" /> : <><Icon name="send" className="me-1" />Send Code</>}
                                                    </Button>
                                                    <Button
                                                        color="light"
                                                        size="sm"
                                                        onClick={() => {
                                                            setPwdStep("idle");
                                                            setPwdError("");
                                                            setOtpCode("");
                                                            setOtpId(null);
                                                            setResetUserId(null);
                                                            setMaskedPhone("");
                                                            setNewPassword("");
                                                            setConfirmPassword("");
                                                        }}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </Col>
                                            </Row>
                                        </div>
                                    )}

                                    {/* Step: verify OTP + reset password */}
                                    {pwdStep === "enter-code" && (
                                        <div className="p-3">
                                            <p className="text-soft mb-3" style={{ fontSize: 13 }}>
                                                We sent a 6-digit code to <strong>{maskedPhone}</strong>. Enter it below with your new password.
                                            </p>
                                            <Row className="g-3">
                                                <Col md="4">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Verification Code</label>
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        maxLength={6}
                                                        placeholder="000000"
                                                        value={otpCode}
                                                        onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                                    />
                                                </Col>
                                                <Col md="4">
                                                    <label className="form-label" style={{ fontSize: 12 }}>New Password</label>
                                                    <div className="form-control-wrap">
                                                        <a
                                                            href="#toggle"
                                                            className="form-icon form-icon-right passcode-switch"
                                                            onClick={(e) => { e.preventDefault(); setShowNew(!showNew); }}
                                                        >
                                                            <Icon name={showNew ? "eye-off" : "eye"} />
                                                        </a>
                                                        <input
                                                            type={showNew ? "text" : "password"}
                                                            className="form-control"
                                                            value={newPassword}
                                                            onChange={e => setNewPassword(e.target.value)}
                                                        />
                                                    </div>
                                                </Col>
                                                <Col md="4">
                                                    <label className="form-label" style={{ fontSize: 12 }}>Confirm New Password</label>
                                                    <div className="form-control-wrap">
                                                        <a
                                                            href="#toggle"
                                                            className="form-icon form-icon-right passcode-switch"
                                                            onClick={(e) => { e.preventDefault(); setShowConfirm(!showConfirm); }}
                                                        >
                                                            <Icon name={showConfirm ? "eye-off" : "eye"} />
                                                        </a>
                                                        <input
                                                            type={showConfirm ? "text" : "password"}
                                                            className="form-control"
                                                            value={confirmPassword}
                                                            onChange={e => setConfirmPassword(e.target.value)}
                                                        />
                                                    </div>
                                                    {confirmPassword && newPassword !== confirmPassword && (
                                                        <span className="text-danger" style={{ fontSize: 11 }}>Passwords do not match</span>
                                                    )}
                                                </Col>
                                                <Col md="8" className="d-flex align-items-end gap-2">
                                                    <Button
                                                        color="success"
                                                        size="sm"
                                                        disabled={
                                                            pwdLoading ||
                                                            otpCode.length !== 6 ||
                                                            !newPassword ||
                                                            newPassword.length < 6 ||
                                                            newPassword !== confirmPassword
                                                        }
                                                        onClick={() => {
                                                            setPwdLoading(true);
                                                            setPwdError("");
                                                            http.post("/reset-password", {
                                                                otp_id: otpId,
                                                                otp: otpCode,
                                                                user_id: resetUserId,
                                                                password: newPassword,
                                                            }).then(res => {
                                                                if (res.data?.success) {
                                                                    successToast("top-right", res.data.message);
                                                                    dispatch({ type: ActionTypes.LOGOUT_USER });

                                                                    setPwdStep("idle");
                                                                    setOtpCode("");
                                                                    setOtpId(null);
                                                                    setResetUserId(null);
                                                                    setMaskedPhone("");
                                                                    setNewPassword("");
                                                                    setConfirmPassword("");

                                                                    setTimeout(() => navigate("/login"), 2000);
                                                                }
                                                            }).catch(err => {
                                                                setPwdError(err.response?.data?.error || "Password reset failed");
                                                            }).finally(() => setPwdLoading(false));
                                                        }}
                                                    >
                                                        {pwdLoading ? <Spinner size="sm" /> : <><Icon name="check-circle" className="me-1" />Reset Password</>}
                                                    </Button>
                                                    <Button
                                                        color="light"
                                                        size="sm"
                                                        onClick={() => {
                                                            setPwdStep("idle");
                                                            setPwdError("");
                                                            setOtpCode("");
                                                            setOtpId(null);
                                                            setResetUserId(null);
                                                            setMaskedPhone("");
                                                            setNewPassword("");
                                                            setConfirmPassword("");
                                                        }}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </Col>
                                            </Row>
                                        </div>
                                    )}
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
