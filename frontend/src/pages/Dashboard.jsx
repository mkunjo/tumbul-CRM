import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import {
  useDashboardMetrics,
  useDashboardRevenue,
  useDashboardTopProjects,
  useDashboardRecentActivity,
} from '../hooks/useDashboard';
import './Dashboard.css';

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState('30');

  // Use SWR hooks for all data fetching - automatic caching and deduplication
  const { metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { revenue, isLoading: revenueLoading } = useDashboardRevenue(parseInt(timeRange));
  const { topProjects, isLoading: projectsLoading } = useDashboardTopProjects(5);
  const { recentActivity, isLoading: activityLoading } = useDashboardRecentActivity(10);

  // Combined loading state
  const loading = metricsLoading || revenueLoading || projectsLoading || activityLoading;

  // Memoize formatCurrency to prevent recreating on every render
  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  }, []);

  // Memoize helper functions
  const getActivityIcon = useCallback((type) => {
    const icons = {
      client: '👤',
      project: '📁',
      invoice: '💰',
      expense: '💳',
      time_entry: '⏱️',
      payment: '💵',
    };
    return icons[type] || '📌';
  }, []);

  const getActivityColor = useCallback((type) => {
    const colors = {
      client: 'primary',
      project: 'success',
      invoice: 'warning',
      expense: 'danger',
      time_entry: 'secondary',
      payment: 'success',
    };
    return colors[type] || 'secondary';
  }, []);

  // Memoize chart data to prevent unnecessary recalculations
  const revenueData = useMemo(() => revenue || [], [revenue]);
  const projectsData = useMemo(() => topProjects || [], [topProjects]);
  const activityData = useMemo(() => recentActivity || [], [recentActivity]);

  if (loading && !metrics) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="dashboard-actions">
          <select
            className="form-select"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon revenue">💰</div>
          <div className="metric-content">
            <div className="metric-label">Total Revenue</div>
            <div className="metric-value">{formatCurrency(metrics?.total_revenue)}</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon expenses">💳</div>
          <div className="metric-content">
            <div className="metric-label">Total Expenses</div>
            <div className="metric-value">{formatCurrency(metrics?.total_expenses)}</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon profit">📈</div>
          <div className="metric-content">
            <div className="metric-label">Net Profit</div>
            <div className="metric-value">{formatCurrency(metrics?.net_profit)}</div>
            <div className="metric-trend">
              {metrics?.profit_margin ? `${metrics.profit_margin}% margin` : ''}
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon projects">📁</div>
          <div className="metric-content">
            <div className="metric-label">Active Projects</div>
            <div className="metric-value">{metrics?.active_projects || 0}</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon clients">👥</div>
          <div className="metric-content">
            <div className="metric-label">Total Clients</div>
            <div className="metric-value">{metrics?.total_clients || 0}</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon invoices">📄</div>
          <div className="metric-content">
            <div className="metric-label">Pending Invoices</div>
            <div className="metric-value">{metrics?.pending_invoices || 0}</div>
            <div className="metric-trend">{formatCurrency(metrics?.pending_amount)}</div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card chart-card">
          <div className="card-header">
            <h3>Revenue Trend</h3>
          </div>
          <div className="card-body">
            {revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} name="Revenue" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">No revenue data available</div>
            )}
          </div>
        </div>

        <div className="card chart-card">
          <div className="card-header">
            <h3>Top Projects by Revenue</h3>
          </div>
          <div className="card-body">
            {projectsData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={projectsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="project_name" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="total_revenue" fill="#10b981" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">No project data available</div>
            )}
          </div>
        </div>
      </div>

      <div className="activity-section">
        <div className="card">
          <div className="card-header">
            <h3>Recent Activity</h3>
            <Link to="/dashboard/activity" className="btn btn-sm btn-outline">
              View all
            </Link>
          </div>
          <div className="card-body">
            {activityData.length > 0 ? (
              <div className="activity-list">
                {activityData.map((activity, index) => (
                  <div key={index} className="activity-item">
                    <div className={`activity-icon ${getActivityColor(activity.entity_type)}`}>
                      {getActivityIcon(activity.entity_type)}
                    </div>
                    <div className="activity-content">
                      <div className="activity-text">{activity.description}</div>
                      <div className="activity-meta">
                        {activity.client_name && (
                          <span className="activity-client">{activity.client_name}</span>
                        )}
                        <span className="activity-time">
                          {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No recent activity</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
