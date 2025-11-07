// Invoice management business logic

const { queryWithTenant, transactionWithTenant } = require('../config/database');

class InvoiceService {
  /**
   * Generate unique invoice number
   * Format: INV-YYYYMMDD-XXXX
   */
  async generateInvoiceNumber(tenantId) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `INV-${date}`;

    const query = `
      SELECT invoice_number
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      WHERE p.tenant_id = $1 AND invoice_number LIKE $2
      ORDER BY invoice_number DESC
      LIMIT 1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, `${prefix}-%`]);

    let sequence = 1;
    if (result.rows.length > 0) {
      const lastNumber = result.rows[0].invoice_number;
      const lastSeq = parseInt(lastNumber.split('-').pop());
      sequence = lastSeq + 1;
    }

    return `${prefix}-${sequence.toString().padStart(4, '0')}`;
  }

  /**
   * Get all invoices for a tenant
   */
  async getInvoices(tenantId, { status = null, projectId = null, limit = 50, offset = 0 }) {
    let whereClause = 'WHERE p.tenant_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND i.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (projectId) {
      whereClause += ` AND i.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    const query = `
      SELECT
        i.id,
        i.invoice_number,
        i.amount,
        i.amount as total_amount,
        COALESCE(SUM(pay.amount), 0) as paid_amount,
        i.amount - COALESCE(SUM(pay.amount), 0) as balance,
        i.status,
        i.due_date,
        i.paid_at,
        i.notes,
        i.created_at,
        i.updated_at,
        p.id as project_id,
        p.title as project_name,
        c.id as client_id,
        c.name as client_name,
        c.email as client_email,
        COUNT(pay.id) as payment_count
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN payments pay ON i.id = pay.invoice_id
      ${whereClause}
      GROUP BY i.id, p.id, p.title, c.id, c.name, c.email
      ORDER BY i.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await queryWithTenant(tenantId, query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT i.id)
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      ${whereClause}
    `;
    const countResult = await queryWithTenant(tenantId, countQuery, params.slice(0, -2));

    return {
      invoices: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }

  /**
   * Get single invoice by ID
   */
  async getInvoiceById(tenantId, invoiceId) {
    const query = `
      SELECT
        i.*,
        p.id as project_id,
        p.title as project_title,
        p.total_amount as project_total,
        c.id as client_id,
        c.name as client_name,
        c.email as client_email,
        c.phone as client_phone,
        c.address as client_address,
        COALESCE(SUM(pay.amount), 0) as paid_amount,
        i.amount - COALESCE(SUM(pay.amount), 0) as balance,
        COUNT(pay.id) as payment_count
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      LEFT JOIN payments pay ON i.id = pay.invoice_id
      WHERE p.tenant_id = $1 AND i.id = $2
      GROUP BY i.id, p.id, p.title, p.total_amount, c.id, c.name, c.email, c.phone, c.address
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, invoiceId]);

    if (result.rows.length === 0) {
      throw new Error('Invoice not found');
    }

    // Get payment history
    const paymentsQuery = `
      SELECT
        pay.*
      FROM payments pay
      JOIN invoices i ON pay.invoice_id = i.id
      JOIN projects p ON i.project_id = p.id
      WHERE p.tenant_id = $1 AND pay.invoice_id = $2
      ORDER BY pay.payment_date DESC
    `;

    const paymentsResult = await queryWithTenant(tenantId, paymentsQuery, [tenantId, invoiceId]);

    const invoice = result.rows[0];
    invoice.payments = paymentsResult.rows;

    return invoice;
  }

  /**
   * Get invoice by invoice number
   */
  async getInvoiceByNumber(tenantId, invoiceNumber) {
    const query = `
      SELECT
        i.*,
        p.id as project_id,
        p.title as project_title,
        c.id as client_id,
        c.name as client_name,
        c.email as client_email
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE p.tenant_id = $1 AND i.invoice_number = $2
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, invoiceNumber]);

    if (result.rows.length === 0) {
      throw new Error('Invoice not found');
    }

    return result.rows[0];
  }

  /**
   * Create new invoice
   */
  async createInvoice(tenantId, invoiceData) {
    const { projectId, amount, dueDate, notes } = invoiceData;

    // Verify project exists and belongs to tenant
    const projectCheck = await queryWithTenant(
      tenantId,
      'SELECT id FROM projects WHERE tenant_id = $1 AND id = $2',
      [tenantId, projectId]
    );

    if (projectCheck.rows.length === 0) {
      throw new Error('Project not found');
    }

    // Generate unique invoice number
    const invoiceNumber = await this.generateInvoiceNumber(tenantId);

    const query = `
      INSERT INTO invoices (project_id, invoice_number, amount, due_date, notes, status)
      VALUES ($1, $2, $3, $4, $5, 'draft')
      RETURNING *
    `;

    const result = await queryWithTenant(
      tenantId,
      query,
      [projectId, invoiceNumber, amount, dueDate || null, notes || null]
    );

    return result.rows[0];
  }

  /**
   * Update invoice
   */
  async updateInvoice(tenantId, invoiceId, updates) {
    const allowedFields = ['amount', 'due_date', 'notes', 'status'];
    const updateFields = [];
    const values = [tenantId, invoiceId];
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

    // Verify invoice exists and belongs to tenant
    const invoiceCheck = await queryWithTenant(
      tenantId,
      `SELECT i.id FROM invoices i
       JOIN projects p ON i.project_id = p.id
       WHERE p.tenant_id = $1 AND i.id = $2`,
      [tenantId, invoiceId]
    );

    if (invoiceCheck.rows.length === 0) {
      throw new Error('Invoice not found');
    }

    const query = `
      UPDATE invoices
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await queryWithTenant(tenantId, query, values);

    return result.rows[0];
  }

  /**
   * Mark invoice as sent
   */
  async markAsSent(tenantId, invoiceId) {
    const query = `
      UPDATE invoices i
      SET status = 'sent', updated_at = NOW()
      FROM projects p
      WHERE i.project_id = p.id
        AND p.tenant_id = $1
        AND i.id = $2
        AND i.status = 'draft'
      RETURNING i.*
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, invoiceId]);

    if (result.rows.length === 0) {
      throw new Error('Invoice not found or already sent');
    }

    return result.rows[0];
  }

  /**
   * Mark invoice as paid
   */
  async markAsPaid(tenantId, invoiceId, paymentDetails = {}) {
    const { stripePaymentIntentId = null, paidAt = new Date() } = paymentDetails;

    const query = `
      UPDATE invoices i
      SET
        status = 'paid',
        paid_at = $3,
        stripe_payment_intent_id = $4,
        updated_at = NOW()
      FROM projects p
      WHERE i.project_id = p.id
        AND p.tenant_id = $1
        AND i.id = $2
        AND i.status IN ('sent', 'overdue')
      RETURNING i.*
    `;

    const result = await queryWithTenant(
      tenantId,
      query,
      [tenantId, invoiceId, paidAt, stripePaymentIntentId]
    );

    if (result.rows.length === 0) {
      throw new Error('Invoice not found or cannot be marked as paid');
    }

    return result.rows[0];
  }

  /**
   * Cancel invoice
   */
  async cancelInvoice(tenantId, invoiceId) {
    const query = `
      UPDATE invoices i
      SET status = 'canceled', updated_at = NOW()
      FROM projects p
      WHERE i.project_id = p.id
        AND p.tenant_id = $1
        AND i.id = $2
        AND i.status NOT IN ('paid', 'canceled')
      RETURNING i.*
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, invoiceId]);

    if (result.rows.length === 0) {
      throw new Error('Invoice not found or cannot be canceled');
    }

    return result.rows[0];
  }

  /**
   * Delete invoice (only drafts)
   */
  async deleteInvoice(tenantId, invoiceId) {
    // Verify invoice is draft
    const invoiceCheck = await queryWithTenant(
      tenantId,
      `SELECT i.id, i.status FROM invoices i
       JOIN projects p ON i.project_id = p.id
       WHERE p.tenant_id = $1 AND i.id = $2`,
      [tenantId, invoiceId]
    );

    if (invoiceCheck.rows.length === 0) {
      throw new Error('Invoice not found');
    }

    if (invoiceCheck.rows[0].status !== 'draft') {
      throw new Error('Only draft invoices can be deleted. Cancel instead.');
    }

    const query = `
      DELETE FROM invoices i
      USING projects p
      WHERE i.project_id = p.id
        AND p.tenant_id = $1
        AND i.id = $2
      RETURNING i.id
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, invoiceId]);

    return { success: true, id: result.rows[0].id };
  }

  /**
   * Get invoices for a specific project
   */
  async getProjectInvoices(tenantId, projectId) {
    const query = `
      SELECT i.*
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      WHERE p.tenant_id = $1 AND p.id = $2
      ORDER BY i.created_at DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, projectId]);
    return result.rows;
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
        COALESCE(SUM(i.amount) FILTER (WHERE i.status IN ('sent', 'overdue')), 0) as outstanding_amount
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      WHERE p.tenant_id = $1
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows[0];
  }

  /**
   * Get overdue invoices
   */
  async getOverdueInvoices(tenantId) {
    const query = `
      SELECT
        i.*,
        p.title as project_title,
        c.name as client_name,
        c.email as client_email
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE p.tenant_id = $1
        AND i.status = 'sent'
        AND i.due_date < CURRENT_DATE
      ORDER BY i.due_date ASC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows;
  }

  /**
   * Update overdue invoices status
   * This should be called by a cron job
   */
  async updateOverdueInvoices(tenantId) {
    const query = `
      UPDATE invoices i
      SET status = 'overdue', updated_at = NOW()
      FROM projects p
      WHERE i.project_id = p.id
        AND p.tenant_id = $1
        AND i.status IN ('sent', 'partially_paid')
        AND i.due_date < CURRENT_DATE
      RETURNING i.id, i.invoice_number
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId]);
    return result.rows;
  }

  /**
   * Record a payment for an invoice
   */
  async recordPayment(tenantId, invoiceId, paymentData) {
    const { amount, payment_date, payment_method = 'other', notes, stripe_payment_intent_id } = paymentData;

    // Verify invoice exists and belongs to tenant
    const invoiceCheck = await queryWithTenant(
      tenantId,
      `SELECT i.id, i.amount, i.status, COALESCE(SUM(p.amount), 0) as paid_amount
       FROM invoices i
       JOIN projects pr ON i.project_id = pr.id
       LEFT JOIN payments p ON i.id = p.invoice_id
       WHERE pr.tenant_id = $1 AND i.id = $2
       GROUP BY i.id, i.amount, i.status`,
      [tenantId, invoiceId]
    );

    if (invoiceCheck.rows.length === 0) {
      throw new Error('Invoice not found');
    }

    const invoice = invoiceCheck.rows[0];

    // Check if invoice can accept payments
    if (invoice.status === 'canceled') {
      throw new Error('Cannot record payment for canceled invoice');
    }

    if (invoice.status === 'draft') {
      throw new Error('Cannot record payment for draft invoice. Mark as sent first.');
    }

    // Calculate remaining balance
    const remainingBalance = parseFloat(invoice.amount) - parseFloat(invoice.paid_amount);

    // Validate payment amount
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    if (amount > remainingBalance) {
      throw new Error(`Payment amount ($${amount}) exceeds remaining balance ($${remainingBalance.toFixed(2)})`);
    }

    // Create payment record
    const paymentQuery = `
      INSERT INTO payments (invoice_id, amount, payment_date, payment_method, stripe_payment_intent_id, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'contractor')
      RETURNING *
    `;

    const result = await queryWithTenant(
      tenantId,
      paymentQuery,
      [invoiceId, amount, payment_date || new Date(), payment_method, stripe_payment_intent_id || null, notes || null]
    );

    // The trigger will automatically update invoice status
    // Fetch updated invoice to return
    const updatedInvoice = await this.getInvoiceById(tenantId, invoiceId);

    return {
      payment: result.rows[0],
      invoice: updatedInvoice
    };
  }

  /**
   * Get all payments for an invoice
   */
  async getInvoicePayments(tenantId, invoiceId) {
    // Verify invoice exists and belongs to tenant
    const invoiceCheck = await queryWithTenant(
      tenantId,
      `SELECT i.id FROM invoices i
       JOIN projects p ON i.project_id = p.id
       WHERE p.tenant_id = $1 AND i.id = $2`,
      [tenantId, invoiceId]
    );

    if (invoiceCheck.rows.length === 0) {
      throw new Error('Invoice not found');
    }

    const query = `
      SELECT
        pay.*
      FROM payments pay
      JOIN invoices i ON pay.invoice_id = i.id
      JOIN projects p ON i.project_id = p.id
      WHERE p.tenant_id = $1 AND pay.invoice_id = $2
      ORDER BY pay.payment_date DESC, pay.created_at DESC
    `;

    const result = await queryWithTenant(tenantId, query, [tenantId, invoiceId]);
    return result.rows;
  }

  /**
   * Delete a payment (if needed for corrections)
   */
  async deletePayment(tenantId, paymentId) {
    // Verify payment exists and belongs to tenant
    const paymentCheck = await queryWithTenant(
      tenantId,
      `SELECT pay.id, pay.invoice_id
       FROM payments pay
       JOIN invoices i ON pay.invoice_id = i.id
       JOIN projects p ON i.project_id = p.id
       WHERE p.tenant_id = $1 AND pay.id = $2`,
      [tenantId, paymentId]
    );

    if (paymentCheck.rows.length === 0) {
      throw new Error('Payment not found');
    }

    const invoiceId = paymentCheck.rows[0].invoice_id;

    const query = `
      DELETE FROM payments
      WHERE id = $1
      RETURNING *
    `;

    const result = await queryWithTenant(tenantId, query, [paymentId]);

    // The trigger will automatically update invoice status
    // Fetch updated invoice to return
    const updatedInvoice = await this.getInvoiceById(tenantId, invoiceId);

    return {
      deleted_payment: result.rows[0],
      invoice: updatedInvoice
    };
  }
}

module.exports = new InvoiceService();
