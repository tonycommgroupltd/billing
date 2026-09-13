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
import { Form, Spinner } from "reactstrap";
import { useNavigate, Link, useLocation } from 'react-router-dom';
import * as Yup from 'yup';
import { useFormik } from 'formik';
import { connect } from 'react-redux';
import { loginWithJWT } from '../../store/actions/auth/loginAction';
import { FocusError } from 'focus-formik-error';

const Login = ({
  isAuthLoading,
  //thunk
  onUserLogin
}) => {
  const navigate = useNavigate();
  let { state } = useLocation();

  const formik = useFormik({
    initialValues: {
      email: '',
      password: ''
    },
    validationSchema: Yup.object({
      email: Yup.string('Enter your email or phone')
        //.email('Enter a valid email')
        .required('Email or phone is required'),
      password: Yup.string('Enter your password')
        .min(6, 'Password should be of minimum 6 characters length')
        .max(30, 'Password should be of maximum 30 characters length')
        .required('Password is required')
    }),
    onSubmit: (values) => {
      onUserLogin(values, navigate, state?.from);
    }
  });
  const [passState, setPassState] = useState(false);


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
                <BlockTitle tag="h4">Sign-In</BlockTitle>
                <BlockDes>
                  <p>Access {process.env.REACT_APP_SITE_TITLE} using your email or phone and password.</p>
                </BlockDes>
              </BlockContent>
            </BlockHead>
            <Form className="is-alter" onSubmit={formik.handleSubmit}>
              <FocusError formik={formik} />
              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="email">
                    Email or phone
                  </label>
                </div>
                <div className="form-control-wrap">
                  <input
                    type="text"
                    id="email"
                    name="email"
                    value={formik.values.email}
                    onChange={formik.handleChange}
                    placeholder="Enter your email or phone no."
                    className="form-control-lg form-control"
                  />
                  {formik.touched.email && formik.errors.email ? (<span className="invalid">{formik.errors.email}</span>) : null}
                </div>
              </div>
              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="password">
                    Password
                  </label>
                  <Link className="link link-primary link-sm" to={`${process.env.PUBLIC_URL}/password/reset`}>
                    Forgot Password?
                  </Link>
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
                <Button size="lg" className="btn-block" type="submit" color="primary">
                  {isAuthLoading ? <Spinner size="sm" color="light" /> : "Sign in"}
                </Button>
              </div>
            </Form>
            {process.env.SIGNUP && (
              <div className="form-note-s2 text-center pt-4">
                {" "}
                New on our platform? <Link to={`${process.env.PUBLIC_URL}/register`}>Create an account</Link>
              </div>
            )}
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
  onUserLogin: (token, navigate, from) => dispatch(loginWithJWT(token, navigate, from))
});

export default connect(mapStateToProps, mapDispatchToProps)(Login);
