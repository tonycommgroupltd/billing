import React from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
    Block,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
} from "../../components/Component";
import { Link } from "react-router-dom";
import {
    PeopleSettings20Regular, PeopleTeam20Regular, People20Regular, GlobeLocation20Regular, Key20Regular, TextGrammarSettings20Regular, ArrowCircleDown20Regular, Globe20Regular, DocumentSave20Regular, MailTemplate20Regular, Chat24Regular, BookClock20Regular, Connector20Regular, ArrowSync20Regular, DocumentSync20Regular, Clock20Regular,
    CheckmarkStarburst20Regular, Desktop20Regular, BookInformation20Regular, ChatMultiple20Regular, Video20Regular, WindowNew20Regular,
    Document20Regular, ArrowExportLtr20Regular, ReceiptMoney20Regular, DataTrending20Regular, DocumentMultipleProhibited20Regular,
    DocumentEdit20Regular, DocumentRibbon20Regular, TextBulletListSquareEdit20Regular, TextBulletListSquare20Regular, PeopleMoney20Regular, TicketDiagonal20Regular, NotepadPerson20Regular
} from '@fluentui/react-icons';

const View = () => {

    return (
        <React.Fragment>
            <Head title="Dashboard"></Head>
            <Content>
                <BlockHead size="sm">
                    <BlockHeadContent>
                        <BlockTitle page tag="h3">
                            Administration
                        </BlockTitle>
                    </BlockHeadContent>
                </BlockHead>
                <Block>
                    <div className="adm-settings-panel">
                        <div className="shortcuts-wrap color-purple">
                            <h3 className="heading">
                                <font style={{ verticalAlign: 'inherit' }}>
                                    <font style={{ verticalAlign: 'inherit' }}>{process.env.REACT_APP_SITE_TITLE}</font>
                                </font>
                            </h3>
                            <div className="shortcuts-list">
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/high-availability`} className="button-purple" title="High availability">
                                        <span className="icon-wrap me-4">
                                            <Connector20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>High availability</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/hub-sync`} className="button-purple" title="Hub sync">
                                        <span className="icon-wrap me-4">
                                            <ArrowSync20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Hub sync</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/administrators`} className="button-purple" title="Administrators">
                                        <span className="icon-wrap me-4">
                                            <PeopleSettings20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Administrators</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/roles`} className="button-purple" title="Roles">
                                        <span className="icon-wrap me-4">
                                            <PeopleTeam20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Roles</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/partners`} className="button-purple" title="Partners">
                                        <span className="icon-wrap me-4">
                                            <People20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Partners</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/locations`} className="button-purple" title="Locations">
                                        <span className="icon-wrap me-4">
                                            <GlobeLocation20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Locations</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/api-keys`} className="button-purple" title="API keys">
                                        <span className="icon-wrap me-4">
                                            <Key20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>API keys</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/megapay`} className="button-purple" title="MegaPay">
                                        <span className="icon-wrap me-4">
                                            <ReceiptMoney20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>MegaPay</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                            </div>
                        </div>
                        <div className="shortcuts-wrap color-success">
                            <h3 className="heading">
                                <font style={{ verticalAlign: 'inherit' }}>
                                    <font style={{ verticalAlign: 'inherit' }}>Logs</font>
                                </font>
                            </h3>
                            <div className="shortcuts-list">
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/logs/operations`} className="button-success" title="Operations">
                                        <span className="icon-wrap me-4">
                                            <TextGrammarSettings20Regular />
                                        </span><span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Operations</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/logs/internal`} className="button-success" title="Internal">
                                        <span className="icon-wrap me-4">
                                            <ArrowCircleDown20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Internal</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/logs/portal`} className="button-success" title="Portal">
                                        <span className="icon-wrap me-4">
                                            <Globe20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Portal</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/logs/files`} className="button-success" title="Files">
                                        <span className="icon-wrap me-4">
                                            <DocumentSave20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Files</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/logs/email`} className="button-success" title="Email">
                                        <span className="icon-wrap me-4">
                                            <MailTemplate20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Email</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/logs/sms`} className="button-success" title="SMS">
                                        <span className="icon-wrap me-4">
                                            <Chat24Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>SMS</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/logs/sessions`} className="button-success" title="Sessions">
                                        <span className="icon-wrap me-4">
                                            <BookClock20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Sessions</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/logs/api`} className="button-success" title="API">
                                        <span className="icon-wrap me-4">
                                            <Connector20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>API</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/logs/changes`} className="button-success" title="Change statuses &amp; plans">
                                        <span className="icon-wrap me-4">
                                            <DocumentSync20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Change statuses &amp; plans</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/logs/pending`} className="button-success" title="Pending statuses &amp; services">
                                        <span className="icon-wrap me-4">
                                            <Clock20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Pending statuses &amp; services</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                            </div>
                        </div>
                        <div className="shortcuts-wrap color-warning">
                            <h3 className="heading">
                                <font style={{ verticalAlign: 'inherit' }}>
                                    <font style={{ verticalAlign: 'inherit' }}>Information</font>
                                </font>
                            </h3>
                            <div className="shortcuts-list">
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/splynx/license`} className="button-warning" title="License">
                                        <span className="icon-wrap me-4">
                                            <CheckmarkStarburst20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>License</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}`} title="Site" className="button-warning">
                                        <span className="icon-wrap me-4">
                                            <Desktop20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Site</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}`} title="Documentation" className="button-warning">
                                        <span className="icon-wrap me-4">
                                            <BookInformation20Regular />
                                        </span>
                                        <span
                                            className="button-title"><span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Documentation</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}`} title="Forum" className="button-warning">
                                        <span className="icon-wrap me-4">
                                            <ChatMultiple20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Forum</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}`} title="YouTube channel" className="button-warning">
                                        <span className="icon-wrap me-4">
                                            <Video20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>YouTube channel</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}`} title="Deployment videos" className="button-warning">
                                        <span className="icon-wrap me-4">
                                            <Video20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Deployment videos</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}`} title="Facebook" className="button-warning">
                                        <span className="icon-wrap me-4">
                                            <WindowNew20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Facebook</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}`} title="API documentation" className="button-warning">
                                        <span className="icon-wrap me-4">
                                            <Connector20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>API documentation</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                            </div>
                        </div>
                        <div className="shortcuts-wrap color-danger">
                            <h3 className="heading">
                                <font style={{ verticalAlign: 'inherit' }}>
                                    <font style={{ verticalAlign: 'inherit' }}>Reports</font>
                                </font>
                            </h3>
                            <div className="shortcuts-list">
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/administration/reports/statistics-internet`} className="button-danger" title="Internet plan usage">
                                        <span className="icon-wrap me-4">
                                            <Document20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Internet plan usage</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/services-export`} className="button-danger" title="Services export">
                                        <span className="icon-wrap me-4">
                                            <ArrowExportLtr20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Services export</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/finance-report`} className="button-danger" title="Financial report per plan">
                                        <span className="icon-wrap me-4">
                                            <ReceiptMoney20Regular />
                                        </span>
                                        <span className="button-title">
                                            <span>
                                                <font style={{ verticalAlign: 'inherit' }}>
                                                    <font style={{ verticalAlign: 'inherit' }}>Financial report per plan</font>
                                                </font>
                                            </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/usage-report`} className="button-danger" title="Customer internet usage">
                                        <span className="icon-wrap me-4">
                                            <PeopleTeam20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Customer internet usage</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/refill-card-statistics`} className="button-danger" title="Refill cards statistics">
                                        <span className="icon-wrap me-4">
                                            <DataTrending20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Refill cards statistics</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/blocked-report`} className="button-danger" title="Blocked customers report">
                                        <span className="icon-wrap me-4">
                                            <DocumentMultipleProhibited20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Blocked customers report</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/finance-logs`} className="button-danger" title="Finance logs">
                                        <span className="icon-wrap me-4">
                                            <DocumentEdit20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Finance logs</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/statements-main`} className="button-danger" title="Statements">
                                        <span className="icon-wrap me-4">
                                            <DocumentRibbon20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Statements</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/tax`} className="button-danger" title="Tax reports">
                                        <span className="icon-wrap me-4">
                                            <TextBulletListSquareEdit20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Tax reports</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/invoice-report`} className="button-danger" title="Invoice report">
                                        <span className="icon-wrap me-4">
                                            <ReceiptMoney20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Invoice report</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/new-services-report`} className="button-danger" title="New services report">
                                        <span className="icon-wrap me-4">
                                            <TextBulletListSquareEdit20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>New services report</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/custom-prices-and-discount-report`} className="button-danger" title="Custom prices &amp; discounts">
                                        <span className="icon-wrap me-4">
                                            <PeopleMoney20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Custom prices &amp; discounts</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/transactions-categories`} className="button-danger" title="Transactions categories">
                                        <span className="icon-wrap me-4">
                                            <TextBulletListSquare20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Transactions categories</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/ticket-reports`} className="button-danger" title="Ticket reports">
                                        <span className="icon-wrap me-4">
                                            <TicketDiagonal20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Ticket reports</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                                <div className="shortcuts-button">
                                    <Link to={`${process.env.PUBLIC_URL}/admin/administration/reports/customer-contracts`} className="button-danger" title="Customer contracts">
                                        <span className="icon-wrap me-4">
                                            <NotepadPerson20Regular />
                                        </span>
                                        <span className="button-title"><span>
                                            <font style={{ verticalAlign: 'inherit' }}>
                                                <font style={{ verticalAlign: 'inherit' }}>Customer contracts</font>
                                            </font>
                                        </span>
                                        </span>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </Block>
            </Content>
        </React.Fragment >
    );
};
export default View;
