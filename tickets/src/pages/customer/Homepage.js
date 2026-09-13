import React, { useState, useEffect } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Card, Collapse } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  Row,
  Col,
} from "../../components/Component";
import { Link } from "react-router-dom";
import { http } from '../../helpers';
import { BookCoins24Regular, Star24Regular, Open24Regular, Open20Regular, Money24Regular, ChevronDown24Regular, ChevronUp24Regular, DocumentPdf20Regular, ArrowDownload20Regular } from '@fluentui/react-icons';
import { connect } from 'react-redux';
import dateFormat from 'dateformat';
import axios from 'axios';
import { toast } from "react-toastify";

const CloseButton = () => {
  return (
    <span className="btn-trigger toast-close-button" role="button">
      <Icon name="cross"></Icon>
    </span>
  );
};

const Homepage = ({ user }) => {
  const [data, setData] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);

  const [isInvoiceOpen, setIsInvoiceOpen] = useState(true);
  const toggleInvoice = () => setIsInvoiceOpen(!isInvoiceOpen);

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

  const execToastInfo = (placement, message) => {
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
  };

  const numberFormat = (value) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'KES'
    }).format(value);

  const downloadPdf = async (id) => {
    try {
      execToastInfo("top-right", "Please wait as document is being processed.");

      const response = await axios.get(`${process.env.REACT_APP_API_URL}/download-invoices/${id}`, { responseType: "blob" });
      if (response.data) {
        successToast("top-right", "Document processed successfully.");
      }
      const pdfBlob = new Blob([response.data], { type: 'application/pdf' });

      const url = window.URL.createObjectURL(pdfBlob);
      const tempLink = document.createElement("a");
      tempLink.href = url;
      tempLink.setAttribute("download",
        `invoice-${id}.pdf`
      );
      document.body.appendChild(tempLink);
      tempLink.click();

      document.body.removeChild(tempLink);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      execToast("top-right", "Error downloading PDF:" + error);
      console.error("Error downloading PDF:", error)
    }
  }

  useEffect(() => {
    const fetchDashboardStats = async () => {
      setApiLoading(true);
      try {
        const response = await http.get(`${process.env.REACT_APP_API_URL}/cust-dashboard-stats/${user.id}`);
        if (response.data) {
          setData(response.data);
        }
        setApiLoading(false);
      } catch (error) {
        setApiLoading(false);
      }
    };

    fetchDashboardStats();

  }, []);

  return (
    <React.Fragment>
      <Head title="Dashboard"></Head>
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page tag="h3">
              Dashboard
            </BlockTitle>
          </BlockHeadContent>
        </BlockHead>
        <Block>
          <Row className="g-gs">
            <Col md="6">
              <Card className="dashboard-status">
                <div className="card-header" style={{ cursor: "default" }}>
                  <span className="icon-wrap color-success">
                    <BookCoins24Regular />
                  </span>
                  <strong className="fs-18">Account balance</strong>
                </div>
                <div className="card-body" style={{ paddingLeft: '48px' }}>
                  <h2 className="text-dark fs-18" style={{ paddingBottom: '20px' }}>
                    <strong style={{ fontWeight: 'bolder' }}>{numberFormat(data?.customer?.balance ?? 0)}</strong>
                  </h2>
                </div>
              </Card>
              {data && data.invoices && data.invoices.length > 0 &&
                <Card className="dashboard-status spl-collapsed-panel">
                  <div className="card-header dropup" onClick={toggleInvoice}>
                    <span className="icon-wrap color-purple">
                      <Money24Regular />
                    </span>
                    <strong>Unpaid invoices <span className="badge bg-primary ms-8">{data && data.invoices ? data.invoices.length : 0}</span></strong>
                    <div className="pull-right">
                      <span className="close-card-btn icon-wrap">
                        {isInvoiceOpen ? <ChevronDown24Regular /> : <ChevronUp24Regular />}
                      </span>
                    </div>
                  </div>
                  <Collapse isOpen={isInvoiceOpen}>
                    <div className="card-body">
                      <div className="px-12">
                        {data && data.invoices && data.invoices.map(invoice => (
                          <div className="portal-card " key={invoice.id}>
                            <div className="portal-card-fields">
                              <div className="right-label">
                                <div>
                                  <div className="d-flex">
                                    <label className="badge bg-danger ms-8">{new Date(invoice.due_date) < new Date() ? 'Overdue' : 'Unpaid'}</label>
                                  </div>
                                </div>
                              </div>
                              <div className="portal-card-field">
                                <span className="field-title me-8">#</span>
                                <span className="field-value">{invoice.id}</span>
                              </div>
                              <div className="portal-card-field">
                                <span className="field-title me-8">Date</span>
                                <span className="field-value">{invoice.invoice_date ? dateFormat(invoice.invoice_date, "dd-mm-yyyy") : ''}</span>
                              </div>
                              <div className="portal-card-field">
                                <span className="field-title me-8">Total</span>
                                <span className="field-value">{numberFormat(invoice.total)}</span>
                              </div>
                              <div className="portal-card-field">
                                <span className="field-title me-8">Due</span>
                                <span className="field-value">
                                  <span className="color-pink">
                                    {numberFormat(invoice.due)}
                                  </span>
                                </span>
                              </div>
                              <div className="portal-card-field">
                                <span className="field-title me-8">Due Date</span>
                                <span className="field-value">{invoice.due_date ? dateFormat(invoice.due_date, "dd-mm-yyyy") : ''}</span>
                              </div>
                            </div>
                            <div className="card-actions">
                              <div className="action-cell row-gap-16 column-gap-12">
                                <Link to={`/portal/invoice-details/${invoice.id}`} className="">
                                  <Open20Regular />
                                </Link>
                                <span className="" style={{ color: '#798bff', cursor: 'pointer' }} onClick={() => downloadPdf(invoice.id)}>
                                  <DocumentPdf20Regular />
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="row">
                        <div className="col-md-12 d-flex justify-content-center py-16">
                          <Link to="/portal/finance/invoices" className="btn btn-link fs-14px"> Show all financial documents </Link>
                        </div>
                      </div>
                    </div>
                  </Collapse>
                </Card>
              }
            </Col>
            <Col md="6">
              <Card className="dashboard-status">
                <div className="card-header" style={{ cursor: "default" }}>
                  <span className="icon-wrap color-success">
                    <Star24Regular />
                  </span>
                  <strong className="fs-18">Services</strong>
                  <div className="pull-right">
                    <Link to="/portal/services">
                      <span className="icon-wrap text-body">
                        <Open24Regular />
                      </span>
                    </Link>
                  </div>
                </div>
                <div className="card-body">
                  <table className="display supertable table table-striped dataTable no-footer dtr-inline mt-0 mb-0">
                    <thead>
                      <tr>
                        <th style={{ boxShadow: 'inset 0 0 0 9999px #f7f8fc', borderTopLeftRadius: 0 }}>Service</th>
                        <th style={{ boxShadow: 'inset 0 0 0 9999px #f7f8fc' }}>Plan</th>
                        <th style={{ boxShadow: 'inset 0 0 0 9999px #f7f8fc', borderTopRightRadius: 0 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiLoading && <tr><td colSpan={3}>Loading...</td></tr>}
                      {data && data.services && data.services.map(service => (
                        <tr key={service.id}>
                          <td className={"font-weight-medium" + (service.online === 1 ? " color-success" : service.status['value'] === 2 ? " color-primary" : service.status['value'] === 1 ? " color-light" : " color-warning")}>Internet</td>
                          <td className="color-dark ms-12 font-weight-medium">{service.plan_title}</td>
                          <td>
                            <div className={"badge" + (service.online === 1 ? " bg-success" : service.status['value'] === 2 ? " bg-primary" : service.status['value'] === 1 ? " bg-light" : " bg-warning")}>{service.online === 1 ? "Online" : service.status['value'] === 2 ? "Active" : service.status['value'] === 1 ? "Disabled" : service.status['label']}</div>
                          </td>
                        </tr>
                      ))}

                    </tbody>
                  </table>
                </div>
              </Card>
            </Col>
          </Row>
        </Block>
      </Content>
    </React.Fragment >
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser
});

export default connect(mapStateToProps)(Homepage);
