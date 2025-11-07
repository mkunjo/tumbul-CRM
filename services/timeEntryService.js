// Time entry management business logic

const { queryWithTenant } = require('../config/database');

class TimeEntryService {
  /**
   * Get all time entries for a tenant
   */
  async getTimeEntries(tenantId, { projectId = null, startDate = null, endDate = null, isRunning = null, limit = 50, offset = 0 }) {
    let whereClause = 'WHERE p.tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (projectId) {
      whereClause += ` AND te.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND te.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND te.start_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (isRunning !== null) {
      if (isRunning) {
        whereClause += ` AND te.end_time IS NULL`;
      } else {
        whereClause += ` AND te.end_time IS NOT NULL`;
      }
    }

    const query = `
      SELECT
        te.id,
        te.start_time,
        te.end_time,
        te.duration_minutes,
        te.description,
        te.created_at,
        te.synced_at,
        p.id as project_id,
        p.title as project_title,
        c.id as client_id,
        c.name as client_name
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      ${whereClause}
      ORDER BY te.start_time DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await queryWithTenant(tenantId, query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      ${whereClause}
    `;
    const countResult = await queryWithTenant(tenantId, countQuery, params.slice(0, -2));

    return {
      timeEntries: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }

  /**
   * Get single time entry by ID
   */
  async getTimeEntryById(tenantId, timeEntryId) {
    const query = `
      SELECT
        te.*,
        p.id as project_id,
        p.title as project_title,
        c.id as client_id,
        c.name as client_name
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE p.tenant_id = $1 AND te.id = $2
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, timeEntryId]);

    if (result.rows.length === 0) {
      throw new Error('Time entry not found');
    }

    return result.rows[0];
  }

  /**
   * Start a new timer
   */
  async startTimer(tenantId, timerData) {
    const { projectId, description } = timerData;

    // Verify project exists and belongs to tenant
    const projectCheck = await queryWithTenant(
      tenantId,
      'SELECT id FROM projects WHERE tenant_id = $1 AND id = $2',
      [tenantId, projectId]
    );

    if (projectCheck.rows.length === 0) {
      throw new Error('Project not found');
    }

    // Check if there's already a running timer for this tenant
    const runningTimer = await this.getRunningTimer(tenantId);
    if (runningTimer) {
      throw new Error('A timer is already running. Stop it before starting a new one.');
    }

    const query = `
      INSERT INTO time_entries (project_id, start_time, description)
      VALUES ($1, NOW(), $2)
      RETURNING *
    `;

    const result = await queryWithTenant(
      tenantId,
      query,
      [projectId, description || null]
    );

    return result.rows[0];
  }

  /**
   * Stop a running timer
   */
  async stopTimer(tenantId, timeEntryId) {
    const query = `
      UPDATE time_entries te
      SET end_time = NOW()
      FROM projects p
      WHERE te.project_id = p.id
        AND p.tenant_id = $1
        AND te.id = $2
        AND te.end_time IS NULL
      RETURNING te.*
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, timeEntryId]);

    if (result.rows.length === 0) {
      throw new Error('Time entry not found or already stopped');
    }

    return result.rows[0];
  }

  /**
   * Get currently running timer for a tenant
   */
  async getRunningTimer(tenantId) {
    const query = `
      SELECT
        te.*,
        p.id as project_id,
        p.title as project_title,
        c.id as client_id,
        c.name as client_name
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE p.tenant_id = $1
        AND te.end_time IS NULL
      ORDER BY te.start_time DESC
      LIMIT 1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);

    return result.rows[0] || null;
  }

  /**
   * Create a manual time entry (with start and end time)
   */
  async createManualEntry(tenantId, entryData) {
    const { projectId, startTime, endTime, description } = entryData;

    // Verify project exists and belongs to tenant
    const projectCheck = await queryWithTenant(
      tenantId,
      'SELECT id FROM projects WHERE tenant_id = $1 AND id = $2',
      [tenantId, projectId]
    );

    if (projectCheck.rows.length === 0) {
      throw new Error('Project not found');
    }

    // Validate times
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
      throw new Error('End time must be after start time');
    }

    const query = `
      INSERT INTO time_entries (project_id, start_time, end_time, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await queryWithTenant(
      tenantId,
      query,
      [projectId, startTime, endTime, description || null]
    );

    return result.rows[0];
  }

  /**
   * Update time entry
   */
  async updateTimeEntry(tenantId, timeEntryId, updates) {
    const allowedFields = ['start_time', 'end_time', 'description'];
    const updateFields = [];
    const values = [tenantId, timeEntryId];
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

    // Verify time entry exists and belongs to tenant
    const timeEntryCheck = await queryWithTenant(
      tenantId,
      `SELECT te.id FROM time_entries te
       JOIN projects p ON te.project_id = p.id
       WHERE p.tenant_id = $1 AND te.id = $2`,
      [tenantId, timeEntryId]
    );

    if (timeEntryCheck.rows.length === 0) {
      throw new Error('Time entry not found');
    }

    // Validate times if both are being set
    if (updates.start_time && updates.end_time) {
      const start = new Date(updates.start_time);
      const end = new Date(updates.end_time);

      if (end <= start) {
        throw new Error('End time must be after start time');
      }
    }

    const query = `
      UPDATE time_entries
      SET ${updateFields.join(', ')}
      WHERE id = $2
      RETURNING *
    `;

    const result = await queryWithTenant(tenantId, query, values);

    return result.rows[0];
  }

  /**
   * Delete time entry
   */
  async deleteTimeEntry(tenantId, timeEntryId) {
    const query = `
      DELETE FROM time_entries te
      USING projects p
      WHERE te.project_id = p.id
        AND p.tenant_id = $1
        AND te.id = $2
      RETURNING te.id
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, timeEntryId]);

    if (result.rows.length === 0) {
      throw new Error('Time entry not found');
    }

    return { success: true, id: result.rows[0].id };
  }

  /**
   * Get time entries for a specific project
   */
  async getProjectTimeEntries(tenantId, projectId) {
    const query = `
      SELECT te.*
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      WHERE p.tenant_id = $1 AND p.id = $2
      ORDER BY te.start_time DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, projectId]);
    return result.rows;
  }

  /**
   * Get time entry statistics
   */
  async getTimeEntryStats(tenantId, { projectId = null, startDate = null, endDate = null } = {}) {
    let whereClause = 'WHERE p.tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (projectId) {
      whereClause += ` AND te.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND te.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND te.start_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const query = `
      SELECT
        COUNT(*) as total_entries,
        COUNT(*) FILTER (WHERE te.end_time IS NULL) as running_timers,
        COUNT(*) FILTER (WHERE te.end_time IS NOT NULL) as completed_entries,
        COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
        COALESCE(AVG(te.duration_minutes), 0) as average_minutes,
        COALESCE(MIN(te.duration_minutes), 0) as min_minutes,
        COALESCE(MAX(te.duration_minutes), 0) as max_minutes
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      ${whereClause}
    `;

    const result = await queryWithTenant(tenantId, query, params);
    return result.rows[0];
  }

  /**
   * Get time entries grouped by project
   */
  async getTimeEntriesByProject(tenantId, { startDate = null, endDate = null } = {}) {
    let whereClause = 'WHERE p.tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (startDate) {
      whereClause += ` AND te.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND te.start_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const query = `
      SELECT
        p.id as project_id,
        p.title as project_title,
        c.name as client_name,
        COUNT(*) as entry_count,
        COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
        COALESCE(AVG(te.duration_minutes), 0) as average_minutes
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      ${whereClause}
      GROUP BY p.id, p.title, c.name
      ORDER BY total_minutes DESC
    `;

    const result = await queryWithTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Get daily time summary
   */
  async getDailySummary(tenantId, { startDate = null, endDate = null } = {}) {
    let whereClause = 'WHERE p.tenant_id = $1 AND te.end_time IS NOT NULL';
    const params = [tenantId];
    let paramIndex = 2;

    if (startDate) {
      whereClause += ` AND te.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND te.start_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const query = `
      SELECT
        DATE(te.start_time) as date,
        COUNT(*) as entry_count,
        COALESCE(SUM(te.duration_minutes), 0) as total_minutes
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      ${whereClause}
      GROUP BY DATE(te.start_time)
      ORDER BY date DESC
    `;

    const result = await queryWithTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Calculate elapsed time for running timer
   */
  calculateElapsedMinutes(startTime) {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now - start;
    return Math.floor(diffMs / 60000); // Convert to minutes
  }

  /**
   * Format duration in minutes to hours and minutes
   */
  formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return {
      hours,
      minutes: mins,
      formatted: `${hours}h ${mins}m`,
      totalMinutes: minutes
    };
  }
}

module.exports = new TimeEntryService();
