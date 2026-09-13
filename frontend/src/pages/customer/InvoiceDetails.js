import React, { useState, useEffect } from "react";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import LogoDark from "../../images/logo-dark.png";
import {
    BlockHead,
    BlockTitle,
    Button,
    Icon,
    BlockDes,
    BlockHeadContent,
    Block,
    BlockBetween,
} from "../../components/Component";
import { useParams, Link } from 'react-router-dom';
import { http } from '../../helpers';
import dateFormat from 'dateformat';
import axios from 'axios';
import { toast } from "react-toastify";

const numberFormat = (value) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'KES'
    }).format(value);

const CloseButton = () => {
    return (
        <span className="btn-trigger toast-close-button" role="button">
            <Icon name="cross"></Icon>
        </span>
    );
};

const InvoiceDetails = () => {
    const [data, setData] = useState();
    const { id } = useParams();
    const [apiLoading, setApiLoading] = useState(false);

    const execToast = (placement, message) => {
        toast.error(message, {
            position: placement,
            autoClose: true,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: false,
            closeButton: <CloseButton />,
        });
    };

    const successToast = (placement, message) => {
        toast.success(message, {
            position: placement,
            autoClose: true,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: false,
            closeButton: <CloseButton />,
        });
    };

    const execToastInfo = (placement, message) => {
        toast.info(message, {
            position: placement,
            autoClose: true,
            hideProgressBar: true,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: false,
            closeButton: <CloseButton />,
        });
    };

    const downloadPdf = async () => {
        try {
            execToastInfo("top-right", "Please wait as document is being processed.");
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/download-invoices/${id}`, { responseType: "blob" });
            if (response.data) {
                successToast("top-right", "Document processed successfully.");
            }
            const pdfBlob = new Blob([response.data], { type: 'application/pdf' });

            const url = window.URL.createObjectURL(pdfBlob);
            const tempLink = document.createElement("a");
            tempLink.href = url;
            tempLink.setAttribute("download",
                `invoice-${id}.pdf`
            );
            document.body.appendChild(tempLink);
            tempLink.click();

            document.body.removeChild(tempLink);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            execToast("top-right", "Error downloading PDF:" + error);
            console.error("Error downloading PDF:", error)
        }
    }

    useEffect(() => {
        const fetchInvoice = async (id) => {

            setApiLoading(true);
            try {
                if (id !== undefined || null || "") {
                    const response = await http.get(`${process.env.REACT_APP_API_URL}/view-invoices/${id}`);

                    if (response.data?.invoice) {
                        setData(response.data?.invoice);
                    } else {
                        setData([]);
                    }
                }
                setApiLoading(false);
            } catch (error) {
                //setApiLoading(false);
            }
        };

        if (id !== undefined || null || "") {
            fetchInvoice(id);
        } else {
            setData([]);
        }

        return () => {
            setApiLoading(false);
        };
    }, [id]);

    return (
        <React.Fragment>
            <Head title="Invoice Detail"></Head>
            {data && (
                <Content>
                    <BlockHead>
                        <BlockBetween className="g-3">
                            <BlockHeadContent>
                                <BlockTitle>
                                    Invoice <strong className="text-primary small">#{data.id}</strong>
                                </BlockTitle>
                                <BlockDes className="text-soft">
                                    <ul className="list-inline">
                                        <li>
                                            Created At: <span className="text-base">{dateFormat(data.created_at, "dd mmm yyyy, hh:MMtt")}</span>
                                        </li>
                                    </ul>
                                </BlockDes>
                            </BlockHeadContent>
                            <BlockHeadContent>
                                <Link to={`${process.env.PUBLIC_URL}/portal/finance/invoices`}>
                                    <Button color="light" outline className="bg-white d-none d-sm-inline-flex">
                                        <Icon name="arrow-left"></Icon>
                                        <span>Back</span>
                                    </Button>
                                </Link>
                                <Link to={`${process.env.PUBLIC_URL}/portal/finance/invoices`}>
                                    <Button color="light" outline className="btn-icon bg-white d-inline-flex d-sm-none">
                                        <Icon name="arrow-left"></Icon>
                                    </Button>
                                </Link>
                            </BlockHeadContent>
                        </BlockBetween>
                    </BlockHead>

                    <Block>
                        <div className="invoice">
                            <div className="invoice-action">
                                <Button size="lg" color="primary" outline className="btn-icon btn-white btn-dim" onClick={downloadPdf}>
                                    <Icon name="file-pdf"></Icon>
                                </Button>
                            </div>
                            <div className="invoice-wrap">
                                <div className="invoice-brand text-center">
                                    <img src={LogoDark} alt="" />
                                </div>

                                <div className="invoice-head">
                                    <div className="invoice-contact">
                                        <span className="overline-title">Invoice To</span>
                                        <div className="invoice-contact-info">
                                            <h4 className="title">{data?.customer_name ?? ''}</h4>
                                            <ul className="list-plain">
                                                <li>
                                                    <Icon name="call-fill"></Icon>
                                                    <span>{data?.customer_phone ?? ''}</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                    <div className="invoice-desc">
                                        <h3 className="title">Invoice</h3>
                                        <ul className="list-plain">
                                            <li className="invoice-id">
                                                <span>Invoice ID</span>:<span>{data.id}</span>
                                            </li>
                                            <li className="invoice-date">
                                                <span>Date</span>:<span>{data?.invoice_date.split(",")[0]}</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>

                                <div className="invoice-bills">
                                    <div className="table-responsive">
                                        <table className="table table-striped">
                                            <thead>
                                                <tr>
                                                    <th className="w-150px">Item ID</th>
                                                    <th className="w-60">Description</th>
                                                    <th>Price</th>
                                                    <th>Qty</th>
                                                    <th>Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td>{data.id}</td>
                                                    <td>Internet subscription service</td>
                                                    <td>{numberFormat(data.total)}</td>
                                                    <td>1</td>
                                                    <td>{numberFormat(data.total)}</td>
                                                </tr>
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <td colSpan="2"></td>
                                                    <td colSpan="2">Subtotal</td>
                                                    <td>
                                                        {numberFormat(data.total)}
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td colSpan="2"></td>
                                                    <td colSpan="2">Grand Total</td>
                                                    <td>{numberFormat(data.total)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                        <div className="nk-notes ff-italic fs-12px text-soft">
                                            Invoice was created on a computer and is valid without the signature and seal.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Block>
                </Content>
            )}
        </React.Fragment>
    );
};
export default InvoiceDetails;
