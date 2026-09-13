import React, { useEffect, useState } from "react";
import { Alert, Badge, Spinner, Table } from "reactstrap";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import {
  BackTo,
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  PreviewCard,
} from "../../../components/Component";
import { fetchApiKeys } from "../../../helpers/adminHubApi";

const ApiKeysList = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await fetchApiKeys();
        if (alive) setRows(Array.isArray(data?.data) ? data.data : []);
      } catch (err) {
        if (alive) setError(err?.response?.data?.message || err.message || "Failed to load API keys");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <React.Fragment>
      <Head title="API keys" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>API keys</BlockTitle>
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
            {error ? <Alert color="danger">{error}</Alert> : null}
            {loading ? (
              <div className="text-center py-5">
                <Spinner size="sm" /> Loading…
              </div>
            ) : (
              <Table responsive className="mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td className="text-soft">{row.purpose}</td>
                      <td>
                        {row.configured ? (
                          <Badge color="success">Configured</Badge>
                        ) : (
                          <Badge color="warning">Missing</Badge>
                        )}
                      </td>
                      <td>
                        <code>{row.preview || "—"}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default ApiKeysList;
