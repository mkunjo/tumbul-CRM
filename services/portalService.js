// Client portal service - Read-only access for clients

const { queryWithTenant } = require('../config/database');
const crypto = require('crypto');

class PortalService {
  /**
   * Generate secure portal access token for a client
   */
  generatePortalToken(clientId, tenantId) {
    const payload = `${clientId}:${tenantId}:${Date.now()}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Verify client has access to a project
   */
  async verifyClientAccess(tenantId, clientId, projectId) {
    const query = `
      SELECT p.id
      FROM projects p
      WHERE p.tenant_id = $1
        AND p.client_id = $2
        AND p.id = $3
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, clientId, projectId]);
    return result.rows.length > 0;
  }

  /**
   * Get client information
   */
  async getClientInfo(tenantId, clientId) {
    const query = `
      SELECT
        id,
        name,
        email,
        phone,
        address
      FROM clients
      WHERE tenant_id = $1 AND id = $2 AND is_archived = false
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, clientId]);

    if (result.rows.length === 0) {
      throw new Error('Client not found');
    }

    return result.rows[0];
  }

  /**
   * Get all projects for a client (portal view)
   */
  async getClientProjects(tenantId, clientId) {
    const query = `
      SELECT
        p.id,
        p.title,
        p.description,
        p.status,
        p.start_date,
        p.estimated_completion,
        p.actual_completion,
        p.total_amount,
        p.created_at,
        p.updated_at,
        COUNT(DISTINCT ph.id) as photo_count,
        COUNT(DISTINCT i.id) as invoice_count,
        COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'paid') as paid_invoice_count,
        COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as total_paid,
        COALESCE(SUM(i.amount) FILTER (WHERE i.status IN ('sent', 'overdue')), 0) as amount_due
      FROM projects p
      LEFT JOIN photos ph ON p.id = ph.project_id AND ph.auto_shared = true
      LEFT JOIN invoices i ON p.id = i.project_id
      WHERE p.tenant_id = $1 AND p.client_id = $2
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, clientId]);
    return result.rows;
  }

  /**
   * Get single project details for client
   */
  async getProjectDetails(tenantId, clientId, projectId) {
    // Verify access
    const hasAccess = await this.verifyClientAccess(tenantId, clientId, projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const query = `
      SELECT
        p.id,
        p.title,
        p.description,
        p.status,
        p.start_date,
        p.estimated_completion,
        p.actual_completion,
        p.total_amount,
        p.created_at,
        p.updated_at
      FROM projects p
      WHERE p.tenant_id = $1 AND p.id = $2
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, projectId]);

    if (result.rows.length === 0) {
      throw new Error('Project not found');
    }

    return result.rows[0];
  }

  /**
   * Get project photos (only auto_shared ones)
   */
  async getProjectPhotos(tenantId, clientId, projectId) {
    // Verify access
    const hasAccess = await this.verifyClientAccess(tenantId, clientId, projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const query = `
      SELECT
        ph.id,
        ph.filename,
        ph.s3_url,
        ph.caption,
        ph.uploaded_at
      FROM photos ph
      JOIN projects p ON ph.project_id = p.id
      WHERE p.tenant_id = $1
        AND ph.project_id = $2
        AND ph.auto_shared = true
      ORDER BY ph.uploaded_at DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, projectId]);
    return result.rows;
  }

  /**
   * Get project invoices (client view - limited info)
   */
  async getProjectInvoices(tenantId, clientId, projectId) {
    // Verify access
    const hasAccess = await this.verifyClientAccess(tenantId, clientId, projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const query = `
      SELECT
        i.id,
        i.invoice_number,
        i.amount,
        i.status,
        i.due_date,
        i.paid_at,
        i.created_at
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      WHERE p.tenant_id = $1
        AND i.project_id = $2
        AND i.status != 'draft'
      ORDER BY i.created_at DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, projectId]);
    return result.rows;
  }

  /**
   * Get project expenses (if client approved)
   */
  async getProjectExpenses(tenantId, clientId, projectId) {
    // Verify access
    const hasAccess = await this.verifyClientAccess(tenantId, clientId, projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const query = `
      SELECT
        e.id,
        e.description,
        e.amount,
        e.category,
        e.date,
        e.receipt_photo_url,
        e.client_approved,
        e.notes
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      WHERE p.tenant_id = $1 AND e.project_id = $2
      ORDER BY e.date DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, projectId]);
    return result.rows;
  }

  /**
   * Get project activity timeline
   */
  async getProjectTimeline(tenantId, clientId, projectId, { limit = 50 } = {}) {
    // Verify access
    const hasAccess = await this.verifyClientAccess(tenantId, clientId, projectId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    const query = `
      SELECT * FROM (
        SELECT
          'photo' as type,
          ph.id,
          ph.uploaded_at as timestamp,
          'Photo uploaded' as description,
          ph.caption as details
        FROM photos ph
        WHERE ph.project_id = $1 AND ph.auto_shared = true

        UNION ALL

        SELECT
          'invoice' as type,
          i.id,
          i.created_at as timestamp,
          'Invoice ' || i.status as description,
          i.invoice_number || ' - $' || i.amount as details
        FROM invoices i
        WHERE i.project_id = $1 AND i.status != 'draft'

        UNION ALL

        SELECT
          'expense' as type,
          e.id,
          e.created_at as timestamp,
          'Expense ' || CASE WHEN e.client_approved THEN 'approved' ELSE 'pending' END as description,
          e.description || ' - $' || e.amount as details
        FROM expenses e
        WHERE e.project_id = $1
      ) timeline
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const result = await queryWithTenant(tenantId, query, [projectId, limit]);
    return result.rows;
  }

  /**
   * Get client statistics summary
   */
  async getClientSummary(tenantId, clientId) {
    const query = `
      SELECT
        COUNT(DISTINCT p.id) as total_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') as active_projects,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'completed') as completed_projects,
        COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as total_paid,
        COALESCE(SUM(i.amount) FILTER (WHERE i.status IN ('sent', 'overdue')), 0) as amount_due,
        COUNT(DISTINCT ph.id) as total_photos
      FROM projects p
      LEFT JOIN invoices i ON p.id = i.project_id
      LEFT JOIN photos ph ON p.id = ph.project_id AND ph.auto_shared = true
      WHERE p.tenant_id = $1 AND p.client_id = $2
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, clientId]);
    return result.rows[0];
  }

  /**
   * Approve an expense (client action)
   */
  async approveExpense(tenantId, clientId, expenseId) {
    // First verify the expense belongs to one of the client's projects
    const verifyQuery = `
      SELECT e.id
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      WHERE p.tenant_id = $1
        AND p.client_id = $2
        AND e.id = $3
        AND e.client_approved = false
    `;

    const verifyResult = await queryWithTenant(tenantId, verifyQuery, [tenantId, clientId, expenseId]);

    if (verifyResult.rows.length === 0) {
      throw new Error('Expense not found or already approved');
    }

    // Approve the expense
    const updateQuery = `
      UPDATE expenses e
      SET client_approved = true
      FROM projects p
      WHERE e.project_id = p.id
        AND p.tenant_id = $1
        AND p.client_id = $2
        AND e.id = $3
      RETURNING e.*
    `;

    const result = await queryWithTenant(tenantId, updateQuery, [tenantId, clientId, expenseId]);
    return result.rows[0];
  }
}

module.exports = new PortalService();
