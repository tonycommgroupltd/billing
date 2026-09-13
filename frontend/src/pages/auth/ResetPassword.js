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
import { useParams } from 'react-router-dom';
import { connect, useDispatch } from 'react-redux';
import ActionTypes from '../../store/action-types';

const CloseButton = () => {
  return (
    <span className="btn-trigger toast-close-button" role="button">
      <Icon name="cross"></Icon>
    </span>
  );
};

const ResetPassword = ({ onUserLogout }) => {
  const { token } = useParams();
  const [loading, setLoading] = useState(false);
  const [passState, setPassState] = useState(false);
  const [passReState, setRePassState] = useState(false);
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
      password: '',
      passwordRetype: ''
    },
    validationSchema: Yup.object({
      password: Yup.string('Enter your password')
        .min(6, 'Password should be of minimum 6 characters length')
        .max(30, 'Password should be of maximum 30 characters length')
        .required('Password is required'),
      passwordRetype: Yup.string('Retype password')
        .min(6, 'Password should be of minimum 6 characters length')
        .max(30, 'Password should be of maximum 30 characters length')
        .required('Password is required')
        .when('password', {
          is: (val) => !!(val && val.length > 0),
          then: Yup.string().oneOf(
            [Yup.ref('password')],
            'Passwords do not match'
          )
        }),
    }),
    onSubmit: (values, { resetForm }) => {
      setLoading(true);
      http
        .post("/reset-password", {
          password: values.password,
          password_confirmation: values.passwordRetype,
          token: token
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
            navigate("/")
          }
        })
        .catch(err => {
          setLoading(false);
          if (err.response.status === 422) {
            execToast("bottom-center", err.response.data[Object.keys(err.response.data)[0]][0]);
          } else {
            execToast("bottom-center", err.message);
          }
        })
    }
  });

  return (
    <React.Fragment>
      <Head title="Reset Password" />
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
                <BlockTitle tag="h5">Reset password</BlockTitle>
                <BlockDes>
                  <p>Enter your new password below to reset.</p>
                </BlockDes>
              </BlockContent>
            </BlockHead>
            <form className="is-alter" onSubmit={formik.handleSubmit}>
              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="password">
                    Password
                  </label>
                </div>
                <div className="form-control-wrap">
                  <a
                    href="#password"
                    onClick={(ev) => {
                      ev.preventDefault();
                      setPassState(!passState);
                    }}
                    className={`form-icon lg form-icon-right passcode-switch ${passState ? "is-hidden" : "is-shown"}`}
                  >
                    <Icon name="eye" className="passcode-icon icon-show"></Icon>

                    <Icon name="eye-off" className="passcode-icon icon-hide"></Icon>
                  </a>
                  <input
                    type={passState ? "text" : "password"}
                    id="password"
                    name="password"
                    value={formik.values.password}
                    onChange={formik.handleChange}
                    placeholder="Enter your password"
                    className={`form-control-lg form-control ${passState ? "is-hidden" : "is-shown"}`}
                  />
                  {formik.touched.password && formik.errors.password ? (<span className="invalid">{formik.errors.password}</span>) : null}
                </div>
              </div>
              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="passwordRetype">
                    Retype Password
                  </label>
                </div>
                <div className="form-control-wrap">
                  <a
                    href="#passwordRetype"
                    onClick={(ev) => {
                      ev.preventDefault();
                      setRePassState(!passReState);
                    }}
                    className={`form-icon lg form-icon-right passcode-switch ${passReState ? "is-hidden" : "is-shown"}`}
                  >
                    <Icon name="eye" className="passcode-icon icon-show"></Icon>

                    <Icon name="eye-off" className="passcode-icon icon-hide"></Icon>
                  </a>
                  <input
                    type={passReState ? "text" : "password"}
                    id="passwordRetype"
                    name="passwordRetype"
                    value={formik.values.passwordRetype}
                    onChange={formik.handleChange}
                    placeholder="Retype password"
                    className={`form-control-lg form-control ${passReState ? "is-hidden" : "is-shown"}`}
                  />
                  {formik.touched.passwordRetype && formik.errors.passwordRetype ? (<span className="invalid">{formik.errors.passwordRetype}</span>) : null}
                </div>
              </div>
              <div className="form-group">
                <Button size="lg" className="btn-block" type="submit" color="primary">
                  {loading ? <Spinner size="sm" color="light" /> : "Reset Password"}
                </Button>
              </div>
            </form>
            <div className="form-note-s2 text-center pt-4">
              <div className="form-note-s2 text-center pt-4">
                <a href="#login" onClick={(ev) => {
                  ev.preventDefault();
                  logOut();
                }}>
                  <strong>Return to login</strong>
                </a>
              </div>
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

export default connect(null, mapDispatchToProps)(ResetPassword);
