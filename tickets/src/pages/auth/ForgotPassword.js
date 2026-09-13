import React, { useState } from "react";
import Logo from "../../images/logo.png";
import LogoDark from "../../images/logo-dark.png";
import PageContainer from "../../layout/page-container/PageContainer";
import Head from "../../layout/head/Head";
import { Block, BlockContent, BlockDes, BlockHead, BlockTitle, Button, PreviewCard, Icon } from "../../components/Component";
import { useNavigate, Link } from "react-router-dom";
import { Spinner } from "reactstrap";
import { http } from '../../helpers';
import { toast } from "react-toastify";

const CloseButton = () => (
  <span className="btn-trigger toast-close-button" role="button">
    <Icon name="cross" />
  </span>
);

const ForgotPassword = () => {
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError("Phone number is required");
      return;
    }
    setLoading(true);
    setError("");
    setSuccessMessage("");

    http.post("/forgot-password", { identifier: identifier.trim() })
      .then(res => {
        if (res.data?.success) {
          const username = res.data?.username || "User";
          setSuccessMessage(`Welcome, ${username}!`);
          toast.success(res.data.message, { position: "bottom-center", closeButton: <CloseButton /> });
          
          // Wait 2 seconds before navigating to let user see the message
          setTimeout(() => {
            navigate("/password/reset-confirm", {
              state: {
                otp_id: res.data.otp_id,
                masked_phone: res.data.masked_phone,
                user_id: res.data.user_id,
              }
            });
          }, 2000);
        }
      })
      .catch(err => {
        const msg = err.response?.data?.error || "An error occurred. Please try again.";
        setError(msg);
        toast.error(msg, { position: "bottom-center", closeButton: <CloseButton /> });
        setLoading(false);
      });
  };

  return (
    <React.Fragment>
      <Head title="Forgot Password" />
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
                <BlockTitle tag="h5">Forgot Password</BlockTitle>
                <BlockDes>
                  <p>Enter your registered phone number. We'll send a verification code to that number.</p>
                </BlockDes>
              </BlockContent>
            </BlockHead>

            {error && (
              <div className="alert alert-danger" style={{ fontSize: 13 }}>
                <Icon name="alert-circle" className="me-1" />{error}
              </div>
            )}

            {successMessage && (
              <div className="alert alert-success" style={{ fontSize: 14, fontWeight: 500 }}>
                <Icon name="check-circle" className="me-2" />{successMessage}
              </div>
            )}

            <form className="is-alter" onSubmit={handleSubmit}>
              <div className="form-group">
                <div className="form-label-group">
                  <label className="form-label" htmlFor="identifier">Phone Number</label>
                </div>
                <div className="form-control-wrap">
                  <input
                    type="tel"
                    id="identifier"
                    value={identifier}
                    onChange={e => { setIdentifier(e.target.value); setError(""); }}
                    placeholder="Enter your phone number (e.g. 0712345678)"
                    className="form-control form-control-lg"
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <Button size="lg" className="btn-block" type="submit" color="primary" disabled={loading}>
                  {loading ? <Spinner size="sm" color="light" /> : "Send Verification Code"}
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
