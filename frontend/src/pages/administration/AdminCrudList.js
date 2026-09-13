import React, { useCallback, useEffect, useMemo, useState } from "react";
import DataTable from "react-data-table-component";
import { Alert, Col, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner } from "reactstrap";
import Swal from "sweetalert2";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import {
  BackTo,
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
} from "../../components/Component";

/**
 * Simple JSON-backed CRUD list for Administration hub entities.
 */
const AdminCrudList = ({
  title,
  columns,
  fields,
  load,
  create,
  update,
  remove,
  emptyLabel = "No records yet. Add the first one.",
}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const blankForm = useMemo(() => {
    const next = {};
    fields.forEach((f) => {
      next[f.name] = "";
    });
    return next;
  }, [fields]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await load();
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm);
    setModal(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    const next = { ...blankForm };
    fields.forEach((f) => {
      next[f.name] = row[f.name] ?? "";
    });
    setForm(next);
    setModal(true);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      if (editing?.id) {
        await update(editing.id, form);
      } else {
        await create(form);
      }
      setModal(false);
      await refresh();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || err.message || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row) => {
    const result = await Swal.fire({
      title: "Delete?",
      text: `Remove ${row.name || "this record"}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (!result.isConfirmed) return;
    try {
      await remove(row.id);
      await refresh();
    } catch (err) {
      Swal.fire("Error", err?.response?.data?.message || err.message || "Delete failed", "error");
    }
  };

  const tableColumns = useMemo(
    () => [
      ...columns,
      {
        name: "Actions",
        width: "140px",
        cell: (row) => (
          <div className="d-flex gap-1">
            <Button size="sm" color="light" onClick={() => openEdit(row)}>
              Edit
            </Button>
            <Button size="sm" color="danger" outline onClick={() => onDelete(row)}>
              Delete
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns]
  );

  return (
    <React.Fragment>
      <Head title={title} />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>{title}</BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <BackTo link="/admin/administration" icon="arrow-left">
                Administration
              </BackTo>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>
        <Block>
          <PreviewCard>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div className="text-soft">{rows.length} record(s)</div>
              <Button color="primary" onClick={openCreate}>
                <Icon name="plus" />
                <span>Add</span>
              </Button>
            </div>
            {error ? <Alert color="danger">{error}</Alert> : null}
            {loading ? (
              <div className="text-center py-5">
                <Spinner size="sm" /> Loading…
              </div>
            ) : (
              <DataTable
                columns={tableColumns}
                data={rows}
                noDataComponent={<div className="p-4 text-soft">{emptyLabel}</div>}
                pagination
                highlightOnHover
                dense
              />
            )}
          </PreviewCard>
        </Block>

        <Modal isOpen={modal} toggle={() => setModal(false)} size="lg">
          <ModalHeader toggle={() => setModal(false)}>{editing ? "Edit" : "Add"} {title}</ModalHeader>
          <ModalBody>
            <Row className="gy-3">
              {fields.map((field) => (
                <Col md={field.col || 6} key={field.name}>
                  <label className="form-label">{field.label}</label>
                  {field.type === "textarea" ? (
                    <textarea
                      className="form-control"
                      rows={3}
                      value={form[field.name] || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    />
                  ) : (
                    <input
                      type={field.type || "text"}
                      className="form-control"
                      value={form[field.name] || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    />
                  )}
                </Col>
              ))}
            </Row>
          </ModalBody>
          <ModalFooter>
            <Button color="light" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button color="primary" onClick={onSave} disabled={saving || !form.name}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </ModalFooter>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

export default AdminCrudList;
