import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Spinner, Table } from "reactstrap";
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
import { fetchLicense } from "../../../helpers/adminHubApi";

const LicenseView = () => {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await fetchLicense();
        if (alive) setInfo(data?.data || null);
      } catch (err) {
        if (alive) setError(err?.response?.data?.message || err.message || "Failed to load license info");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const rows = info
    ? [
        ["Product", info.product],
        ["License type", info.license_type],
        ["Licensed", info.licensed ? "Yes" : "No"],
        ["Environment", info.environment],
        ["App URL", info.app_url],
        ["PHP", info.php_version],
        ["Laravel", info.laravel_version],
        ["Timezone", info.timezone],
        ["Notes", info.notes],
      ]
    : [];

  return (
    <React.Fragment>
      <Head title="License" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>License</BlockTitle>
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
              <>
                <Table borderless className="mb-3">
                  <tbody>
                    {rows.map(([label, value]) => (
                      <tr key={label}>
                        <th style={{ width: 180 }}>{label}</th>
                        <td>{value || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Button tag={Link} to="/admin/administration/high-availability" color="primary">
                  Open high availability
                </Button>
              </>
            )}
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default LicenseView;
