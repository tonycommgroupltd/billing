import React from "react";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import {
    Block,
    BlockHead,
    BlockHeadContent,
    BlockTitle,
    BackTo,
} from "../../../components/Component";

import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-luxon';
import StreamingPlugin from 'chartjs-plugin-streaming';
import Chart from "chart.js/auto";

Chart.register(StreamingPlugin);

const Bandwidth = ({ ...props }) => {

    const formatFileSize = (e, t, n, i) => {
        let r, o;
        for ("undefined" === typeof t && (t = 2), "undefined" === typeof n && (n = 1024), "undefined" === typeof i && (i = !1), e = parseFloat(e), r = i ? ["b", "Kb", "Mb", "Gb", "Tb", "Pb", "Eb", "Zb", "Yb"] : ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"], o = 0; e >= n && o < r.length - 1; o++)
            e /= n;
        return `${e.toFixed(t) / 1} ${r[o]}`
    }

    const formatInternetSpeed = (e, t, n, i) => {
        return `${formatFileSize(e, t, n, i)}ps`
    }

    return (
        <>
            <Head title="Router list" />
            <Content>
                <BlockHead size="lg" wide="sm">
                    <BlockHeadContent>
                        <BackTo link="/admin/networking/routers/list" icon="arrow-left">
                            Routers
                        </BackTo>
                        <BlockTitle tag="h2" className="fw-normal">
                            List
                        </BlockTitle>
                    </BlockHeadContent>
                </BlockHead>

                <Block size="lg">
                    <Line
                        data={{
                            datasets: [{
                                label: "Upload",
                                fill: true,
                                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                                borderColor: 'rgb(255, 99, 132)',
                                pointRadius: 1,
                                borderWidth: 1,
                                spanGaps: true,
                                pointHitRadius: 5,
                                data: []
                            },
                            {
                                data: [],
                                label: "Download",
                                fill: true,
                                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                                borderColor: 'rgb(54, 162, 235)',
                                pointRadius: 1,
                                borderWidth: 1,
                                spanGaps: true,
                                pointHitRadius: 15,
                                cubicInterpolationMode: 'monotone',
                            }]
                        }}
                        options={{
                            scales: {
                                x: {
                                    type: 'realtime',
                                    realtime: {
                                        duration: 60000, // data in the past 60000 ms will be displayed
                                        refresh: 1000, // onRefresh callback will be called every 1000 ms
                                        delay: 1500,      // delay of 1000 ms, so upcoming values are known before plotting a line
                                        pause: false,     // chart is not paused
                                        ttl: undefined,   // data will be automatically deleted as it disappears off the chart
                                        frameRate: 30,    // data points are drawn 30 times every second
                                        onRefresh: chart => {
                                            // request data so that it can be received asynchronously
                                            // assume the response is an array of {x: timestamp, y: value} objects
                                            fetch(`${process.env.REACT_APP_API_URL}/router-monitor-traffic2`)
                                                .then(response => response.json())
                                                .then(data => {
                                                    // append the new data array to the existing chart data
                                                    chart.data.datasets[0].data.push(...[data[0]]);
                                                    chart.data.datasets[1].data.push(...[data[1]]);

                                                    // update chart datasets keeping the current animation
                                                    chart.update('quiet');
                                                });
                                        }
                                    }
                                },
                                y: {
                                    type: 'linear',
                                    beginAtZero: true,
                                    ticks: {
                                        callback: (value) => {
                                            return formatInternetSpeed(value, 0, 1000, true);
                                        }
                                    }
                                }
                            }
                        }}
                    />
                </Block>
            </Content>
        </>
    );
};

export default Bandwidth;