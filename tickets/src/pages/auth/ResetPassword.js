import React, { useState } from "react";
import Logo from "../../images/logo.png";
import LogoDark from "../../images/logo-dark.png";
import PageContainer from "../../layout/page-container/PageContainer";
import Head from "../../layout/head/Head";
import { Block, BlockContent, BlockDes, BlockHead, BlockTitle, Button, Icon, PreviewCard } from "../../components/Component";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Spinner } from "reactstrap";
import { http } from '../../helpers';
import { toast } from "react-toastify";

const CloseButton = () => (
  <span className="btn-trigger toast-close-button" role="button">
    <Icon name="cross" />
  </span>
);

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { otp_id, masked_phone, user_id } = location.state || {};

  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [passState, setPassState] = useState(false);
  const [confirmPassState, setConfirmPassState] = useState(false);

  // Redirect if no state data (user navigated here directly)
  if (!otp_id || !user_id) {
    return (
      <React.Fragment>
        <Head title="Reset Password" />
        <PageContainer>
          <Block className="nk-block-middle nk-auth-body  wide-xs">
            <PreviewCard className="card-bordered" bodyClass="card-inner-lg">
              <BlockHead>
                <BlockContent>
                  <BlockTitle tag="h5">Invalid Request</BlockTitle>
                  <BlockDes>
                    <p>Please start the password reset process again.</p>
                  </BlockDes>
                </BlockContent>
              </BlockHead>
              <div className="form-group">
                <Link to={`${process.env.PUBLIC_URL}/password/reset`}>
                  <Button size="lg" className="btn-block" color="primary">
                    Go to Forgot Password
                  </Button>
                </Link>
              </div>
            </PreviewCard>
          </Block>
        </PageContainer>
      </React.Fragment>
    );
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (otp.length !== 6) { setError("Enter the 6-digit verification code"); return; }
    if (!password || password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }

    setLoading(true);
    http.post("/reset-password", {
      otp_id: otp_id,
      otp: otp,
      user_id: user_id,
      password: password,
    })
      .then(res => {
        if (res.data?.success) {
          toast.success(res.data.message || "Password reset successfully!", { position: "bottom-center", closeButton: <CloseButton /> });
          setTimeout(() => navigate("/login"), 2000);
        }
      })
      .catch(err => {
        const msg = err.response?.data?.error || "An error occurred. Please try again.";
        setError(msg);
        toast.error(msg, { position: "bottom-center", closeButton: <CloseButton /> });
      })
      .finally(() => setLoading(false));
  };

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
                <BlockTitle tag="h5">Enter Verification Code</BlockTitle>
                <BlockDes>
                  <p>We sent a 6-digit code to <strong>{masked_phone}</strong>. Enter it below with your new password.</p>
                </BlockDes>
              </BlockContent>
            </BlockHead>

            {error && (
              <div className="alert alert-danger" style={{ fontSize: 13 }}>
                <Icon name="alert-circle" className="me-1" />{error}
              </div>
            )}

            <form className="is-alter" onSubmit={handleSubmit}>
              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="otp">Verification Code</label>
                </div>
                <div className="form-control-wrap">
                  <input
                    type="text"
                    id="otp"
                    value={otp}
                    onChange={e => { setOtp(e.target.value.replace(/\D/g, "")); setError(""); }}
                    placeholder="Enter 6-digit code"
                    className="form-control form-control-lg"
                    maxLength="6"
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="password">New Password</label>
                </div>
                <div className="form-control-wrap">
                  <a href="#password" onClick={e => { e.preventDefault(); setPassState(!passState); }}
                    className={`form-icon lg form-icon-right passcode-switch ${passState ? "is-hidden" : "is-shown"}`}>
                    <Icon name="eye" className="passcode-icon icon-show" />
                    <Icon name="eye-off" className="passcode-icon icon-hide" />
                  </a>
                  <input
                    type={passState ? "text" : "password"}
                    id="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    className={`form-control-lg form-control ${passState ? "is-hidden" : "is-shown"}`}
                  />
                </div>
              </div>

              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
                </div>
                <div className="form-control-wrap">
                  <a href="#confirmPassword" onClick={e => { e.preventDefault(); setConfirmPassState(!confirmPassState); }}
                    className={`form-icon lg form-icon-right passcode-switch ${confirmPassState ? "is-hidden" : "is-shown"}`}>
                    <Icon name="eye" className="passcode-icon icon-show" />
                    <Icon name="eye-off" className="passcode-icon icon-hide" />
                  </a>
                  <input
                    type={confirmPassState ? "text" : "password"}
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className={`form-control-lg form-control ${confirmPassState ? "is-hidden" : "is-shown"}`}
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <span className="text-danger" style={{ fontSize: 12 }}>Passwords do not match</span>
                  )}
                </div>
              </div>

              <div className="form-group">
                <Button size="lg" className="btn-block" type="submit" color="primary" disabled={loading}>
                  {loading ? <Spinner size="sm" color="light" /> : "Reset Password"}
                </Button>
              </div>
            </form>

            <div className="form-note-s2 text-center pt-4">
              <Link to={`${process.env.PUBLIC_URL}/password/reset`}>
                <strong>Didn't receive code? Request again</strong>
              </Link>
            </div>
            <div className="form-note-s2 text-center pt-2">
              <Link to={`${process.env.PUBLIC_URL}/login`}>
                Return to login
              </Link>
            </div>
          </PreviewCard>
        </Block>
      </PageContainer>
    </React.Fragment>
  );
};

export default ResetPassword;
