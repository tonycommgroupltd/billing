import React, { useCallback, useEffect, useState } from "react";
import { connect } from "react-redux";
import {
  Badge,
  Button,
  Card,
  Spinner,
  Table,
} from "reactstrap";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
} from "../../components/Component";
import { http } from "../../helpers";
import { showError, showSuccess } from "../../utils/notifications";
import { format, parseISO } from "date-fns";
import Swal from "sweetalert2";

const DeletionApprovals = ({ user }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const isSuper = (user?.all_roles || []).includes("super-administrator");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = isSuper ? "/deletion-requests?status=pending" : "/my-deletion-requests?status=all";
      const res = await http.get(url);
      setItems(res.data?.data || res.data?.items || []);
    } catch (err) {
      showError(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [isSuper]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id) => {
    const confirm = await Swal.fire({
      title: "Approve deletion?",
      text: "This will permanently delete the item.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Approve & delete",
    });
    if (!confirm.isConfirmed) return;
    try {
      const res = await http.post(`/deletion-requests/${id}/approve`);
      showSuccess(res.data.message || "Approved");
      load();
    } catch (err) {
      showError(err?.response?.data?.message || err.message);
    }
  };

  const reject = async (id) => {
    const { value: note } = await Swal.fire({
      title: "Reject deletion?",
      input: "text",
      inputPlaceholder: "Reason (optional)",
      showCancelButton: true,
      confirmButtonText: "Reject",
    });
    if (note === undefined) return;
    try {
      const res = await http.post(`/deletion-requests/${id}/reject`, { note });
      showSuccess(res.data.message || "Rejected");
      load();
    } catch (err) {
      showError(err?.response?.data?.message || err.message);
    }
  };

  const cancel = async (id) => {
    try {
      await http.post(`/deletion-requests/${id}/cancel`);
      showSuccess("Cancelled");
      load();
    } catch (err) {
      showError(err?.response?.data?.message || err.message);
    }
  };

  return (
    <>
      <Head title="Delete Approvals" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page>{isSuper ? "Delete Approvals" : "My Delete Requests"}</BlockTitle>
          </BlockHeadContent>
        </BlockHead>
        <Block>
          <Card className="card-bordered">
            <div className="card-inner">
              {loading ? (
                <div className="text-center py-4">
                  <Spinner />
                </div>
              ) : (
                <Table responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Item</th>
                      <th>Requested by</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-soft py-4">
                          No requests
                        </td>
                      </tr>
                    ) : (
                      items.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {row.created_at
                              ? format(parseISO(row.created_at), "dd MMM HH:mm")
                              : "—"}
                          </td>
                          <td>
                            <div>{row.resource_label || row.request_path}</div>
                            <div className="text-soft small">{row.request_path}</div>
                          </td>
                          <td>{row.requester?.name || row.requested_by}</td>
                          <td>
                            <Badge
                              color={
                                row.status === "pending"
                                  ? "warning"
                                  : row.status === "completed" || row.status === "approved"
                                  ? "success"
                                  : "secondary"
                              }
                            >
                              {row.status}
                            </Badge>
                          </td>
                          <td className="text-end">
                            {isSuper && row.status === "pending" ? (
                              <>
                                <Button size="sm" color="success" className="me-1" onClick={() => approve(row.id)}>
                                  Approve
                                </Button>
                                <Button size="sm" color="danger" onClick={() => reject(row.id)}>
                                  Reject
                                </Button>
                              </>
                            ) : null}
                            {!isSuper && row.status === "pending" ? (
                              <Button size="sm" color="light" onClick={() => cancel(row.id)}>
                                Cancel
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              )}
            </div>
          </Card>
        </Block>
      </Content>
    </>
  );
};

export default connect((state) => ({ user: state.user?.user || state.user }))(DeletionApprovals);
