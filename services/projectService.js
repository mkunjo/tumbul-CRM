// Project management business logic

const { queryWithTenant, transactionWithTenant } = require('../config/database');

class ProjectService {
  // Get all projects for a specific tenant; w/ filtering & pagination
  async getProjects(tenantId, { status, clientId, search, limit = 50, offset = 0 }) {
    let whereClause = 'WHERE p.tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (clientId) {
      whereClause += ` AND p.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (p.title ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const query = `
      SELECT 
        p.*,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        COUNT(DISTINCT ph.id) as photo_count,
        COUNT(DISTINCT i.id) as invoice_count,
        COUNT(DISTINCT e.id) as expense_count,
        SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END) as paid_amount,
        SUM(e.amount) as total_expenses,
        SUM(te.duration_minutes) as total_time_minutes
      FROM projects p
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN photos ph ON p.id = ph.project_id
      LEFT JOIN invoices i ON p.id = i.project_id
      LEFT JOIN expenses e ON p.id = e.project_id
      LEFT JOIN time_entries te ON p.id = te.project_id
      ${whereClause}
      GROUP BY p.id, c.name, c.phone, c.email
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await queryWithTenant(tenantId, query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM projects p
      JOIN clients c ON p.client_id = c.id
      ${whereClause}
    `;
    const countResult = await queryWithTenant(tenantId, countQuery, params.slice(0, -2));

    return {
      projects: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }

   // Get single project by ID with full details
  async getProjectById(tenantId, projectId) {
    const query = `
      SELECT 
        p.*,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        c.address as client_address,
        COUNT(DISTINCT ph.id) as photo_count,
        COUNT(DISTINCT i.id) as invoice_count,
        COUNT(DISTINCT e.id) as expense_count,
        SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END) as paid_amount,
        SUM(e.amount) as total_expenses,
        SUM(te.duration_minutes) as total_time_minutes
      FROM projects p
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN photos ph ON p.id = ph.project_id
      LEFT JOIN invoices i ON p.id = i.project_id
      LEFT JOIN expenses e ON p.id = e.project_id
      LEFT JOIN time_entries te ON p.id = te.project_id
      WHERE p.tenant_id = $1 AND p.id = $2
      GROUP BY p.id, c.name, c.phone, c.email, c.address
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, projectId]);

    if (result.rows.length === 0) {
      throw new Error('Project not found');
    }

    return result.rows[0];
  }

  // Create new project
  async createProject(tenantId, projectData) {
    const { clientId, title, description, status, startDate, estimatedCompletion, totalAmount } = projectData;

    // Verify client exists and belongs to tenant
    const clientCheck = await queryWithTenant(
      tenantId,
      'SELECT id FROM clients WHERE tenant_id = $1 AND id = $2',
      [tenantId, clientId]
    );

    if (clientCheck.rows.length === 0) {
      throw new Error('Client not found');
    }

    const query = `
      INSERT INTO projects (tenant_id, client_id, title, description, status, start_date, estimated_completion, total_amount)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await queryWithTenant(
      tenantId,
      query,
      [
        tenantId,
        clientId,
        title,
        description || null,
        status || 'active',
        startDate || null,
        estimatedCompletion || null,
        totalAmount || null
      ]
    );

    return result.rows[0];
  }

  // Update project allowed fields; Project not found error
  async updateProject(tenantId, projectId, updates) {
    const allowedFields = ['title', 'description', 'status', 'start_date', 'estimated_completion', 'actual_completion', 'total_amount'];
    const updateFields = [];
    const values = [tenantId, projectId];
    let paramIndex = 3;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // If status is being changed to completed, set actual_completion
    if (updates.status === 'completed' && !updates.actual_completion) {
      updateFields.push(`actual_completion = NOW()`);
    }

    const query = `
      UPDATE projects
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;

    const result = await queryWithTenant(tenantId, query, values);

    if (result.rows.length === 0) {
      throw new Error('Project not found');
    }

    return result.rows[0];
  }

   // Delete project
  async deleteProject(tenantId, projectId) {
    // This will cascade delete related photos, invoices, expenses, time entries
    const query = 'DELETE FROM projects WHERE tenant_id = $1 AND id = $2 RETURNING id';
    const result = await queryWithTenant(tenantId, query, [tenantId, projectId]);

    if (result.rows.length === 0) {
      throw new Error('Project not found');
    }

    return { success: true, id: result.rows[0].id };
  }

  // Get project timeline/activity
  async getProjectTimeline(tenantId, projectId, { limit = 50 }) {
    const query = `
      SELECT 
        'photo' as type,
        ph.id,
        ph.uploaded_at as timestamp,
        'Photo uploaded' as description,
        ph.caption as details
      FROM photos ph
      JOIN projects p ON ph.project_id = p.id
      WHERE p.tenant_id = $1 AND p.id = $2
      
      UNION ALL
      
      SELECT 
        'invoice' as type,
        i.id,
        i.created_at as timestamp,
        CONCAT('Invoice ', i.invoice_number, ' - ', i.status) as description,
        CONCAT(', i.amount::text) as details
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      WHERE p.tenant_id = $1 AND p.id = $2
      
      UNION ALL
      
      SELECT 
        'expense' as type,
        e.id,
        e.created_at as timestamp,
        CONCAT('Expense: ', e.description) as description,
        CONCAT(', e.amount::text) as details
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      WHERE p.tenant_id = $1 AND p.id = $2
      
      UNION ALL
      
      SELECT 
        'time_entry' as type,
        te.id,
        te.start_time as timestamp,
        'Time logged' as description,
        CONCAT(te.duration_minutes::text, ' minutes') as details
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      WHERE p.tenant_id = $1 AND p.id = $2
      
      ORDER BY timestamp DESC
      LIMIT $3
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, projectId, limit]);
    return result.rows;
  }

  // Get project statistics
  async getProjectStats(tenantId) {
    const query = `
      SELECT 
        COUNT(*) as total_projects,
        COUNT(*) FILTER (WHERE status = 'active') as active_projects,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_projects,
        COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold_projects,
        SUM(total_amount) as total_contract_value,
        AVG(total_amount) as avg_project_value
      FROM projects
      WHERE tenant_id = $1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows[0];
  }

  // Get projects by status summary
  async getStatusSummary(tenantId) {
    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        SUM(total_amount) as total_value
      FROM projects
      WHERE tenant_id = $1
      GROUP BY status
      ORDER BY count DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows;
  }
}

module.exports = new ProjectService();