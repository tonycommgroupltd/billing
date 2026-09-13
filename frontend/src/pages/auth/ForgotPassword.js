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

const CloseButton = () => {
  return (
    <span className="btn-trigger toast-close-button" role="button">
      <Icon name="cross"></Icon>
    </span>
  );
};

const ForgotPassword = () => {
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
      phone: '',
    },
    validationSchema: Yup.object({
      phone: Yup.number('Enter a valid phone number')
        .required('Phone is required')
    }),
    onSubmit: (values, { resetForm }) => {
      setLoading(true);
      http
        .post("/forgot-password", {
          phone: values.phone
        })
        .then(response => {
          setLoading(false);
          if (response.data?.status) {
            successToast("bottom-center", response.data?.status);
            resetForm();
            navigate('/login')
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
                  <p>We shall send you instructions on how to reset on sms</p>
                </BlockDes>
              </BlockContent>
            </BlockHead>
            <form className="is-alter" onSubmit={formik.handleSubmit}>
              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="phone">
                    Phone Number
                  </label>
                </div>
                <div className="form-control-wrap">
                  <input
                    type="number"
                    id="phone"
                    name="phone"
                    value={formik.values.phone}
                    onChange={formik.handleChange}
                    placeholder="Enter your phone"
                    className="form-control form-control-lg"
                  />
                  {formik.touched.phone && formik.errors.phone ? (<span className="invalid">{formik.errors.phone}</span>) : null}
                </div>
              </div>
              <div className="form-group">
                <Button size="lg" className="btn-block" type="submit" color="primary">
                  {loading ? <Spinner size="sm" color="light" /> : "Reset Password"}
                </Button>
              </div>
            </form>
            <div className="form-note-s2 text-center pt-4">
              <Link to={`${process.env.PUBLIC_URL}/login`}>
                <strong>Return to login</strong>
              </Link>
            </div>
          </PreviewCard>
        </Block>
      </PageContainer>
    </React.Fragment>
  );
};

export default ForgotPassword;
