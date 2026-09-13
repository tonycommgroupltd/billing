import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import { Card } from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle } from "../../../components/Component";
import LogsAPI from '../../../helpers/LogsAPI';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const ActivityLogsDashboard = () => {
  const [stats, setStats] = useState({
    daily_stats: [],
    overall_stats: [],
    top_users: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const response = await LogsAPI.getStats();
      setStats(response.data || {});
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Prepare chart data for daily activity
  const dailyChartData = () => {
    if (!stats.daily_stats?.length) return { labels: [], datasets: [] };

    // Group by date and activity type
    const dateGroups = {};
    stats.daily_stats.forEach(stat => {
      const date = stat.date;
      if (!dateGroups[date]) {
        dateGroups[date] = {};
      }
      dateGroups[date][stat.activity_type] = stat.count;
    });

    const dates = Object.keys(dateGroups).slice(-14); // Last 14 days
    const activityTypes = [...new Set(stats.daily_stats.map(s => s.activity_type))];
    
    const colors = ['#28a745', '#007bff', '#ffc107', '#dc3545', '#6f42c1', '#20c997', '#fd7e14'];
    
    const datasets = activityTypes.map((type, index) => ({
      label: type.charAt(0).toUpperCase() + type.slice(1),
      data: dates.map(date => dateGroups[date][type] || 0),
      backgroundColor: colors[index % colors.length],
      borderColor: colors[index % colors.length],
      tension: 0.1
    }));

    return {
      labels: dates.map(date => new Date(date).toLocaleDateString()),
      datasets
    };
  };

  // Prepare chart data for activity types distribution
  const activityTypeChartData = () => {
    if (!stats.overall_stats?.length) return { labels: [], datasets: [] };

    const colors = ['#28a745', '#007bff', '#ffc107', '#dc3545', '#6f42c1', '#20c997', '#fd7e14'];
    
    return {
      labels: stats.overall_stats.map(stat => stat.activity_type.charAt(0).toUpperCase() + stat.activity_type.slice(1)),
      datasets: [{
        data: stats.overall_stats.map(stat => stat.total_count),
        backgroundColor: colors,
        borderWidth: 2
      }]
    };
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right',
      }
    }
  };

  if (loading) {
    return (
      <React.Fragment>
        <Head title="Activity Dashboard" />
        <Content>
          <div className="d-flex justify-content-center align-items-center" style={{height: '400px'}}>
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        </Content>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <Head title="Activity Dashboard" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle tag="h3" page>
              Activity Dashboard
            </BlockTitle>
            <div className="nk-block-des text-soft">
              <p>Overview of system activity and user engagement.</p>
            </div>
          </BlockHeadContent>
        </BlockHead>

        {/* Summary Cards */}
        <Block>
          <div className="row">
            <div className="col-md-3">
              <Card className="card-bordered">
                <div className="card-inner text-center">
                  <div className="nk-cw-number text-primary">
                    {stats.overall_stats?.reduce((sum, stat) => sum + parseInt(stat.total_count), 0) || 0}
                  </div>
                  <div className="nk-cw-label">Total Activities</div>
                </div>
              </Card>
            </div>
            <div className="col-md-3">
              <Card className="card-bordered">
                <div className="card-inner text-center">
                  <div className="nk-cw-number text-success">
                    {stats.overall_stats?.length || 0}
                  </div>
                  <div className="nk-cw-label">Activity Types</div>
                </div>
              </Card>
            </div>
            <div className="col-md-3">
              <Card className="card-bordered">
                <div className="card-inner text-center">
                  <div className="nk-cw-number text-warning">
                    {stats.top_users?.length || 0}
                  </div>
                  <div className="nk-cw-label">Active Users (30d)</div>
                </div>
              </Card>
            </div>
            <div className="col-md-3">
              <Card className="card-bordered">
                <div className="card-inner text-center">
                  <div className="nk-cw-number text-info">
                    {stats.daily_stats?.filter(s => {
                      const statDate = new Date(s.date);
                      const today = new Date();
                      return statDate.toDateString() === today.toDateString();
                    }).reduce((sum, stat) => sum + parseInt(stat.count), 0) || 0}
                  </div>
                  <div className="nk-cw-label">Today's Activities</div>
                </div>
              </Card>
            </div>
          </div>
        </Block>

        {/* Charts */}
        <Block>
          <div className="row">
            <div className="col-lg-8">
              <Card className="card-bordered card-preview">
                <div className="card-inner">
                  <BlockTitle tag="h6">Daily Activity Trend (Last 14 Days)</BlockTitle>
                  <div style={{height: '400px'}}>
                    <Line data={dailyChartData()} options={chartOptions} />
                  </div>
                </div>
              </Card>
            </div>
            <div className="col-lg-4">
              <Card className="card-bordered card-preview">
                <div className="card-inner">
                  <BlockTitle tag="h6">Activity Distribution</BlockTitle>
                  <div style={{height: '400px'}}>
                    <Doughnut data={activityTypeChartData()} options={doughnutOptions} />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </Block>

        {/* Top Users and Activity Types */}
        <Block>
          <div className="row">
            <div className="col-lg-6">
              <Card className="card-bordered">
                <div className="card-inner">
                  <BlockTitle tag="h6">Most Active Users (Last 30 Days)</BlockTitle>
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Email</th>
                          <th className="text-end">Activities</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.top_users?.slice(0, 10).map((user, index) => (
                          <tr key={index}>
                            <td><strong>{user.user_name}</strong></td>
                            <td>{user.user_email}</td>
                            <td className="text-end">
                              <span className="badge bg-primary">{user.activity_count}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            </div>
            <div className="col-lg-6">
              <Card className="card-bordered">
                <div className="card-inner">
                  <BlockTitle tag="h6">Activity Types Summary</BlockTitle>
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Activity Type</th>
                          <th className="text-end">Total Count</th>
                          <th className="text-end">Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.overall_stats?.map((stat, index) => {
                          const total = stats.overall_stats.reduce((sum, s) => sum + parseInt(s.total_count), 0);
                          const percentage = total > 0 ? ((stat.total_count / total) * 100).toFixed(1) : 0;
                          return (
                            <tr key={index}>
                              <td>
                                <span className="text-capitalize">{stat.activity_type}</span>
                              </td>
                              <td className="text-end">
                                <span className="badge bg-secondary">{stat.total_count}</span>
                              </td>
                              <td className="text-end">{percentage}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </Block>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(ActivityLogsDashboard);