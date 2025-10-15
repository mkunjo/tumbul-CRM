// Client management business logic

const { queryWithTenant, transactionWithTenant } = require('../config/database');

class ClientService {
  /**
   * Get all clients for a tenant
   */
  async getClients(tenantId, { includeArchived = false, search = '', limit = 50, offset = 0 }) {
    let whereClause = 'WHERE tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (!includeArchived) {
      whereClause += ' AND is_archived = false';
    }

    if (search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const query = `
      SELECT 
        c.id,
        c.name,
        c.phone,
        c.email,
        c.address,
        c.notes,
        c.is_archived,
        c.created_at,
        c.updated_at,
        COUNT(DISTINCT p.id) as project_count,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') as active_projects,
        SUM(p.total_amount) as total_contract_value
      FROM clients c
      LEFT JOIN projects p ON c.id = p.client_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await queryWithTenant(tenantId, query, params);

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM clients ${whereClause}`;
    const countResult = await queryWithTenant(tenantId, countQuery, params.slice(0, -2));

    return {
      clients: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }

  /**
   * Get single client by ID
   */
  async getClientById(tenantId, clientId) {
    const query = `
      SELECT 
        c.*,
        COUNT(DISTINCT p.id) as project_count,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') as active_projects,
        SUM(p.total_amount) as total_contract_value,
        MAX(p.created_at) as last_project_date
      FROM clients c
      LEFT JOIN projects p ON c.id = p.client_id
      WHERE c.tenant_id = $1 AND c.id = $2
      GROUP BY c.id
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, clientId]);

    if (result.rows.length === 0) {
      throw new Error('Client not found');
    }

    return result.rows[0];
  }

  /**
   * Create new client
   */
  async createClient(tenantId, clientData) {
    const { name, phone, email, address, notes } = clientData;

    // Check for duplicate email if provided
    if (email) {
      const existingClient = await queryWithTenant(
        tenantId,
        'SELECT id FROM clients WHERE tenant_id = $1 AND email = $2',
        [tenantId, email]
      );

      if (existingClient.rows.length > 0) {
        throw new Error('A client with this email already exists');
      }
    }

    const query = `
      INSERT INTO clients (tenant_id, name, phone, email, address, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await queryWithTenant(
      tenantId,
      query,
      [tenantId, name, phone || null, email || null, address || null, notes || null]
    );

    return result.rows[0];
  }

  /**
   * Update client
   */
  async updateClient(tenantId, clientId, updates) {
    const allowedFields = ['name', 'phone', 'email', 'address', 'notes'];
    const updateFields = [];
    const values = [tenantId, clientId];
    let paramIndex = 3;

    // Build dynamic UPDATE clause
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Check for duplicate email if being updated
    if (updates.email) {
      const existingClient = await queryWithTenant(
        tenantId,
        'SELECT id FROM clients WHERE tenant_id = $1 AND email = $2 AND id != $3',
        [tenantId, updates.email, clientId]
      );

      if (existingClient.rows.length > 0) {
        throw new Error('Another client with this email already exists');
      }
    }

    const query = `
      UPDATE clients
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;

    const result = await queryWithTenant(tenantId, query, values);

    if (result.rows.length === 0) {
      throw new Error('Client not found');
    }

    return result.rows[0];
  }

  /**
   * Archive client (soft delete)
   */
  async archiveClient(tenantId, clientId) {
    const query = `
      UPDATE clients
      SET is_archived = true, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, clientId]);

    if (result.rows.length === 0) {
      throw new Error('Client not found');
    }

    return result.rows[0];
  }

  /**
   * Restore archived client
   */
  async restoreClient(tenantId, clientId) {
    const query = `
      UPDATE clients
      SET is_archived = false, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, clientId]);

    if (result.rows.length === 0) {
      throw new Error('Client not found');
    }

    return result.rows[0];
  }

  /**
   * Delete client (hard delete - only if no projects)
   */
  async deleteClient(tenantId, clientId) {
    // Check if client has projects
    const projectCheck = await queryWithTenant(
      tenantId,
      'SELECT COUNT(*) FROM projects WHERE client_id = $1',
      [clientId]
    );

    if (parseInt(projectCheck.rows[0].count) > 0) {
      throw new Error('Cannot delete client with existing projects. Archive instead.');
    }

    const query = 'DELETE FROM clients WHERE tenant_id = $1 AND id = $2 RETURNING id';
    const result = await queryWithTenant(tenantId, query, [tenantId, clientId]);

    if (result.rows.length === 0) {
      throw new Error('Client not found');
    }

    return { success: true, id: result.rows[0].id };
  }

  /**
   * Get client projects
   */
  async getClientProjects(tenantId, clientId, { status = null }) {
    let whereClause = 'WHERE p.tenant_id = $1 AND p.client_id = $2';
    const params = [tenantId, clientId];

    if (status) {
      whereClause += ' AND p.status = $3';
      params.push(status);
    }

    const query = `
      SELECT 
        p.*,
        COUNT(DISTINCT ph.id) as photo_count,
        COUNT(DISTINCT i.id) as invoice_count,
        SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END) as paid_amount
      FROM projects p
      LEFT JOIN photos ph ON p.id = ph.project_id
      LEFT JOIN invoices i ON p.id = i.project_id
      ${whereClause}
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    const result = await queryWithTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Get client statistics
   */
  async getClientStats(tenantId) {
    const query = `
      SELECT 
        COUNT(*) as total_clients,
        COUNT(*) FILTER (WHERE is_archived = false) as active_clients,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_this_month
      FROM clients
      WHERE tenant_id = $1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows[0];
  }
}

module.exports = new ClientService();