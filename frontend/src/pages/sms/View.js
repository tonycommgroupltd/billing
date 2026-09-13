import React, { useState, useEffect } from "react";
import {
    BlockHead,
    BlockBetween,
    BlockHeadContent,
    BlockTitle,
    Icon,
} from "../../components/Component";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { Link, useParams } from "react-router-dom";
import { Col, Row, Card, CardHeader, CardFooter, CardBody } from "reactstrap";
import { count } from "sms-length";
import { http } from '../../helpers';
import TimeAgo from 'react-timeago';
import nl2br from 'react-nl2br';
import dateFormat from 'dateformat';


const View = () => {
    const [counter, setCounter] = useState([]);
    const { id } = useParams();
    const [apiLoading, setApiLoading] = useState(false);
    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchMessage = async (id) => {
            setApiLoading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/view-messages/${id}`);
                    if (response.data?.message) {
                        setData(response.data?.message);
                        setCounter(count(response.data?.message.message + ' STOP *456*9*5#'));
                    }
                }
                setApiLoading(false);
            } catch (error) {
                setApiLoading(false);
            }
        };

        fetchMessage(id);

    }, [id]);

    return (
        <>
            <Head title="Message Details" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle tag="h6" page className="fs-18">
                                Message Details
                            </BlockTitle>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <Link to="/admin/sms/outbox" className="btn btn-light d-none d-sm-inline-flex">
                                <Icon name="arrow-left"></Icon>
                                <span>Back to All Messages</span>
                            </Link>
                            <Link to="/admin/sms/outbox" className="btn btn-icon btn-outline-light bg-white d-inline-flex d-sm-none">
                                <Icon name="arrow-left"></Icon>
                            </Link>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>
                <Row className="g-gs">
                    <Col md="8">
                        <Card style={{ boxShadow: "0 2px 5px rgba(0, 0, 0, .1)" }}>
                            <CardHeader className="border-bottom" style={{ backgroundColor: "#ffffff" }}>
                                <span className={"icon-wrap fs-16px " + (data && data.status === 'sent' ? data.network_report && data.network_report.description === 'AbsentSubscriber' ? 'text-soft' : data.network_report && data.network_report.description === 'DeliveredToTerminal' ? 'text-success' : data.network_report && data.network_report.description === 'SenderName Blacklisted' ? 'text-danger' : data.network_report && data.network_report.description === 'DeliveryImpossible' ? 'text-danger' : 'text-primary' : data.status === 'failed' ? 'text-danger' : 'text-dark')} style={{ verticalAlign: "bottom" }}>
                                    <Icon name={(data && data.network_report && data.network_report.description === 'DeliveredToTerminal' ? "check-circle-cut" : "cross-circle")} />
                                </span>
                                <strong className="fs-16px" style={{ lineHeight: "24px" }}>Message Content</strong>
                            </CardHeader>
                            <CardBody className="card-inner">
                                {apiLoading ? <div className="ps-20 pe-20">Loading...</div> :
                                    <p className="card-text">{nl2br(data.message)} <br />STOP *456*9*5#</p>
                                }
                            </CardBody>
                            <CardFooter className="border-top" style={{ backgroundColor: "#ffffff" }}>
                                {apiLoading ? <div className="ps-20 pe-20">Loading...</div> :
                                    <>
                                        <span>{counter?.length ?? 0} characters</span>
                                        <span> <i>•</i> {counter?.messages ?? 0} pages</span>
                                        <span> <i>•</i> Cost <strong>{counter?.messages ?? 0}</strong> <small>Units</small></span>
                                    </>
                                }
                            </CardFooter>
                        </Card>
                        <Card style={{ boxShadow: "0 2px 5px rgba(0, 0, 0, .1)" }}>
                            <CardHeader className="border-bottom" style={{ backgroundColor: "#ffffff" }}>
                                <strong className="fs-16px" style={{ lineHeight: "24px" }}>Message Details</strong>
                            </CardHeader>
                            {apiLoading ? <CardBody className="card-inner"><div className="ps-20 pe-20">Loading...</div></CardBody> :
                                <ul className="list-group list-group-sm">
                                    <li className="list-group-item" style={{ borderTop: 0, padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Recipient: <strong>{data && data.customer_id ? <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${data.customer_id}`}>{data.name}</Link> : data?.recipient ?? ''}</strong>
                                    </li>
                                    <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Status: {data && data.status === 'sent' ? data.network_report && data.network_report.description === 'AbsentSubscriber' ? <strong className="text-soft">AbsentSubscriber</strong> : data.network_report && data.network_report.description === 'DeliveredToTerminal' ? <strong className="text-success">Success</strong> : data.network_report && data.network_report.description === 'SenderName Blacklisted' ? <strong className="text-danger">Blacklisted</strong> : data.network_report && data.network_report.description === 'DeliveryImpossible' ? <strong className="text-danger">Failed</strong> : <strong className="text-primary">Sent</strong> : data.status === 'failed' ? <strong className="text-danger">Failed</strong> : <strong className="text-dark">Unkwown</strong>}
                                    </li>
                                    <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Created: <strong>{data ? <TimeAgo date={data.created_at} locale="en-US" /> : ''}</strong>
                                    </li>
                                </ul>
                            }
                        </Card>
                    </Col>
                    <Col md="4">
                        <Card style={{ boxShadow: "0 2px 5px rgba(0, 0, 0, .1)" }}>
                            <CardHeader className="border-bottom" style={{ backgroundColor: "#ffffff" }}>
                                <strong className="fs-16px" style={{ lineHeight: "24px" }}>Message Meta</strong>
                            </CardHeader>
                            {apiLoading ? <CardBody className="card-inner"><div className="ps-20 pe-20">Loading...</div></CardBody> :
                                <ul className="list-group list-group-sm">
                                    <li className="list-group-item" style={{ borderTop: 0, padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        ID: <strong>{data?.message_id ?? ''}</strong>
                                    </li>
                                    <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Time to send: <strong>{dateFormat(data.created_at, "mmm dS yyyy HH:MM:ss")}</strong>
                                    </li>
                                    <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Delivered On: {data.network_report && data.network_report.timestamp ? <strong>{dateFormat(data.network_report.timestamp, "mmm dS yyyy HH:MM:ss")}</strong> : '-'}
                                    </li>
                                    <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Time Taken: <strong>{data?.network_report?.timeTaken ?? ''}</strong>
                                    </li>
                                    <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Delivery Description: <strong>{data?.network_report?.description ?? ''}</strong>
                                    </li>
                                    {data && data.notice && data.notice.responses &&
                                        Object.keys(data.notice.responses).map((key) => (
                                            Object.keys(data.notice.responses[key]).map((ckey, i) => (
                                                <li key={i} className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)", textTransform: "capitalize" }}>
                                                    {ckey.split('-').slice().join(' ')}: <strong style={{ textTransform: "none" }}>{data.notice.responses[key][ckey]}</strong>
                                                </li>
                                            )
                                            )
                                        ))
                                    }
                                </ul>
                            }
                        </Card>
                    </Col>
                </Row>
            </Content>
        </>
    );
};

export default View;