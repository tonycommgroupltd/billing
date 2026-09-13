import React, { useState, useEffect } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  BlockDes,
  Icon,
  Button,
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableRow,
  DataTableItem,
  PaginationComponent,
} from "../../components/Component";
import { Card, Badge, Modal, ModalBody, ModalHeader, Form, FormGroup, Label, Input } from "reactstrap";
import { connect } from "react-redux";
import InventoryAPI from "../../helpers/InventoryAPI";

const RequestInventory = ({ user }) => {
  const [requests, setRequests] = useState([]);
  const [items, setItems] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemPerPage] = useState(10);
  const [loading, setLoading] = useState(false);
  const [modalRequest, setModalRequest] = useState(false);
  const [modalApprove, setModalApprove] = useState(false);
  const [modalReject, setModalReject] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [filterStatus, setFilterStatus] = useState("pending");

  const isTechnician = user?.all_roles?.includes('technician');
  const isAdmin = user?.all_roles?.some(role => ['super-administrator', 'administrator', 'manager'].includes(role));
  const currentUserId = user?.id;

  const [requestFormData, setRequestFormData] = useState({
    item_id: "",
    quantity: 1,
    purpose: "",
    notes: "",
  });

  const [approvalData, setApprovalData] = useState({
    notes: "",
  });

  const [rejectionData, setRejectionData] = useState({
    rejection_reason: "",
  });

  useEffect(() => {
    loadRequests();
    loadItems();
  }, [filterStatus]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      // For technicians, show only their requests
      const params = { status: filterStatus };
      if (isTechnician) {
        params.requested_by = currentUserId;
      }
      const response = await InventoryAPI.getRequests(params);
      setRequests(response.data || []);
    } catch (error) {
      console.error("Error loading requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    try {
      const response = await InventoryAPI.getItems({ status: "active" });
      setItems(response.data || []);
    } catch (error) {
      console.error("Error loading items:", error);
    }
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    try {
      const selectedItem = items.find((item) => item.id == requestFormData.item_id);
      if (!selectedItem) {
        alert("Please select an item");
        return;
      }

      if (requestFormData.quantity > selectedItem.quantity_available) {
        alert(`Only ${selectedItem.quantity_available} units available`);
        return;
      }

      const payload = {
        ...requestFormData,
        item_name: selectedItem.name,
        item_category: selectedItem.category,
        requester_id: user?.id,
        requester_name: user?.name || user?.email || "User",
      };

      await InventoryAPI.createRequest(payload);
      setModalRequest(false);
      resetRequestForm();
      loadRequests();
      loadItems();
    } catch (error) {
      console.error("Error creating request:", error);
    }
  };

  const handleApproveRequest = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        approved_by: user?.id,
        approved_by_name: user?.name || user?.email || "Administrator",
        notes: approvalData.notes,
      };

      await InventoryAPI.approveRequest(selectedRequest.id, payload);
      setModalApprove(false);
      resetApprovalData();
      loadRequests();
      loadItems();
    } catch (error) {
      console.error("Error approving request:", error);
    }
  };

  const handleRejectRequest = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        rejected_by: user?.id,
        rejection_reason: rejectionData.rejection_reason,
      };

      await InventoryAPI.rejectRequest(selectedRequest.id, payload);
      setModalReject(false);
      resetRejectionData();
      loadRequests();
      loadItems();
    } catch (error) {
      console.error("Error rejecting request:", error);
    }
  };

  const openApproveModal = (request) => {
    setSelectedRequest(request);
    setModalApprove(true);
  };

  const openRejectModal = (request) => {
    setSelectedRequest(request);
    setModalReject(true);
  };

  const resetRequestForm = () => {
    setRequestFormData({
      item_id: "",
      quantity: 1,
      purpose: "",
      notes: "",
    });
  };

  const resetApprovalData = () => {
    setApprovalData({ notes: "" });
    setSelectedRequest(null);
  };

  const resetRejectionData = () => {
    setRejectionData({ rejection_reason: "" });
    setSelectedRequest(null);
  };

  // Pagination
  const indexOfLastItem = currentPage * itemPerPage;
  const indexOfFirstItem = indexOfLastItem - itemPerPage;
  const currentItems = requests.slice(indexOfFirstItem, indexOfLastItem);
  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  const canRequest = user?.all_roles?.some((role) =>
    ["super-administrator", "administrator", "manager", "technician", "engineer"].includes(role)
  );

  const getStatusBadge = (status) => {
    const badges = {
      pending: "warning",
      approved: "success",
      rejected: "danger",
    };
    return badges[status] || "secondary";
  };

  return (
    <React.Fragment>
      <Head title="Inventory Requests" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between">
            <BlockHeadContent>
              <BlockTitle page>Inventory Requests</BlockTitle>
              <BlockDes className="text-soft">
                <p>Request and manage inventory items</p>
              </BlockDes>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="toggle-wrap nk-block-tools-toggle">
                {canRequest && (
                  <Button color="primary" onClick={() => setModalRequest(true)}>
                    <Icon name="plus" />
                    <span>Request Item</span>
                  </Button>
                )}
              </div>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <div className="form-group">
                    <Label>Filter by Status</Label>
                    <select
                      className="form-control"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="">All Requests</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>
              </div>

              <DataTable className="card-stretch">
                <DataTableBody>
                  <DataTableHead>
                    <DataTableRow>
                      <span className="sub-text">Item</span>
                    </DataTableRow>
                    <DataTableRow size="md">
                      <span className="sub-text">Requester</span>
                    </DataTableRow>
                    <DataTableRow size="sm">
                      <span className="sub-text">Quantity</span>
                    </DataTableRow>
                    <DataTableRow size="md">
                      <span className="sub-text">Purpose</span>
                    </DataTableRow>
                    <DataTableRow size="sm">
                      <span className="sub-text">Status</span>
                    </DataTableRow>
                    <DataTableRow size="md">
                      <span className="sub-text">Date</span>
                    </DataTableRow>
                    {isAdmin && (
                      <DataTableRow className="nk-tb-col-tools text-right">
                        <span className="sub-text">Actions</span>
                      </DataTableRow>
                    )}
                  </DataTableHead>

                  {loading ? (
                    <div className="text-center py-4">
                      <div className="spinner-border" role="status">
                        <span className="sr-only">Loading...</span>
                      </div>
                    </div>
                  ) : currentItems.length > 0 ? (
                    currentItems.map((request) => (
                      <DataTableItem key={request.id}>
                        <DataTableRow>
                          <div>
                            <span className="tb-lead">{request.item_name}</span>
                            <span className="tb-sub d-block">{request.item_category}</span>
                          </div>
                        </DataTableRow>
                        <DataTableRow size="md">
                          <span className="tb-sub">{request.requester_name}</span>
                        </DataTableRow>
                        <DataTableRow size="sm">
                          <strong>{request.quantity}</strong>
                        </DataTableRow>
                        <DataTableRow size="md">
                          <span className="tb-sub">{request.purpose || "-"}</span>
                        </DataTableRow>
                        <DataTableRow size="sm">
                          <Badge color={getStatusBadge(request.status)}>{request.status}</Badge>
                        </DataTableRow>
                        <DataTableRow size="md">
                          <span className="tb-sub">
                            {new Date(request.created_at).toLocaleDateString()}
                          </span>
                        </DataTableRow>
                        {isAdmin && (
                          <DataTableRow className="nk-tb-col-tools">
                            {request.status === "pending" && (
                              <ul className="nk-tb-actions gx-1">
                                <li>
                                  <Button
                                    size="sm"
                                    color="success"
                                    onClick={() => openApproveModal(request)}
                                  >
                                    <Icon name="check" />
                                  </Button>
                                </li>
                                <li className="ml-1">
                                  <Button
                                    size="sm"
                                    color="danger"
                                    onClick={() => openRejectModal(request)}
                                  >
                                    <Icon name="cross" />
                                  </Button>
                                </li>
                              </ul>
                            )}
                          </DataTableRow>
                        )}
                      </DataTableItem>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <em className="icon ni ni-inbox mb-2" style={{ fontSize: "2rem" }}></em>
                      <p className="text-muted">No requests found</p>
                    </div>
                  )}
                </DataTableBody>
              </DataTable>

              {requests.length > itemPerPage && (
                <div className="card-inner">
                  <PaginationComponent
                    itemPerPage={itemPerPage}
                    totalItems={requests.length}
                    paginate={paginate}
                    currentPage={currentPage}
                  />
                </div>
              )}
            </div>
          </Card>
        </Block>
      </Content>

      {/* Request Item Modal */}
      <Modal isOpen={modalRequest} toggle={() => setModalRequest(false)} size="md">
        <ModalHeader toggle={() => setModalRequest(false)}>Request Inventory Item</ModalHeader>
        <ModalBody>
          <Form onSubmit={handleCreateRequest}>
            <FormGroup>
              <Label>Select Item *</Label>
              <select
                className="form-control"
                required
                value={requestFormData.item_id}
                onChange={(e) => setRequestFormData({ ...requestFormData, item_id: e.target.value })}
              >
                <option value="">Choose an item...</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - Available: {item.quantity_available} {item.unit}
                  </option>
                ))}
              </select>
            </FormGroup>
            <FormGroup>
              <Label>Quantity *</Label>
              <Input
                type="number"
                required
                min="1"
                value={requestFormData.quantity}
                onChange={(e) =>
                  setRequestFormData({ ...requestFormData, quantity: parseInt(e.target.value) })
                }
              />
            </FormGroup>
            <FormGroup>
              <Label>Purpose *</Label>
              <Input
                type="text"
                required
                placeholder="e.g., Customer installation, Repair work"
                value={requestFormData.purpose}
                onChange={(e) => setRequestFormData({ ...requestFormData, purpose: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <Label>Notes</Label>
              <Input
                type="textarea"
                rows="2"
                placeholder="Additional details..."
                value={requestFormData.notes}
                onChange={(e) => setRequestFormData({ ...requestFormData, notes: e.target.value })}
              />
            </FormGroup>
            <div className="form-group text-right">
              <Button color="light" onClick={() => setModalRequest(false)}>
                Cancel
              </Button>
              <Button color="primary" type="submit" className="ml-2">
                Submit Request
              </Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>

      {/* Approve Request Modal */}
      <Modal isOpen={modalApprove} toggle={() => setModalApprove(false)}>
        <ModalHeader toggle={() => setModalApprove(false)}>Approve Request</ModalHeader>
        <ModalBody>
          {selectedRequest && (
            <div className="mb-3">
              <p>
                <strong>Item:</strong> {selectedRequest.item_name}
              </p>
              <p>
                <strong>Quantity:</strong> {selectedRequest.quantity}
              </p>
              <p>
                <strong>Requester:</strong> {selectedRequest.requester_name}
              </p>
            </div>
          )}
          <Form onSubmit={handleApproveRequest}>
            <FormGroup>
              <Label>Notes</Label>
              <Input
                type="textarea"
                rows="2"
                placeholder="Add approval notes..."
                value={approvalData.notes}
                onChange={(e) => setApprovalData({ ...approvalData, notes: e.target.value })}
              />
            </FormGroup>
            <div className="form-group text-right">
              <Button color="light" onClick={() => setModalApprove(false)}>
                Cancel
              </Button>
              <Button color="success" type="submit" className="ml-2">
                Approve & Disburse
              </Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>

      {/* Reject Request Modal */}
      <Modal isOpen={modalReject} toggle={() => setModalReject(false)}>
        <ModalHeader toggle={() => setModalReject(false)}>Reject Request</ModalHeader>
        <ModalBody>
          {selectedRequest && (
            <div className="mb-3">
              <p>
                <strong>Item:</strong> {selectedRequest.item_name}
              </p>
              <p>
                <strong>Quantity:</strong> {selectedRequest.quantity}
              </p>
              <p>
                <strong>Requester:</strong> {selectedRequest.requester_name}
              </p>
            </div>
          )}
          <Form onSubmit={handleRejectRequest}>
            <FormGroup>
              <Label>Reason for Rejection *</Label>
              <Input
                type="textarea"
                rows="3"
                required
                placeholder="Explain why this request is being rejected..."
                value={rejectionData.rejection_reason}
                onChange={(e) =>
                  setRejectionData({ ...rejectionData, rejection_reason: e.target.value })
                }
              />
            </FormGroup>
            <div className="form-group text-right">
              <Button color="light" onClick={() => setModalReject(false)}>
                Cancel
              </Button>
              <Button color="danger" type="submit" className="ml-2">
                Reject Request
              </Button>
            </div>
          </Form>
        </ModalBody>
      </Modal>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(RequestInventory);
