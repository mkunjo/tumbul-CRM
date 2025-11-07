// Expense management business logic

const { queryWithTenant } = require('../config/database');
const AWS = require('aws-sdk');

// Initialize S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const S3_BUCKET = process.env.S3_BUCKET_NAME || 'tumbul-crm-receipts';

class ExpenseService {
  /**
   * Get all expenses for a tenant
   */
  async getExpenses(tenantId, { projectId = null, category = null, startDate = null, endDate = null, clientApproved = null, limit = 50, offset = 0 }) {
    let whereClause = 'WHERE p.tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (projectId) {
      whereClause += ` AND e.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    if (category) {
      whereClause += ` AND e.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND e.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND e.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (clientApproved !== null) {
      whereClause += ` AND e.client_approved = $${paramIndex}`;
      params.push(clientApproved);
      paramIndex++;
    }

    const query = `
      SELECT
        e.id,
        e.description,
        e.amount,
        e.category,
        e.receipt_photo_s3_key,
        e.receipt_photo_url,
        e.date,
        e.client_approved,
        e.notes,
        e.created_at,
        p.id as project_id,
        p.title as project_title,
        c.id as client_id,
        c.name as client_name
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      ${whereClause}
      ORDER BY e.date DESC, e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await queryWithTenant(tenantId, query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*)
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      ${whereClause}
    `;
    const countResult = await queryWithTenant(tenantId, countQuery, params.slice(0, -2));

    return {
      expenses: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }

  /**
   * Get single expense by ID
   */
  async getExpenseById(tenantId, expenseId) {
    const query = `
      SELECT
        e.*,
        p.id as project_id,
        p.title as project_title,
        c.id as client_id,
        c.name as client_name,
        c.email as client_email
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE p.tenant_id = $1 AND e.id = $2
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, expenseId]);

    if (result.rows.length === 0) {
      throw new Error('Expense not found');
    }

    return result.rows[0];
  }

  /**
   * Create new expense
   */
  async createExpense(tenantId, expenseData, receiptFile = null) {
    const { projectId, description, amount, category, date, notes } = expenseData;

    // Verify project exists and belongs to tenant
    const projectCheck = await queryWithTenant(
      tenantId,
      'SELECT id FROM projects WHERE tenant_id = $1 AND id = $2',
      [tenantId, projectId]
    );

    if (projectCheck.rows.length === 0) {
      throw new Error('Project not found');
    }

    let receiptPhotoS3Key = null;
    let receiptPhotoUrl = null;

    // Upload receipt to S3 if provided
    if (receiptFile) {
      const uploadResult = await this.uploadReceipt(tenantId, projectId, receiptFile);
      receiptPhotoS3Key = uploadResult.key;
      receiptPhotoUrl = uploadResult.url;
    }

    const query = `
      INSERT INTO expenses (
        project_id,
        description,
        amount,
        category,
        receipt_photo_s3_key,
        receipt_photo_url,
        date,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await queryWithTenant(
      tenantId,
      query,
      [
        projectId,
        description,
        amount,
        category || null,
        receiptPhotoS3Key,
        receiptPhotoUrl,
        date || new Date(),
        notes || null
      ]
    );

    return result.rows[0];
  }

  /**
   * Update expense
   */
  async updateExpense(tenantId, expenseId, updates, receiptFile = null) {
    const allowedFields = ['description', 'amount', 'category', 'date', 'notes', 'client_approved'];
    const updateFields = [];
    const values = [tenantId, expenseId];
    let paramIndex = 3;

    // Build dynamic UPDATE clause
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    // Handle receipt upload if provided
    if (receiptFile) {
      // Get expense to find project_id for S3 path
      const expense = await this.getExpenseById(tenantId, expenseId);
      const uploadResult = await this.uploadReceipt(tenantId, expense.project_id, receiptFile);

      updateFields.push(`receipt_photo_s3_key = $${paramIndex}`);
      values.push(uploadResult.key);
      paramIndex++;

      updateFields.push(`receipt_photo_url = $${paramIndex}`);
      values.push(uploadResult.url);
      paramIndex++;

      // Delete old receipt if exists
      if (expense.receipt_photo_s3_key) {
        await this.deleteReceipt(expense.receipt_photo_s3_key);
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Verify expense exists and belongs to tenant
    const expenseCheck = await queryWithTenant(
      tenantId,
      `SELECT e.id FROM expenses e
       JOIN projects p ON e.project_id = p.id
       WHERE p.tenant_id = $1 AND e.id = $2`,
      [tenantId, expenseId]
    );

    if (expenseCheck.rows.length === 0) {
      throw new Error('Expense not found');
    }

    const query = `
      UPDATE expenses
      SET ${updateFields.join(', ')}
      WHERE id = $2
      RETURNING *
    `;

    const result = await queryWithTenant(tenantId, query, values);

    return result.rows[0];
  }

  /**
   * Delete expense
   */
  async deleteExpense(tenantId, expenseId) {
    // Get expense first to delete receipt from S3
    const expense = await this.getExpenseById(tenantId, expenseId);

    const query = `
      DELETE FROM expenses e
      USING projects p
      WHERE e.project_id = p.id
        AND p.tenant_id = $1
        AND e.id = $2
      RETURNING e.id, e.receipt_photo_s3_key
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, expenseId]);

    if (result.rows.length === 0) {
      throw new Error('Expense not found');
    }

    // Delete receipt from S3 if exists
    if (result.rows[0].receipt_photo_s3_key) {
      await this.deleteReceipt(result.rows[0].receipt_photo_s3_key);
    }

    return { success: true, id: result.rows[0].id };
  }

  /**
   * Approve expense (for client approval workflow)
   */
  async approveExpense(tenantId, expenseId) {
    const query = `
      UPDATE expenses e
      SET client_approved = true
      FROM projects p
      WHERE e.project_id = p.id
        AND p.tenant_id = $1
        AND e.id = $2
      RETURNING e.*
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, expenseId]);

    if (result.rows.length === 0) {
      throw new Error('Expense not found');
    }

    return result.rows[0];
  }

  /**
   * Get expenses for a specific project
   */
  async getProjectExpenses(tenantId, projectId) {
    const query = `
      SELECT e.*
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      WHERE p.tenant_id = $1 AND p.id = $2
      ORDER BY e.date DESC, e.created_at DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, projectId]);
    return result.rows;
  }

  /**
   * Get expense statistics
   */
  async getExpenseStats(tenantId, { projectId = null, startDate = null, endDate = null } = {}) {
    let whereClause = 'WHERE p.tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (projectId) {
      whereClause += ` AND e.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND e.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND e.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const query = `
      SELECT
        COUNT(*) as total_expenses,
        COUNT(*) FILTER (WHERE e.client_approved = true) as approved_count,
        COUNT(*) FILTER (WHERE e.client_approved = false) as pending_approval_count,
        COUNT(*) FILTER (WHERE e.receipt_photo_url IS NOT NULL) as with_receipt_count,
        COALESCE(SUM(e.amount), 0) as total_amount,
        COALESCE(SUM(e.amount) FILTER (WHERE e.client_approved = true), 0) as approved_amount,
        COALESCE(AVG(e.amount), 0) as average_amount
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      ${whereClause}
    `;

    const result = await queryWithTenant(tenantId, query, params);
    return result.rows[0];
  }

  /**
   * Get expenses grouped by category
   */
  async getExpensesByCategory(tenantId, { startDate = null, endDate = null } = {}) {
    let whereClause = 'WHERE p.tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (startDate) {
      whereClause += ` AND e.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND e.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const query = `
      SELECT
        e.category,
        COUNT(*) as expense_count,
        COALESCE(SUM(e.amount), 0) as total_amount,
        COALESCE(AVG(e.amount), 0) as average_amount
      FROM expenses e
      JOIN projects p ON e.project_id = p.id
      ${whereClause}
      GROUP BY e.category
      ORDER BY total_amount DESC
    `;

    const result = await queryWithTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Upload receipt to S3
   */
  async uploadReceipt(tenantId, projectId, file) {
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.originalname}`;
    const key = `receipts/${tenantId}/${projectId}/${filename}`;

    const params = {
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private'
    };

    try {
      await s3.upload(params).promise();

      // Generate signed URL valid for 1 year
      const url = s3.getSignedUrl('getObject', {
        Bucket: S3_BUCKET,
        Key: key,
        Expires: 31536000 // 1 year in seconds
      });

      return { key, url };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error('Failed to upload receipt to S3');
    }
  }

  /**
   * Delete receipt from S3
   */
  async deleteReceipt(s3Key) {
    if (!s3Key) return;

    const params = {
      Bucket: S3_BUCKET,
      Key: s3Key
    };

    try {
      await s3.deleteObject(params).promise();
    } catch (error) {
      console.error('S3 delete error:', error);
      // Don't throw - this is a cleanup operation
    }
  }

  /**
   * Get signed URL for receipt (for viewing)
   */
  async getReceiptUrl(s3Key, expiresIn = 3600) {
    if (!s3Key) {
      throw new Error('No receipt available');
    }

    try {
      const url = s3.getSignedUrl('getObject', {
        Bucket: S3_BUCKET,
        Key: s3Key,
        Expires: expiresIn // Default 1 hour
      });

      return url;
    } catch (error) {
      console.error('S3 signed URL error:', error);
      throw new Error('Failed to generate receipt URL');
    }
  }
}

module.exports = new ExpenseService();
