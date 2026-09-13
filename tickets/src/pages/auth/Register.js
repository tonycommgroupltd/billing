import React, { useState } from "react";
import Logo from "../../images/logo.png";
import LogoDark from "../../images/logo-dark.png";
import PageContainer from "../../layout/page-container/PageContainer";
import Head from "../../layout/head/Head";
import {
  Block,
  BlockContent,
  BlockDes,
  BlockHead,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
} from "../../components/Component";
import { Spinner } from "reactstrap";
import { useNavigate, Link } from "react-router-dom";
import * as Yup from 'yup';
import { useFormik } from 'formik';
import { connect } from 'react-redux';
import registerWithJWT from '../../store/actions/auth/registerAction';
import { FocusError } from 'focus-formik-error';
import classnames from "classnames";

const phoneRegex = RegExp(
  /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/
);

const Register = ({
  isAuthLoading,
  onUserRegister
}) => {
  const [passState, setPassState] = useState(false);
  const [passReState, setRePassState] = useState(false);
  const navigate = useNavigate();

  const formik = useFormik({
    initialValues: {
      name: '',
      phone: '',
      email: '',
      password: '',
      passwordRetype: ''
    },
    validationSchema: Yup.object({
      name: Yup.string('Name')
        .required('Name is required'),
      phone: Yup.string().matches(phoneRegex, "Invalid characters in phone number field (allowed only 0-9)").required("Phone is required"),
      email: Yup.string('Enter your email')
        .email('Enter a valid email'),
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
      onUserRegister(values, resetForm, navigate);
    }
  });
  return (
    <React.Fragment>
      <Head title="Register" />
      <PageContainer>
        <Block className="nk-block-middle nk-auth-body  wide-xs">
          <div className="brand-logo pb-4 text-center">
            <Link to={`${process.env.PUBLIC_URL}/`} className="logo-link">
              <img className="logo-light logo-img logo-img-lg" src={Logo} alt="logo" />
              <img className="logo-dark logo-img logo-img-lg" src={LogoDark} alt="logo-dark" />
            </Link>
          </div>
          <PreviewCard className="card-bordered" bodyClass="card-inner-lg">
            <BlockHead>
              <BlockContent>
                <BlockTitle tag="h4">Register</BlockTitle>
                <BlockDes>
                  <p>Create New {process.env.REACT_APP_SITE_TITLE} Account</p>
                </BlockDes>
              </BlockContent>
            </BlockHead>
            <form className="is-alter" onSubmit={formik.handleSubmit}>
              <FocusError formik={formik} />
              <div className="form-group">
                <label className="form-label" htmlFor="name">
                  Name
                </label>
                <div className="form-control-wrap">
                  <input
                    type="text"
                    id="name"
                    name="name"
                    placeholder="Enter your name"
                    value={formik.values.name}
                    onChange={formik.handleChange}
                    className={classnames(
                      'form-control-lg form-control',
                      {
                        'is-invalid': formik.touched.name && formik.errors.name
                      }
                    )}
                  />
                  {formik.touched.name && formik.errors.name ? (<p className="invalid">{formik.errors.name}</p>) : null}
                </div>
              </div>
              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="phone">
                    Phone
                  </label>
                </div>
                <div className="form-control-wrap">
                  <input
                    type="text"
                    bssize="lg"
                    id="phone"
                    name="phone"
                    value={formik.values.phone}
                    onChange={formik.handleChange}
                    className={classnames(
                      'form-control-lg form-control',
                      {
                        'is-invalid': formik.touched.phone && formik.errors.phone
                      }
                    )}
                    placeholder="Enter your phone number e.g 0712345678"
                  />
                  {formik.touched.phone && formik.errors.phone ? (<p className="invalid">{formik.errors.phone}</p>) : null}
                </div>
              </div>
              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="email">
                    Email
                  </label>
                </div>
                <div className="form-control-wrap">
                  <input
                    type="email"
                    bssize="lg"
                    id="email"
                    name="email"
                    value={formik.values.email}
                    onChange={formik.handleChange}
                    className="form-control-lg form-control"
                    placeholder="Enter your email address"
                  />
                  {formik.touched.email && formik.errors.email ? (<p className="invalid">{formik.errors.email}</p>) : null}
                </div>
              </div>
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
                    className={classnames(
                      `form-control-lg form-control ${passState ? "is-hidden" : "is-shown"}`,
                      {
                        'is-invalid': formik.touched.password && formik.errors.password
                      }
                    )}
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
                    className={classnames(
                      `form-control-lg form-control ${passReState ? "is-hidden" : "is-shown"}`,
                      {
                        'is-invalid': formik.touched.passwordRetype && formik.errors.passwordRetype
                      }
                    )}
                  />
                  {formik.touched.passwordRetype && formik.errors.passwordRetype ? (<span className="invalid">{formik.errors.passwordRetype}</span>) : null}
                </div>
              </div>
              <div className="form-group">
                <Button type="submit" color="primary" size="lg" className="btn-block">
                  {isAuthLoading ? <Spinner size="sm" color="light" /> : "Register"}
                </Button>
              </div>
            </form>
            <div className="form-note-s2 text-center pt-4">
              {" "}
              Already have an account?{" "}
              <Link to={`${process.env.PUBLIC_URL}/login`}>
                <strong>Sign in</strong>
              </Link>
            </div>
          </PreviewCard>
        </Block>
      </PageContainer>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => {
  const {
    isAuthLoading,
  } = state.auth;
  return {
    isAuthLoading,
  }
}

const mapDispatchToProps = (dispatch) => ({
  onUserRegister: (values, resetForm, navigate) => dispatch(registerWithJWT(values, resetForm, navigate))
});
export default connect(mapStateToProps, mapDispatchToProps)(Register);
