import React, { useState } from "react";
import Logo from "../../images/logo.png";
import LogoDark from "../../images/logo-dark.png";
import PageContainer from "../../layout/page-container/PageContainer";
import Head from "../../layout/head/Head";
import { Block, BlockContent, BlockDes, BlockHead, BlockTitle, Button, PreviewCard } from "../../components/Component";
import { useNavigate, Link } from "react-router-dom";
import { Spinner } from "reactstrap";
import * as Yup from 'yup';
import { useFormik } from 'formik';
import { http } from '../../helpers';
import { toast } from "react-toastify";
import {
    Icon,
} from "../../components/Component";
import classnames from "classnames";
import { connect, useDispatch } from 'react-redux';
import ActionTypes from '../../store/action-types';

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const VerifyPhone = ({ onUserLogout }) => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const logOut = () => {
        onUserLogout();
        navigate('/login');
    }

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
            otp: '',
        },
        validationSchema: Yup.object({
            otp: Yup.string('Enter your OTP')
                .min(6, 'OTP should be of minimum 6 characters length')
                .required('OTP is required'),
        }),
        onSubmit: (values, { resetForm }) => {
            setLoading(true);
            http
                .post("/phone/verify", {
                    otp: values.otp,
                })
                .then(response => {
                    setLoading(false);
                    if (response.data?.status) {
                        dispatch({
                            type: ActionTypes.LOAD_USER,
                            currentUser: response.data.user,
                        })
                        successToast("top-right", response.data?.status);
                        resetForm();
                        navigate("/");
                    }
                })
                .catch(err => {
                    setLoading(false);
                    if (err.response.status === 422) {
                        execToast("bottom-center", err.response.data[Object.keys(err.response.data)[0]][0]);
                        if (err.response.data[Object.keys(err.response.data)[0]][0] === 'OTP Expired') {
                            onUserLogout();
                            navigate('/login');
                        }
                    } else {
                        execToast("bottom-center", err.message);
                    }
                })
        }
    });

    return (
        <React.Fragment>
            <Head title="Login" />
            <PageContainer>
                <Block className="nk-block-middle nk-auth-body  wide-xs">
                    <div className="brand-logo pb-4 text-center">
                        <Link to={process.env.PUBLIC_URL + "/"} className="logo-link">
                            <img className="logo-light logo-img logo-img-lg" src={Logo} alt="logo" />
                            <img className="logo-dark logo-img logo-img-lg" src={LogoDark} alt="logo-dark" />
                        </Link>
                    </div>
                    <PreviewCard className="card-bordered" bodyClass="card-inner-lg">
                        <BlockHead>
                            <BlockContent>
                                <BlockTitle tag="h5">Enter OTP code</BlockTitle>
                                <BlockDes>
                                    <p>Check your SMS or Email for an OTP code we just sent.</p>
                                </BlockDes>
                            </BlockContent>
                        </BlockHead>
                        <form className="is-alter" onSubmit={formik.handleSubmit}>
                            <div className="form-group">
                                <div className="form-label-group">
                                    <label className="form-label" htmlFor="otp">
                                        OTP
                                    </label>
                                </div>
                                <div className="form-control-wrap">
                                    <input
                                        type="text"
                                        id="otp"
                                        name="otp"
                                        value={formik.values.otp}
                                        onChange={formik.handleChange}
                                        placeholder="Enter OTP"
                                        className={classnames(
                                            'form-control-lg form-control',
                                            {
                                                'is-invalid': formik.touched.otp && formik.errors.otp
                                            }
                                        )}
                                    />
                                    {formik.touched.otp && formik.errors.otp ? (<span className="invalid">{formik.errors.otp}</span>) : null}
                                </div>
                            </div>
                            <div className="form-group">
                                <Button size="lg" className="btn-block" type="submit" color="primary">
                                    {loading ? <Spinner size="sm" color="light" /> : "Verify Code"}
                                </Button>
                            </div>
                        </form>
                        <div className="form-note-s2 text-center pt-4">
                            <a href="#login" onClick={(ev) => {
                                ev.preventDefault();
                                logOut();
                            }}>
                                <strong>Return to login</strong>
                            </a>
                        </div>
                    </PreviewCard>
                </Block>
            </PageContainer>
        </React.Fragment>
    );
};

const mapDispatchToProps = (dispatch) => ({
    onUserLogout: () => dispatch({ type: ActionTypes.LOGOUT_USER })
});

export default connect(null, mapDispatchToProps)(VerifyPhone);
