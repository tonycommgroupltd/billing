import React, { useState, useEffect } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Card, Tooltip } from "reactstrap";
import {
    Block,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
    Row,
    Col,
} from "../../components/Component";
import { Link } from "react-router-dom";
import { Calculator24Regular, BookCoins24Regular, DocumentBulletList24Regular, DocumentError24Regular, QuestionCircle24Regular } from '@fluentui/react-icons';
import { httpNode } from '../../helpers';

const Dashboard = () => {
    const [tooltipOpen, setOpen] = useState(false);

    const toggle = () => { setOpen(!tooltipOpen) };

    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchDashboardStats = async () => {
            //setApiLoading(true);
            try {
                const response = await httpNode.get('/finance/dashboard-stats');
                //console.log(response);
                if (response.data) {
                    setData(response.data);
                }
                //setApiLoading(false);
            } catch (error) {
                //setApiLoading(false);
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
                            Finance Dashboard
                        </BlockTitle>
                    </BlockHeadContent>
                </BlockHead>
                <Block>
                    <Row className="g-gs dashboard-top">
                        <Col sm="6" md="3" className="dashboards-top-block-item">
                            <Card>
                                <div className="card-inner p-0">
                                    <div className="dashboards-top-block-item-title">
                                        <span className="icon-wrap">
                                            <BookCoins24Regular />
                                        </span>
                                        <span className="text">Payments</span>
                                    </div>
                                    <div className="dashboards-top-block-item-bottom">
                                        <span className="view">{data?.sum_this_month_payments ?? '0.00'}&nbsp;Sh</span>
                                        <span className="count">{data?.this_month_payments ?? 0}</span>
                                    </div>
                                    <Link to={`${process.env.PUBLIC_URL}/admin/finance/payments`} className="dashboards-top-block-item-link-absolute action-click" />
                                </div>
                            </Card>
                        </Col>
                        <Col sm="6" md="3" className="dashboards-top-block-item">
                            <Card>
                                <div className="card-inner dashboards-top-block-item p-0">
                                    <div className="dashboards-top-block-item-title">
                                        <span className="icon-wrap">
                                            <DocumentBulletList24Regular />
                                        </span>
                                        <span className="text">Paid invoices</span>
                                    </div>
                                    <div className="dashboards-top-block-item-bottom">
                                        <span className="view">{data?.sum_this_month_paid_invoices ?? '0.00'}&nbsp;Sh</span>
                                        <span className="count">{data?.this_month_paid_invoices ?? 0}</span>
                                    </div>
                                    <Link to={`${process.env.PUBLIC_URL}/admin/finance/invoices?status=2`} className="dashboards-top-block-item-link-absolute action-click" />
                                </div>
                            </Card>
                        </Col>
                        <Col sm="6" md="3" className="dashboards-top-block-item">
                            <Card>
                                <div className="card-inner dashboards-top-block-item p-0">
                                    <div className="dashboards-top-block-item-title">
                                        <span className="icon-wrap">
                                            <DocumentError24Regular />
                                        </span>
                                        <span className="text">Unpaid invoices</span>
                                    </div>
                                    <div className="dashboards-top-block-item-bottom">
                                        <span className="view">{data?.sum_this_month_unpaid_invoices ?? '0.00'}&nbsp;Sh</span>
                                        <span className="count">{data?.this_month_unpaid_invoices ?? 0}</span>
                                    </div>
                                    <Link to={`${process.env.PUBLIC_URL}/admin/finance/invoices?status=1`} className="dashboards-top-block-item-link-absolute action-click" />
                                </div>
                            </Card>
                        </Col>
                        <Col sm="6" md="3" className="dashboards-top-block-item">
                            <Card>
                                <div className="card-inner dashboards-top-block-item p-0">
                                    <div className="dashboards-top-block-item-title">
                                        <span className="icon-wrap">
                                            <DocumentError24Regular />
                                        </span>
                                        <span className="text">Credit notes</span>
                                    </div>
                                    <div className="dashboards-top-block-item-bottom">
                                        <span className="view">0.00 Sh</span>
                                        <span className="count">0</span>
                                    </div>
                                    <Link to={`${process.env.PUBLIC_URL}/admin/invoice-list`} className="dashboards-top-block-item-link-absolute action-click" />
                                </div>
                            </Card>
                        </Col>
                    </Row>
                    <Row className="g-gs" id="finance-statistic-block">
                        <Col sm="4" className="mb-20 mb-md-0">
                            <ul className="list-group">
                                <li className="list-group-item heading-list-group-item">
                                    <div className="btn-icon-sm">
                                        <Calculator24Regular />
                                    </div>
                                    &nbsp;Last month
                                </li>
                                <li className="list-group-item">Payments
                                    <span className="pull-right">{data?.last_month_payments ?? 0} ({data?.sum_last_month_payments ?? '0.00'}&nbsp;Sh)</span>
                                </li>
                                <li className="list-group-item">Paid invoices
                                    <span className="pull-right">{data?.last_month_paid_invoices ?? 0} ({data?.sum_last_month_paid_invoices ?? '0.00'}&nbsp;Sh)</span>
                                </li>
                                <li className="list-group-item">Unpaid invoices
                                    <span className="pull-right">{data?.last_month_unpaid_invoices ?? 0} ({data?.sum_last_month_unpaid_invoices ?? '0.00'}&nbsp;Sh)</span>
                                </li>
                                <li className="list-group-item">Credit notes
                                    <span className="pull-right">0 (0.00&nbsp;Sh)</span>
                                </li>
                            </ul>
                        </Col>
                        <Col sm="4" className="mb-20 mb-md-0">
                            <ul className="list-group">
                                <li className="list-group-item heading-list-group-item">
                                    <div className="btn-icon-sm">
                                        <Calculator24Regular />
                                    </div>
                                    &nbsp;This month
                                </li>
                                <li className="list-group-item">Payments
                                    <span className="pull-right">{data?.this_month_payments ?? 0} ({data?.sum_this_month_payments ?? '0.00'}&nbsp;Sh)</span>
                                </li>
                                <li className="list-group-item">Paid invoices
                                    <span className="pull-right">{data?.this_month_paid_invoices ?? 0} ({data?.sum_this_month_paid_invoices ?? '0.00'}&nbsp;Sh)</span>
                                </li>
                                <li className="list-group-item">Unpaid invoices
                                    <span className="pull-right">{data?.this_month_unpaid_invoices ?? 0} ({data?.sum_this_month_unpaid_invoices ?? '0.00'}&nbsp;Sh)</span>
                                </li>
                                <li className="list-group-item">Credit notes
                                    <span className="pull-right">0 (0.00&nbsp;Sh)</span>
                                </li>
                            </ul>
                        </Col>
                        <Col sm="4" className="mb-20 mb-md-0">
                            <ul className="list-group">
                                <li className="list-group-item heading-list-group-item">
                                    <div className="btn-icon-sm">
                                        <Calculator24Regular />
                                    </div>
                                    &nbsp;Next month
                                    <span className="btn-icon-sm cursor-pointer ms-4" id="next">
                                        <QuestionCircle24Regular />
                                    </span>
                                    <Tooltip placement="top" isOpen={tooltipOpen} target="next" toggle={toggle}>
                                        Important! These are preliminary calculations for the next month, they may vary depending on conditions.
                                    </Tooltip>

                                </li>
                                <li className="list-group-item">Debit transactions
                                    <span className="pull-right">0 (0.00&nbsp;Sh)</span>
                                </li>
                                <li className="list-group-item">Credit transactions
                                    <span className="pull-right">0 (0.00&nbsp;Sh)</span>
                                </li>
                                <li className="list-group-item">Invoices
                                    <span className="pull-right">0 (0.00&nbsp;Sh)</span>
                                </li>
                                <li className="list-group-item">Proforma invoices
                                    <span className="pull-right">0 (0.00&nbsp;Sh)</span>
                                </li>
                            </ul>
                        </Col>
                    </Row>
                </Block>
            </Content>
        </React.Fragment >
    );
};
export default Dashboard;
