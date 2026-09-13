import React, { useState, useEffect } from "react";
import {
    Block,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
    BlockDes,
    Icon,
    Button,
    PreviewCard,
    Row,
    Col,
} from "../../components/Component";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { FormGroup, Label, Input, Spinner, Alert } from "reactstrap";
import { http } from '../../helpers';
import { toast } from "react-toastify";
import { count } from "sms-length";
import Select from "react-select";

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const SendSingle = () => {
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [formData, setFormData] = useState({
        recipient: "",
        recipientName: "",
        mobile: "",
        message: "",
        customerId: null,
    });
    const [smsCounter, setSmsCounter] = useState({ length: 0, messages: 0 });
    const [searchLoading, setSearchLoading] = useState(false);

    useEffect(() => {
        if (formData.message) {
            const counter = count(formData.message + ' STOP *456*9*5#');
            setSmsCounter(counter);
        } else {
            setSmsCounter({ length: 0, messages: 0 });
        }
    }, [formData.message]);

    const searchCustomers = async (inputValue) => {
        if (!inputValue || inputValue.length < 2) {
            return [];
        }

        setSearchLoading(true);
        try {
            const response = await http.get(
                `${process.env.REACT_APP_API_URL}/customers?q=${inputValue}&limit=20`
            );
            setSearchLoading(false);
            
            if (response.data?.data) {
                return response.data.data.map(customer => ({
                    value: customer.id,
                    label: `${customer.name} - ${customer.mobile}`,
                    mobile: customer.mobile,
                    name: customer.name,
                }));
            }
            return [];
        } catch (error) {
            setSearchLoading(false);
            console.error('Error searching customers:', error);
            return [];
        }
    };

    const handleCustomerSelect = (selectedOption) => {
        if (selectedOption) {
            setFormData({
                ...formData,
                customerId: selectedOption.value,
                mobile: selectedOption.mobile,
                recipientName: selectedOption.name,
                recipient: selectedOption.label,
            });
        } else {
            setFormData({
                ...formData,
                customerId: null,
                mobile: "",
                recipientName: "",
                recipient: "",
            });
        }
    };

    const handleManualMobileChange = (e) => {
        setFormData({
            ...formData,
            mobile: e.target.value,
            customerId: null,
            recipientName: "",
            recipient: e.target.value,
        });
    };

    const handleMessageChange = (e) => {
        setFormData({
            ...formData,
            message: e.target.value,
        });
    };

    const validateMobile = (mobile) => {
        // Kenya mobile number validation (254XXXXXXXXX or 07XXXXXXXX or +254XXXXXXXXX)
        const kenyanMobileRegex = /^(\+?254|0)[17]\d{8}$/;
        return kenyanMobileRegex.test(mobile.replace(/\s/g, ''));
    };

    const formatMobile = (mobile) => {
        // Convert to 254XXXXXXXXX format
        mobile = mobile.replace(/\s/g, '');
        if (mobile.startsWith('+254')) {
            return mobile.substring(1);
        } else if (mobile.startsWith('0')) {
            return '254' + mobile.substring(1);
        } else if (mobile.startsWith('254')) {
            return mobile;
        }
        return mobile;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.mobile) {
            toast.error("Please enter a mobile number", {
                position: "top-right",
                autoClose: true,
                hideProgressBar: true,
                closeButton: <CloseButton />,
            });
            return;
        }

        if (!validateMobile(formData.mobile)) {
            toast.error("Please enter a valid mobile number", {
                position: "top-right",
                autoClose: true,
                hideProgressBar: true,
                closeButton: <CloseButton />,
            });
            return;
        }

        if (!formData.message || formData.message.trim() === "") {
            toast.error("Please enter a message", {
                position: "top-right",
                autoClose: true,
                hideProgressBar: true,
                closeButton: <CloseButton />,
            });
            return;
        }

        setLoading(true);

        const payload = {
            mobile: formatMobile(formData.mobile),
            message: formData.message,
            customer_id: formData.customerId,
            recipient_name: formData.recipientName,
        };

        try {
            const response = await http.post(
                `${process.env.REACT_APP_API_URL}/send-single-sms`,
                payload
            );

            if (response.data?.success) {
                toast.success(response.data?.message || "SMS sent successfully!", {
                    position: "top-right",
                    autoClose: true,
                    hideProgressBar: true,
                    closeButton: <CloseButton />,
                });

                // Reset form
                setFormData({
                    recipient: "",
                    recipientName: "",
                    mobile: "",
                    message: "",
                    customerId: null,
                });
            } else {
                toast.error(response.data?.message || "Failed to send SMS", {
                    position: "top-right",
                    autoClose: true,
                    hideProgressBar: true,
                    closeButton: <CloseButton />,
                });
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to send SMS", {
                position: "top-right",
                autoClose: true,
                hideProgressBar: true,
                closeButton: <CloseButton />,
            });
        }

        setLoading(false);
    };

    return (
        <>
            <Head title="Send Single SMS" />
            <Content>
                <BlockHead size="sm">
                    <div className="nk-block-between">
                        <BlockHeadContent>
                            <BlockTitle page>Send Single SMS</BlockTitle>
                            <BlockDes className="text-soft">
                                <p>Send SMS to a single customer or mobile number</p>
                            </BlockDes>
                        </BlockHeadContent>
                    </div>
                </BlockHead>

                <Block>
                    <Row className="g-gs">
                        <Col lg="8">
                            <PreviewCard>
                                <form onSubmit={handleSubmit}>
                                    <Row className="g-4">
                                        <Col md="12">
                                            <FormGroup>
                                                <Label htmlFor="customer" className="form-label">
                                                    Search Customer (Optional)
                                                </Label>
                                                <Select
                                                    id="customer"
                                                    placeholder="Type to search by name or mobile..."
                                                    isClearable
                                                    isLoading={searchLoading}
                                                    loadOptions={searchCustomers}
                                                    onChange={handleCustomerSelect}
                                                    value={
                                                        formData.customerId
                                                            ? {
                                                                  value: formData.customerId,
                                                                  label: formData.recipient,
                                                              }
                                                            : null
                                                    }
                                                    classNamePrefix="react-select"
                                                    isSearchable
                                                    defaultOptions
                                                />
                                                <span className="form-note">
                                                    Search and select from existing customers
                                                </span>
                                            </FormGroup>
                                        </Col>

                                        <Col md="12">
                                            <div className="form-note text-center my-3">OR</div>
                                        </Col>

                                        <Col md="12">
                                            <FormGroup>
                                                <Label htmlFor="mobile" className="form-label">
                                                    Mobile Number <span className="text-danger">*</span>
                                                </Label>
                                                <Input
                                                    type="text"
                                                    id="mobile"
                                                    placeholder="e.g. 0712345678 or 254712345678"
                                                    value={formData.mobile}
                                                    onChange={handleManualMobileChange}
                                                    required
                                                />
                                                <span className="form-note">
                                                    Enter mobile number in format: 07XXXXXXXX or 254XXXXXXXXX
                                                </span>
                                            </FormGroup>
                                        </Col>

                                        <Col md="12">
                                            <FormGroup>
                                                <Label htmlFor="message" className="form-label">
                                                    Message <span className="text-danger">*</span>
                                                </Label>
                                                <Input
                                                    type="textarea"
                                                    id="message"
                                                    placeholder="Type your message here..."
                                                    rows="6"
                                                    value={formData.message}
                                                    onChange={handleMessageChange}
                                                    required
                                                />
                                                <div className="d-flex justify-content-between mt-2">
                                                    <span className="form-note">
                                                        {smsCounter.length} characters • {smsCounter.messages}{" "}
                                                        SMS {smsCounter.messages > 1 ? "pages" : "page"}
                                                    </span>
                                                    <span className="form-note">
                                                        Cost: <strong>{smsCounter.messages}</strong> credits
                                                    </span>
                                                </div>
                                            </FormGroup>
                                        </Col>

                                        <Col md="12">
                                            <Alert color="info" className="alert-icon">
                                                <Icon name="info"></Icon>
                                                <strong>Note:</strong> A footer "STOP *456*9*5#" will be automatically added to comply with regulations.
                                            </Alert>
                                        </Col>

                                        <Col md="12">
                                            <FormGroup>
                                                <Button
                                                    type="submit"
                                                    color="primary"
                                                    size="lg"
                                                    disabled={loading}
                                                    className="btn-block"
                                                >
                                                    {loading ? (
                                                        <>
                                                            <Spinner size="sm" className="me-2" />
                                                            Sending...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Icon name="send"></Icon>
                                                            <span>Send SMS</span>
                                                        </>
                                                    )}
                                                </Button>
                                            </FormGroup>
                                        </Col>
                                    </Row>
                                </form>
                            </PreviewCard>
                        </Col>

                        <Col lg="4">
                            <PreviewCard>
                                <div className="card-title-group align-start mb-3">
                                    <div className="card-title">
                                        <h6 className="title">SMS Preview</h6>
                                    </div>
                                </div>
                                <div className="sms-preview p-3 border rounded" style={{ backgroundColor: '#f5f6fa', minHeight: '200px' }}>
                                    {formData.message ? (
                                        <>
                                            <p className="mb-2" style={{ whiteSpace: 'pre-wrap' }}>
                                                {formData.message}
                                            </p>
                                            <p className="text-muted mb-0" style={{ fontSize: '12px' }}>
                                                STOP *456*9*5#
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-muted text-center">
                                            Your message preview will appear here...
                                        </p>
                                    )}
                                </div>

                                <div className="mt-4">
                                    <h6 className="title mb-3">Tips for Effective SMS</h6>
                                    <ul className="list-unstyled">
                                        <li className="mb-2">
                                            <Icon name="check-circle" className="text-success me-2"></Icon>
                                            Keep messages clear and concise
                                        </li>
                                        <li className="mb-2">
                                            <Icon name="check-circle" className="text-success me-2"></Icon>
                                            Include a call-to-action
                                        </li>
                                        <li className="mb-2">
                                            <Icon name="check-circle" className="text-success me-2"></Icon>
                                            Personalize when possible
                                        </li>
                                        <li className="mb-2">
                                            <Icon name="check-circle" className="text-success me-2"></Icon>
                                            Avoid spam trigger words
                                        </li>
                                        <li className="mb-2">
                                            <Icon name="info" className="text-info me-2"></Icon>
                                            160 chars = 1 SMS page
                                        </li>
                                    </ul>
                                </div>
                            </PreviewCard>
                        </Col>
                    </Row>
                </Block>
            </Content>
        </>
    );
};

export default SendSingle;
