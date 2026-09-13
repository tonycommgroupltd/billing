import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DataTable from "react-data-table-component";
import exportFromJSON from "export-from-json";
import { Alert, Spinner } from "reactstrap";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import {
  BackTo,
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  PreviewCard,
} from "../../../components/Component";
import { fetchAdminReport } from "../../../helpers/adminHubApi";

const AdminReport = () => {
  const { type } = useParams();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await fetchAdminReport(type);
      setPayload(data);
    } catch (err) {
      setPayload(null);
      setError(err?.response?.data?.message || err.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const columns = useMemo(() => {
    const cols = payload?.columns || [];
    return cols.map((key) => ({
      name: String(key).replace(/_/g, " "),
      selector: (row) => {
        const value = row?.[key];
        if (value == null || value === "") return "";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
      },
      cell: (row) => {
        const value = row?.[key];
        if (key.endsWith("_path") && value) {
          return (
            <Link to={value} className="link">
              Open
            </Link>
          );
        }
        if (value == null || value === "") return "—";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
      },
      sortable: true,
      wrap: true,
      grow: key === "customer" || key === "plan" || key === "name" ? 2 : 1,
    }));
  }, [payload]);

  const rows = Array.isArray(payload?.rows) ? payload.rows : [];

  const exportCsv = () => {
    exportFromJSON({
      data: rows,
      fileName: type || "report",
      exportType: exportFromJSON.types.csv,
    });
  };

  const exportExcel = () => {
    exportFromJSON({
      data: rows,
      fileName: type || "report",
      exportType: exportFromJSON.types.xls,
    });
  };

  return (
    <React.Fragment>
      <Head title={payload?.title || "Report"} />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>{payload?.title || "Report"}</BlockTitle>
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
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <div className="text-soft">{rows.length} row(s)</div>
              <div className="d-flex gap-2">
                <Button color="light" size="sm" onClick={refresh} disabled={loading}>
                  Refresh
                </Button>
                <Button color="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
                  CSV
                </Button>
                <Button color="secondary" size="sm" onClick={exportExcel} disabled={!rows.length}>
                  Excel
                </Button>
              </div>
            </div>
            {error ? <Alert color="danger">{error}</Alert> : null}
            {loading ? (
              <div className="text-center py-5">
                <Spinner size="sm" /> Loading…
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                pagination
                paginationPerPage={25}
                highlightOnHover
                dense
                noDataComponent={<div className="p-4 text-soft">No rows for this report.</div>}
              />
            )}
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default AdminReport;
