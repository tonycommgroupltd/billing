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
import { http } from '../../helpers';
import TimeAgo from 'react-timeago';
import nl2br from 'react-nl2br';
import dateFormat from 'dateformat';


const View = () => {
    const { id } = useParams();
    const [apiLoading, setApiLoading] = useState(false);
    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchWhatsapp = async (id) => {
            setApiLoading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/view-whatsapp/${id}`);
                    if (response.data?.whatsapp) {
                        setData(response.data?.whatsapp);
                    }
                }
                setApiLoading(false);
            } catch (error) {
                setApiLoading(false);
            }
        };

        fetchWhatsapp(id);

    }, [id]);

    return (
        <>
            <Head title="Whatsapp Details" />
            <Content>
                <BlockHead size="sm">
                    <BlockBetween>
                        <BlockHeadContent>
                            <BlockTitle tag="h6" page className="fs-18">
                                Whatsapp Details
                            </BlockTitle>
                        </BlockHeadContent>
                        <BlockHeadContent>
                            <Link to="/admin/whatsapp/outbox" className="btn btn-light d-none d-sm-inline-flex">
                                <Icon name="arrow-left"></Icon>
                                <span>Back to All Messages</span>
                            </Link>
                            <Link to="/admin/whatsapp/outbox" className="btn btn-icon btn-outline-light bg-white d-inline-flex d-sm-none">
                                <Icon name="arrow-left"></Icon>
                            </Link>
                        </BlockHeadContent>
                    </BlockBetween>
                </BlockHead>
                <Row className="g-gs">
                    <Col md="8">
                        <Card style={{ boxShadow: "0 2px 5px rgba(0, 0, 0, .1)" }}>
                            <CardHeader className="border-bottom" style={{ backgroundColor: "#ffffff" }}>
                                <span className={"icon-wrap fs-16px " + (data && data.status === 'sent' ? 'text-primary' : data.status === 'delivered' ? 'text-success' : data.status === 'failed' ? 'text-danger' : data.status === 'read' ? 'text-success' : data.status === 'deleted' ? 'text-danger' : 'text-soft')} style={{ verticalAlign: "bottom" }}>
                                    <Icon name={(data && (data.status === 'delivered' || data.status === 'read') ? "check-circle-cut" : "cross-circle")} />
                                </span>
                                <strong className="fs-16px" style={{ lineHeight: "24px" }}>Message Content</strong>
                            </CardHeader>
                            <CardBody className="card-inner">
                                {apiLoading ? <div className="ps-20 pe-20">Loading...</div> :
                                    <p className="card-text">{data.message_description}</p>
                                }
                            </CardBody>
                        </Card>
                        <Card style={{ boxShadow: "0 2px 5px rgba(0, 0, 0, .1)" }}>
                            <CardHeader className="border-bottom" style={{ backgroundColor: "#ffffff" }}>
                                <strong className="fs-16px" style={{ lineHeight: "24px" }}>Message Details</strong>
                            </CardHeader>
                            {apiLoading ? <CardBody className="card-inner"><div className="ps-20 pe-20">Loading...</div></CardBody> :
                                <ul className="list-group list-group-sm">
                                    <li className="list-group-item" style={{ borderTop: 0, padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Recipient: <strong>{data && data.customer_id ? <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${data.customer_id}`}>{data.name}</Link> : data?.from ?? ''}</strong>
                                    </li>
                                    <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Status: {data && data.status === 'sent' ? <strong className="text-primary">Sent</strong> : data.status === 'delivered' ? <strong className="text-success">Success</strong> : data.status === 'failed' ? <strong className="text-danger">Failed</strong> : data.status === 'queued' ? <strong className="text-soft">Queued</strong> : data.status === 'read' ? <strong className="text-success">Read</strong> : data.status === 'deleted' ? <strong className="text-danger">Deleted</strong> : <strong className="text-dark">Unknown</strong>}
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
                                        Created On: <strong>{dateFormat(data.created_at, "mmm dS yyyy HH:MM:ss")}</strong>
                                    </li>
                                    <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Time to send: {data.sent_at ? <strong>{dateFormat(data.sent_at, "mmm dS yyyy HH:MM:ss")}</strong> : '-'}
                                    </li>
                                    <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Delivered On: {data.delivered_on ? <strong>{dateFormat(data.delivered_on, "mmm dS yyyy HH:MM:ss")}</strong> : '-'}
                                    </li>
                                    <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                        Read On: {data.read_at ? <strong>{dateFormat(data.read_at, "mmm dS yyyy HH:MM:ss")}</strong> : '-'}
                                    </li>
                                    {data && data.status === 'failed' && data.data && data.data.code &&
                                        <li className="list-group-item" style={{ padding: "0.75rem 1.25rem", borderColor: "rgba(160, 175, 185, 0.05)" }}>
                                            Error: <strong style={{ textTransform: "none" }}>{data.data.message}</strong>
                                        </li>
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