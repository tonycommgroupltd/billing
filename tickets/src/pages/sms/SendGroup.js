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
import { FormGroup, Label, Input, Spinner, Alert, Badge } from "reactstrap";
import { http } from '../../helpers';
import { toast } from "react-toastify";
import { count } from "sms-length";
import Select from "react-select";
import DataTable from "react-data-table-component";

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const SendGroup = () => {
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomers, setSelectedCustomers] = useState([]);
    const [formData, setFormData] = useState({
        message: "",
        filterType: "all", // all, active, expired, group
        groupId: null,
    });
    const [smsCounter, setSmsCounter] = useState({ length: 0, messages: 0 });
    const [searchLoading, setSearchLoading] = useState(false);
    const [groups, setGroups] = useState([]);
    const [totalCost, setTotalCost] = useState(0);

    useEffect(() => {
        fetchGroups();
    }, []);

    useEffect(() => {
        if (formData.message) {
            const counter = count(formData.message + ' STOP *456*9*5#');
            setSmsCounter(counter);
            setTotalCost(counter.messages * selectedCustomers.length);
        } else {
            setSmsCounter({ length: 0, messages: 0 });
            setTotalCost(0);
        }
    }, [formData.message, selectedCustomers]);

    const fetchGroups = async () => {
        try {
            const response = await http.get(`${process.env.REACT_APP_API_URL}/customer-groups`);
            if (response.data?.groups) {
                setGroups(response.data.groups.map(group => ({
                    value: group.id,
                    label: group.name,
                    count: group.customer_count,
                })));
            }
        } catch (error) {
            console.error('Error fetching groups:', error);
        }
    };

    const searchCustomers = async (inputValue) => {
        if (!inputValue || inputValue.length < 2) {
            return [];
        }

        setSearchLoading(true);
        try {
            const response = await http.get(
                `${process.env.REACT_APP_API_URL}/customers?q=${inputValue}&limit=50`
            );
            setSearchLoading(false);
            
            if (response.data?.data) {
                return response.data.data.map(customer => ({
                    value: customer.id,
                    label: `${customer.name} - ${customer.mobile}`,
                    mobile: customer.mobile,
                    name: customer.name,
                    status: customer.status,
                }));
            }
            return [];
        } catch (error) {
            setSearchLoading(false);
            console.error('Error searching customers:', error);
            return [];
        }
    };

    const handleCustomerSelect = (selectedOptions) => {
        if (selectedOptions) {
            const newCustomers = selectedOptions.map(option => ({
                id: option.value,
                name: option.name,
                mobile: option.mobile,
                status: option.status,
            }));
            
            // Merge with existing, avoid duplicates
            const merged = [...selectedCustomers];
            newCustomers.forEach(newCust => {
                if (!merged.find(c => c.id === newCust.id)) {
                    merged.push(newCust);
                }
            });
            
            setSelectedCustomers(merged);
        }
    };

    const handleRemoveCustomer = (customerId) => {
        setSelectedCustomers(selectedCustomers.filter(c => c.id !== customerId));
    };

    const handleFilterChange = async (e) => {
        const filterType = e.target.value;
        setFormData({ ...formData, filterType });

        if (filterType !== "manual") {
            // Fetch customers based on filter
            setLoading(true);
            try {
                let url = `${process.env.REACT_APP_API_URL}/customers?`;
                if (filterType === "active") {
                    url += "status=active";
                } else if (filterType === "expired") {
                    url += "status=expired";
                } else if (filterType === "all") {
                    url += "limit=1000";
                }

                const response = await http.get(url);
                if (response.data?.data) {
                    setSelectedCustomers(response.data.data.map(customer => ({
                        id: customer.id,
                        name: customer.name,
                        mobile: customer.mobile,
                        status: customer.status,
                    })));
                }
            } catch (error) {
                toast.error("Failed to fetch customers", {
                    position: "top-right",
                    autoClose: true,
                    hideProgressBar: true,
                    closeButton: <CloseButton />,
                });
            }
            setLoading(false);
        }
    };

    const handleGroupChange = async (selectedOption) => {
        if (selectedOption) {
            setFormData({ ...formData, groupId: selectedOption.value });
            
            // Fetch customers in this group
            setLoading(true);
            try {
                const response = await http.get(
                    `${process.env.REACT_APP_API_URL}/customer-groups/${selectedOption.value}/customers`
                );
                if (response.data?.customers) {
                    setSelectedCustomers(response.data.customers.map(customer => ({
                        id: customer.id,
                        name: customer.name,
                        mobile: customer.mobile,
                        status: customer.status,
                    })));
                }
            } catch (error) {
                toast.error("Failed to fetch group customers", {
                    position: "top-right",
                    autoClose: true,
                    hideProgressBar: true,
                    closeButton: <CloseButton />,
                });
            }
            setLoading(false);
        } else {
            setFormData({ ...formData, groupId: null });
            setSelectedCustomers([]);
        }
    };

    const handleMessageChange = (e) => {
        setFormData({
            ...formData,
            message: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (selectedCustomers.length === 0) {
            toast.error("Please select at least one customer", {
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
            message: formData.message,
            customers: selectedCustomers.map(c => ({
                id: c.id,
                mobile: c.mobile,
                name: c.name,
            })),
        };

        try {
            const response = await http.post(
                `${process.env.REACT_APP_API_URL}/send-group-sms`,
                payload
            );

            if (response.data?.success) {
                toast.success(
                    response.data?.message || `SMS sent to ${selectedCustomers.length} customers!`,
                    {
                        position: "top-right",
                        autoClose: true,
                        hideProgressBar: true,
                        closeButton: <CloseButton />,
                    }
                );

                // Reset form
                setFormData({
                    message: "",
                    filterType: "all",
                    groupId: null,
                });
                setSelectedCustomers([]);
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

    const columns = [
        {
            name: "Name",
            selector: (row) => row.name,
            sortable: true,
        },
        {
            name: "Mobile",
            selector: (row) => row.mobile,
            sortable: true,
        },
        {
            name: "Status",
            cell: (row) => (
                <Badge color={row.status === 'active' ? 'success' : 'warning'}>
                    {row.status}
                </Badge>
            ),
            sortable: true,
        },
        {
            name: "Action",
            cell: (row) => (
                <Button
                    size="sm"
                    color="danger"
                    onClick={() => handleRemoveCustomer(row.id)}
                >
                    Remove
                </Button>
            ),
        },
    ];

    return (
        <>
            <Head title="Send Group SMS" />
            <Content>
                <BlockHead size="sm">
                    <div className="nk-block-between">
                        <BlockHeadContent>
                            <BlockTitle page>Send Group SMS</BlockTitle>
                            <BlockDes className="text-soft">
                                <p>Send SMS to multiple customers at once</p>
                            </BlockDes>
                        </BlockHeadContent>
                    </div>
                </BlockHead>

                <Block>
                    <form onSubmit={handleSubmit}>
                        <Row className="g-gs">
                            <Col lg="8">
                                <PreviewCard>
                                    <Row className="g-4">
                                        <Col md="12">
                                            <FormGroup>
                                                <Label htmlFor="filterType" className="form-label">
                                                    Select Recipients
                                                </Label>
                                                <Input
                                                    type="select"
                                                    id="filterType"
                                                    value={formData.filterType}
                                                    onChange={handleFilterChange}
                                                >
                                                    <option value="manual">Select Manually</option>
                                                    <option value="all">All Customers</option>
                                                    <option value="active">Active Customers</option>
                                                    <option value="expired">Expired Customers</option>
                                                    <option value="group">By Group</option>
                                                </Input>
                                            </FormGroup>
                                        </Col>

                                        {formData.filterType === "group" && (
                                            <Col md="12">
                                                <FormGroup>
                                                    <Label htmlFor="group" className="form-label">
                                                        Select Group
                                                    </Label>
                                                    <Select
                                                        id="group"
                                                        placeholder="Select a customer group..."
                                                        isClearable
                                                        options={groups}
                                                        onChange={handleGroupChange}
                                                        classNamePrefix="react-select"
                                                    />
                                                </FormGroup>
                                            </Col>
                                        )}

                                        {formData.filterType === "manual" && (
                                            <Col md="12">
                                                <FormGroup>
                                                    <Label htmlFor="customers" className="form-label">
                                                        Search and Add Customers
                                                    </Label>
                                                    <Select
                                                        id="customers"
                                                        placeholder="Type to search customers..."
                                                        isMulti
                                                        isLoading={searchLoading}
                                                        loadOptions={searchCustomers}
                                                        onChange={handleCustomerSelect}
                                                        classNamePrefix="react-select"
                                                        isSearchable
                                                        defaultOptions
                                                    />
                                                </FormGroup>
                                            </Col>
                                        )}

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
                                                        Total Cost: <strong>{totalCost}</strong> credits
                                                    </span>
                                                </div>
                                            </FormGroup>
                                        </Col>

                                        <Col md="12">
                                            <Alert color="info" className="alert-icon">
                                                <Icon name="info"></Icon>
                                                <strong>Recipients:</strong> {selectedCustomers.length} customer(s) selected
                                            </Alert>
                                        </Col>

                                        <Col md="12">
                                            <FormGroup>
                                                <Button
                                                    type="submit"
                                                    color="primary"
                                                    size="lg"
                                                    disabled={loading || selectedCustomers.length === 0}
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
                                                            <span>Send to {selectedCustomers.length} Customer(s)</span>
                                                        </>
                                                    )}
                                                </Button>
                                            </FormGroup>
                                        </Col>
                                    </Row>
                                </PreviewCard>

                                {selectedCustomers.length > 0 && (
                                    <PreviewCard className="mt-4">
                                        <div className="card-title-group align-start mb-3">
                                            <div className="card-title">
                                                <h6 className="title">Selected Recipients ({selectedCustomers.length})</h6>
                                            </div>
                                            <div className="card-tools">
                                                <Button
                                                    size="sm"
                                                    color="danger"
                                                    outline
                                                    onClick={() => setSelectedCustomers([])}
                                                >
                                                    Clear All
                                                </Button>
                                            </div>
                                        </div>
                                        <DataTable
                                            data={selectedCustomers}
                                            columns={columns}
                                            pagination
                                            paginationPerPage={10}
                                            noDataComponent={<div className="p-2">No customers selected</div>}
                                        />
                                    </PreviewCard>
                                )}
                            </Col>

                            <Col lg="4">
                                <PreviewCard>
                                    <div className="card-title-group align-start mb-3">
                                        <div className="card-title">
                                            <h6 className="title">Campaign Summary</h6>
                                        </div>
                                    </div>
                                    <div className="data-list">
                                        <div className="data-item">
                                            <div className="data-col">
                                                <span className="data-label">Recipients</span>
                                                <span className="data-value">{selectedCustomers.length}</span>
                                            </div>
                                        </div>
                                        <div className="data-item">
                                            <div className="data-col">
                                                <span className="data-label">SMS per Recipient</span>
                                                <span className="data-value">{smsCounter.messages}</span>
                                            </div>
                                        </div>
                                        <div className="data-item">
                                            <div className="data-col">
                                                <span className="data-label">Total SMS</span>
                                                <span className="data-value">{totalCost}</span>
                                            </div>
                                        </div>
                                        <div className="data-item">
                                            <div className="data-col">
                                                <span className="data-label">Total Cost</span>
                                                <span className="data-value text-primary">
                                                    <strong>{totalCost}</strong> Credits
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </PreviewCard>

                                <PreviewCard className="mt-4">
                                    <div className="card-title-group align-start mb-3">
                                        <div className="card-title">
                                            <h6 className="title">SMS Preview</h6>
                                        </div>
                                    </div>
                                    <div className="sms-preview p-3 border rounded" style={{ backgroundColor: '#f5f6fa', minHeight: '150px' }}>
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
                                </PreviewCard>
                            </Col>
                        </Row>
                    </form>
                </Block>
            </Content>
        </>
    );
};

export default SendGroup;
