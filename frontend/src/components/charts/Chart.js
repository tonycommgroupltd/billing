import React from "react";
import "./registerChartJs";
import { Line, Bar, Pie, Doughnut } from "react-chartjs-2";

const tooltipDefaults = {
  enabled: true,
  backgroundColor: "#eff6ff",
  titleColor: "#6783b8",
  bodyColor: "#9eaecf",
  titleFont: { size: 13 },
  bodyFont: { size: 12 },
  padding: 10,
  displayColors: false,
};

export const LineChartExample = ({ data, legend }) => {
  return (
    <Line
      className="line-chart"
      data={data}
      options={{
        plugins: {
          legend: {
            display: legend,
            labels: {
              boxWidth: 12,
              padding: 20,
              color: "#6783b8",
            },
          },
          tooltip: tooltipDefaults,
        },
        maintainAspectRatio: false,
        scales: {
          y: {
            display: true,
            ticks: {
              color: "#9eaecf",
              font: { size: 12 },
              padding: 10,
            },
            grid: {
              tickLength: 0,
            },
          },
          x: {
            display: true,
            ticks: {
              color: "#9eaecf",
              font: { size: 12 },
              padding: 5,
            },
            grid: {
              display: false,
              tickLength: 10,
            },
          },
        },
      }}
    />
  );
};

export const BarChartExample = ({ data, stacked }) => {
  return (
    <Bar
      data={data}
      options={{
        plugins: {
          legend: {
            display: false,
            labels: {
              boxWidth: 30,
              padding: 20,
              color: "#6783b8",
            },
          },
          tooltip: tooltipDefaults,
        },
        maintainAspectRatio: false,
        scales: {
          y: {
            display: true,
            stacked: !!stacked,
            beginAtZero: true,
            ticks: {
              color: "#9eaecf",
              font: { size: 12 },
              padding: 5,
            },
            grid: {
              tickLength: 0,
            },
          },
          x: {
            display: true,
            stacked: !!stacked,
            ticks: {
              color: "#9eaecf",
              font: { size: 12 },
              padding: 5,
            },
            grid: {
              display: false,
              tickLength: 10,
            },
          },
        },
      }}
    />
  );
};

export const PieChartExample = ({ data }) => {
  return (
    <Pie
      data={data}
      options={{
        plugins: {
          legend: { display: false },
          tooltip: tooltipDefaults,
        },
        rotation: -0.2,
        maintainAspectRatio: false,
      }}
    />
  );
};

export const DoughnutExample = ({ data }) => {
  return (
    <Doughnut
      data={data}
      options={{
        plugins: {
          legend: { display: false },
          tooltip: tooltipDefaults,
        },
        rotation: 1,
        cutout: "40%",
        maintainAspectRatio: false,
      }}
    />
  );
};
