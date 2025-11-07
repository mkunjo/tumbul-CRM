// Dashboard analytics and overview business logic

const { queryWithTenant } = require('../config/database');

class DashboardService {
  /**
   * Get comprehensive dashboard overview
   */
  async getOverview(tenantId) {
    // Run all queries in parallel for performance
    const [
      clientStats,
      projectStats,
      invoiceStats,
      expenseStats,
      timeStats,
      financialSummary
    ] = await Promise.all([
      this.getClientStats(tenantId),
      this.getProjectStats(tenantId),
      this.getInvoiceStats(tenantId),
      this.getExpenseStats(tenantId),
      this.getTimeStats(tenantId),
      this.getFinancialSummary(tenantId)
    ]);

    // Return flat structure expected by frontend
    return {
      // Financial metrics
      total_revenue: parseFloat(financialSummary.total_revenue || 0),
      total_expenses: parseFloat(financialSummary.total_expenses || 0),
      net_profit: parseFloat(financialSummary.profit || 0),
      profit_margin: parseFloat(financialSummary.profit_margin || 0),

      // Project metrics
      active_projects: parseInt(projectStats.active_projects || 0),
      total_projects: parseInt(projectStats.total_projects || 0),
      completed_projects: parseInt(projectStats.completed_projects || 0),

      // Client metrics
      total_clients: parseInt(clientStats.total_clients || 0),
      active_clients: parseInt(clientStats.active_clients || 0),

      // Invoice metrics
      pending_invoices: parseInt(invoiceStats.sent_count || 0) + parseInt(invoiceStats.overdue_count || 0),
      pending_amount: parseFloat(invoiceStats.outstanding_amount || 0),
      paid_invoices: parseInt(invoiceStats.paid_count || 0),
      overdue_invoices: parseInt(invoiceStats.overdue_count || 0),

      // Detailed stats for internal use
      clients: clientStats,
      projects: projectStats,
      invoices: invoiceStats,
      expenses: expenseStats,
      time: timeStats
    };
  }

  /**
   * Get client statistics
   */
  async getClientStats(tenantId) {
    const query = `
      SELECT
        COUNT(*) as total_clients,
        COUNT(*) FILTER (WHERE is_archived = false) as active_clients,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_this_month,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_this_week
      FROM clients
      WHERE tenant_id = $1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows[0];
  }

  /**
   * Get project statistics
   */
  async getProjectStats(tenantId) {
    const query = `
      SELECT
        COUNT(*) as total_projects,
        COUNT(*) FILTER (WHERE status = 'active') as active_projects,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_projects,
        COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold_projects,
        COUNT(*) FILTER (WHERE status = 'canceled') as canceled_projects,
        COALESCE(SUM(total_amount), 0) as total_contract_value,
        COALESCE(AVG(total_amount), 0) as avg_project_value,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_this_month
      FROM projects
      WHERE tenant_id = $1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows[0];
  }

  /**
   * Get invoice statistics
   */
  async getInvoiceStats(tenantId) {
    const query = `
      SELECT
        COUNT(*) as total_invoices,
        COUNT(*) FILTER (WHERE i.status = 'draft') as draft_count,
        COUNT(*) FILTER (WHERE i.status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE i.status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE i.status = 'overdue') as overdue_count,
        COALESCE(SUM(i.amount), 0) as total_amount,
        COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as paid_amount,
        COALESCE(SUM(i.amount) FILTER (WHERE i.status IN ('sent', 'overdue')), 0) as outstanding_amount,
        COALESCE(AVG(i.amount), 0) as avg_invoice_amount
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      WHERE p.tenant_id = $1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows[0];
  }

  /**
   * Get expense statistics
   */
  async getExpenseStats(tenantId) {
    const query = `
      SELECT
        COUNT(*) as total_expenses,
        COUNT(*) FILTER (WHERE e.client_approved = true) as approved_count,
        COUNT(*) FILTER (WHERE e.client_approved = false) as pending_approval_count,
        COALESCE(SUM(e.amount), 0) as total_amount,
        COALESCE(SUM(e.amount) FILTER (WHERE e.client_approved = true), 0) as approved_amount,
        COALESCE(AVG(e.amount), 0) as avg_expense_amount
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      WHERE p.tenant_id = $1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows[0];
  }

  /**
   * Get time entry statistics
   */
  async getTimeStats(tenantId) {
    const query = `
      SELECT
        COUNT(*) as total_entries,
        COUNT(*) FILTER (WHERE te.end_time IS NULL) as running_timers,
        COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
        COALESCE(AVG(te.duration_minutes), 0) as avg_minutes,
        COUNT(*) FILTER (WHERE te.start_time > NOW() - INTERVAL '7 days') as entries_this_week
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      WHERE p.tenant_id = $1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);

    const stats = result.rows[0];

    // Add formatted hours
    const totalHours = Math.floor(parseFloat(stats.total_minutes) / 60);
    const avgHours = Math.floor(parseFloat(stats.avg_minutes) / 60);

    return {
      ...stats,
      total_hours: totalHours,
      avg_hours: avgHours
    };
  }

  /**
   * Get recent activity feed
   */
  async getRecentActivity(tenantId, { limit = 20, offset = 0 } = {}) {
    const query = `
      SELECT
        ra.activity_type as entity_type,
        ra.id,
        ra.project_id,
        ra.activity_time as created_at,
        ra.description,
        p.title as project_title,
        c.name as client_name
      FROM recent_activity ra
      JOIN projects p ON ra.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE ra.tenant_id = $1
      ORDER BY ra.activity_time DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, limit, offset]);

    // Return in format expected by frontend
    return {
      activities: result.rows.map(row => ({
        ...row,
        entity_type: row.entity_type,
        created_at: row.created_at,
        description: row.description || `New ${row.entity_type}`,
        client_name: row.client_name
      }))
    };
  }

  /**
   * Get revenue metrics
   */
  async getRevenueMetrics(tenantId, { period = '30' } = {}) {
    const query = `
      SELECT
        TO_CHAR(DATE(i.paid_at), 'YYYY-MM-DD') as date,
        COUNT(*) as invoice_count,
        COALESCE(SUM(i.amount), 0) as amount
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      WHERE p.tenant_id = $1
        AND i.status = 'paid'
        AND i.paid_at > NOW() - INTERVAL '${period} days'
      GROUP BY DATE(i.paid_at)
      ORDER BY date ASC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);

    // Calculate totals
    const totalRevenue = result.rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);
    const totalInvoices = result.rows.reduce((sum, row) => sum + parseInt(row.invoice_count), 0);

    // Return in format expected by frontend
    return {
      revenue: result.rows.map(row => ({
        date: row.date,
        amount: parseFloat(row.amount)
      })),
      totals: {
        revenue: totalRevenue,
        invoices: totalInvoices,
        avgPerDay: result.rows.length > 0 ? totalRevenue / result.rows.length : 0
      }
    };
  }

  /**
   * Get expense trends
   */
  async getExpenseTrends(tenantId, { period = '30' } = {}) {
    const query = `
      SELECT
        DATE(e.date) as date,
        COUNT(*) as expense_count,
        COALESCE(SUM(e.amount), 0) as total_amount
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      WHERE p.tenant_id = $1
        AND e.date > NOW() - INTERVAL '${period} days'
      GROUP BY DATE(e.date)
      ORDER BY date DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);

    // Calculate totals
    const totalExpenses = result.rows.reduce((sum, row) => sum + parseFloat(row.total_amount), 0);
    const totalCount = result.rows.reduce((sum, row) => sum + parseInt(row.expense_count), 0);

    return {
      daily: result.rows,
      totals: {
        expenses: totalExpenses,
        count: totalCount,
        avgPerDay: result.rows.length > 0 ? totalExpenses / result.rows.length : 0
      }
    };
  }

  /**
   * Get top projects by revenue
   */
  async getTopProjects(tenantId, { limit = 5 } = {}) {
    const query = `
      SELECT
        p.id,
        p.title as project_name,
        p.status,
        c.name as client_name,
        p.total_amount as contract_value,
        COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as total_revenue,
        COALESCE(SUM(e.amount), 0) as expenses,
        COALESCE(SUM(te.duration_minutes), 0) as total_minutes
      FROM projects p
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN invoices i ON p.id = i.project_id
      LEFT JOIN expenses e ON p.id = e.project_id
      LEFT JOIN time_entries te ON p.id = te.project_id
      WHERE p.tenant_id = $1
      GROUP BY p.id, p.title, c.name, p.status, p.total_amount
      ORDER BY total_revenue DESC
      LIMIT $2
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, limit]);

    // Add profit calculation and convert to numbers
    return result.rows.map(project => ({
      ...project,
      total_revenue: parseFloat(project.total_revenue || 0),
      expenses: parseFloat(project.expenses || 0),
      profit: parseFloat(project.total_revenue || 0) - parseFloat(project.expenses || 0),
      hours: Math.floor(parseFloat(project.total_minutes || 0) / 60)
    }));
  }

  /**
   * Get active projects summary
   */
  async getActiveProjects(tenantId) {
    const query = `
      SELECT
        p.id,
        p.title,
        p.status,
        p.start_date,
        p.estimated_completion,
        c.name as client_name,
        COUNT(DISTINCT te.id) FILTER (WHERE te.end_time IS NULL) as running_timers,
        COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'overdue') as overdue_invoices
      FROM projects p
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN time_entries te ON p.id = te.project_id
      LEFT JOIN invoices i ON p.id = i.project_id
      WHERE p.tenant_id = $1
        AND p.status = 'active'
      GROUP BY p.id, c.name
      ORDER BY p.created_at DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows;
  }

  /**
   * Get upcoming deadlines
   */
  async getUpcomingDeadlines(tenantId, { days = 14 } = {}) {
    const query = `
      SELECT
        'project' as type,
        p.id,
        p.title as name,
        p.estimated_completion as deadline,
        c.name as client_name,
        EXTRACT(DAY FROM (p.estimated_completion - CURRENT_DATE)) as days_until
      FROM projects p
      JOIN clients c ON p.client_id = c.id
      WHERE p.tenant_id = $1
        AND p.status = 'active'
        AND p.estimated_completion IS NOT NULL
        AND p.estimated_completion BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${days} days'

      UNION ALL

      SELECT
        'invoice' as type,
        i.id,
        i.invoice_number as name,
        i.due_date as deadline,
        c.name as client_name,
        EXTRACT(DAY FROM (i.due_date - CURRENT_DATE)) as days_until
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE p.tenant_id = $1
        AND i.status IN ('sent', 'overdue')
        AND i.due_date IS NOT NULL
        AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${days} days'

      ORDER BY deadline ASC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows;
  }

  /**
   * Get financial summary
   */
  async getFinancialSummary(tenantId) {
    const query = `
      SELECT
        COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as total_revenue,
        COALESCE(SUM(i.amount) FILTER (WHERE i.status IN ('sent', 'overdue')), 0) as outstanding_revenue,
        COALESCE(SUM(e.amount), 0) as total_expenses,
        COALESCE(SUM(e.amount) FILTER (WHERE e.client_approved = false), 0) as pending_expenses
      FROM projects p
      LEFT JOIN invoices i ON p.id = i.project_id
      LEFT JOIN expenses e ON p.id = e.project_id
      WHERE p.tenant_id = $1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);

    const summary = result.rows[0];
    const revenue = parseFloat(summary.total_revenue);
    const expenses = parseFloat(summary.total_expenses);

    return {
      ...summary,
      profit: revenue - expenses,
      profit_margin: revenue > 0 ? ((revenue - expenses) / revenue * 100).toFixed(2) : 0
    };
  }
}

module.exports = new DashboardService();
