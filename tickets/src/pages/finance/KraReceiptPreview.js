import React, { useState } from "react";
import { Link } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  Row,
  Col,
} from "../../components/Component";
import { Alert, Badge, Card, Nav, NavItem, NavLink, TabContent, TabPane } from "reactstrap";
import KraReceipt, { KRA_RECEIPT_SAMPLES } from "../../components/kra/KraReceipt";
import classnames from "classnames";

/**
 * Sample receipt preview — shows how automatic KRA receipts look for
 * customers WITH a KRA PIN vs walk-in (no PIN).
 */
const KraReceiptPreview = () => {
  const [tab, setTab] = useState("walkin");

  return (
    <React.Fragment>
      <Head title="KRA Receipt Preview" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween className="g-3 align-items-center">
            <BlockHeadContent>
              <BlockTitle page>KRA Receipt Preview</BlockTitle>
              <p className="text-soft mb-0">
                How automatic eTIMS receipts will look — with KRA PIN or as walk-in consumer.
              </p>
            </BlockHeadContent>
            <BlockHeadContent>
              <Link to={`${process.env.PUBLIC_URL}/admin/finance/kra-auto`}>
                <Button color="light" outline>
                  <Icon name="setting" className="me-1" /> Auto invoicing
                </Button>
              </Link>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Alert color="info" className="mb-3">
          <strong>Automatic flow:</strong> when a customer pays in Splynx, the system issues an eTIMS invoice,
          stores it, and generates this receipt with a KRA verification QR code. Customers without a KRA PIN
          still get a valid consumer receipt (walk-in).
        </Alert>

        <Card className="card-bordered mb-3">
          <div className="card-inner py-2">
            <Nav tabs className="nav-tabs-s2">
              <NavItem>
                <NavLink
                  tag="button"
                  className={classnames({ active: tab === "walkin" })}
                  onClick={() => setTab("walkin")}
                >
                  Walk-in — Joram (0712848481)
                </NavLink>
              </NavItem>
              <NavItem>
                <NavLink
                  tag="button"
                  className={classnames({ active: tab === "pin" })}
                  onClick={() => setTab("pin")}
                >
                  With KRA PIN — Business customer
                </NavLink>
              </NavItem>
            </Nav>
          </div>
        </Card>

        <TabContent activeTab={tab}>
          <TabPane tabId="walkin">
            <Row className="g-gs">
              <Col lg="8">
                <KraReceipt receipt={KRA_RECEIPT_SAMPLES.walkIn} />
              </Col>
              <Col lg="4">
                <Card className="card-bordered h-100">
                  <div className="card-inner">
                    <h6 className="title mb-2">Walk-in customer</h6>
                    <p className="text-soft small">
                      No KRA PIN on file — receipt shows customer name + phone from Splynx.
                      Still fully valid for eTIMS; buyer appears as consumer.
                    </p>
                    <ul className="small text-soft">
                      <li>Phone: 0712848481</li>
                      <li>Plan: Main2 30MB — KES 500</li>
                      <li>M-Pesa ref: UEUKI6FA3M</li>
                      <li>Item: KE3NTXNOX00002</li>
                    </ul>
                  </div>
                </Card>
              </Col>
            </Row>
          </TabPane>
          <TabPane tabId="pin">
            <Row className="g-gs">
              <Col lg="8">
                <KraReceipt receipt={KRA_RECEIPT_SAMPLES.withPin} />
              </Col>
              <Col lg="4">
                <Card className="card-bordered h-100">
                  <div className="card-inner">
                    <h6 className="title mb-2">Registered KRA PIN</h6>
                    <p className="text-soft small">
                      Customer synced to VSCU with PIN before invoicing. Receipt shows buyer PIN
                      and links to KRA verification.
                    </p>
                    <ul className="small text-soft">
                      <li>PIN: P051234567X</li>
                      <li>INTERNET SERVICES — KES 3,500</li>
                      <li>Payment: Mobile Money</li>
                    </ul>
                  </div>
                </Card>
              </Col>
            </Row>
          </TabPane>
        </TabContent>
      </Content>
    </React.Fragment>
  );
};

export default KraReceiptPreview;
