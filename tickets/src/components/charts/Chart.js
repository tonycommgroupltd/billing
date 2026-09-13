import React from "react";
import { Line, Bar, Pie, Doughnut } from "react-chartjs-2";

// Shared tooltip configuration for Chart.js v3
const tooltipOptions = {
  enabled: true,
  backgroundColor: "#eff6ff",
  titleFont: { size: 13 },
  titleColor: "#6783b8",
  bodyColor: "#9eaecf",
  bodyFont: { size: 12 },
  bodySpacing: 4,
  padding: 10,
  displayColors: false,
};

export const LineChartExample = ({ data, legend }) => {
  return (
    <Line
      className="line-chart"
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: legend,
            labels: {
              boxWidth: 12,
              padding: 20,
              color: "#6783b8",
            },
          },
          tooltip: tooltipOptions,
        },
        scales: {
          y: {
            display: true,
            ticks: {
              beginAtZero: false,
              font: { size: 12 },
              padding: 10,
              color: "#9eaecf",
            },
            grid: {
              tickLength: 0,
            },
          },
          x: {
            display: true,
            ticks: {
              font: { size: 12 },
              source: "auto",
              padding: 5,
              color: "#9eaecf",
            },
            grid: {
              color: "transparent",
              tickLength: 10,
              offset: true,
            },
          },
        },
      }}
    />
  );
};

export const BarChartExample = ({ data, stacked, className }) => {
  return (
    <Bar
      className={className}
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
            labels: {
              boxWidth: 30,
              padding: 20,
              color: "#6783b8",
            },
          },
          tooltip: tooltipOptions,
        },
        scales: {
          y: {
            display: true,
            stacked: !!stacked,
            ticks: {
              beginAtZero: true,
              font: { size: 12 },
              padding: 5,
              color: "#9eaecf",
            },
            grid: {
              tickLength: 0,
            },
          },
          x: {
            display: true,
            stacked: !!stacked,
            ticks: {
              font: { size: 12 },
              source: "auto",
              padding: 5,
              color: "#9eaecf",
            },
            grid: {
              color: "transparent",
              tickLength: 10,
              offset: true,
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
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: tooltipOptions,
        },
        rotation: -0.2,
      }}
    />
  );
};

export const DoughnutExample = ({ data }) => {
  return (
    <Doughnut
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: tooltipOptions,
        },
        rotation: 1,
        cutout: 40,
      }}
    />
  );
};
