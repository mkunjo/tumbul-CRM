// Partial Payments Feature Tests

const request = require('supertest');
const app = require('../server');
const { pool, queryWithTenant } = require('../config/database');

describe('Partial Payments Feature', () => {
  let tenantId;
  let authToken;
  let clientId;
  let projectId;
  let invoiceId;

  // Setup: Create test tenant, client, project, and invoice
  beforeAll(async () => {
    // Create tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (email, password_hash, company_name, subscription_plan)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['payments-test@example.com', '$2b$10$test', 'Payments Test Co', 'pro']
    );
    tenantId = tenantResult.rows[0].id;

    // Login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'payments-test@example.com',
        password: 'testpassword123'
      });

    // For testing, we'll use a mock token approach
    // In production tests, implement proper JWT generation
    authToken = 'mock-jwt-token';

    // Create client
    const clientResult = await queryWithTenant(
      tenantId,
      `INSERT INTO clients (tenant_id, name, email, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [tenantId, 'Test Client', 'client@test.com', '555-0100']
    );
    clientId = clientResult.rows[0].id;

    // Create project
    const projectResult = await queryWithTenant(
      tenantId,
      `INSERT INTO projects (tenant_id, client_id, title, status, total_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [tenantId, clientId, 'Payment Test Project', 'active', 10000.00]
    );
    projectId = projectResult.rows[0].id;

    // Create invoice
    const invoiceResult = await queryWithTenant(
      tenantId,
      `INSERT INTO invoices (project_id, invoice_number, amount, status, due_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [projectId, 'INV-TEST-0001', 5000.00, 'sent', new Date()]
    );
    invoiceId = invoiceResult.rows[0].id;
  });

  // Cleanup
  afterAll(async () => {
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await pool.end();
  });

  describe('Payment Recording', () => {
    test('should record a partial payment', async () => {
      const paymentResult = await queryWithTenant(
        tenantId,
        `INSERT INTO payments (invoice_id, amount, payment_method, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [invoiceId, 2000.00, 'check', 'First payment']
      );

      expect(paymentResult.rows[0]).toBeDefined();
      expect(parseFloat(paymentResult.rows[0].amount)).toBe(2000.00);
      expect(paymentResult.rows[0].payment_method).toBe('check');

      // Verify invoice status updated to partially_paid
      const invoiceResult = await queryWithTenant(
        tenantId,
        'SELECT status FROM invoices WHERE id = $1',
        [invoiceId]
      );
      expect(invoiceResult.rows[0].status).toBe('partially_paid');
    });

    test('should calculate correct balance after partial payment', async () => {
      const balanceResult = await queryWithTenant(
        tenantId,
        `SELECT
           i.amount as total_amount,
           COALESCE(SUM(p.amount), 0) as paid_amount,
           i.amount - COALESCE(SUM(p.amount), 0) as balance
         FROM invoices i
         LEFT JOIN payments p ON i.id = p.invoice_id
         WHERE i.id = $1
         GROUP BY i.id, i.amount`,
        [invoiceId]
      );

      expect(parseFloat(balanceResult.rows[0].total_amount)).toBe(5000.00);
      expect(parseFloat(balanceResult.rows[0].paid_amount)).toBe(2000.00);
      expect(parseFloat(balanceResult.rows[0].balance)).toBe(3000.00);
    });

    test('should record multiple partial payments', async () => {
      // Record second payment
      await queryWithTenant(
        tenantId,
        `INSERT INTO payments (invoice_id, amount, payment_method, notes)
         VALUES ($1, $2, $3, $4)`,
        [invoiceId, 1500.00, 'credit_card', 'Second payment']
      );

      // Check total paid amount
      const balanceResult = await queryWithTenant(
        tenantId,
        `SELECT COALESCE(SUM(amount), 0) as total_paid
         FROM payments
         WHERE invoice_id = $1`,
        [invoiceId]
      );

      expect(parseFloat(balanceResult.rows[0].total_paid)).toBe(3500.00);

      // Invoice should still be partially_paid
      const invoiceResult = await queryWithTenant(
        tenantId,
        'SELECT status FROM invoices WHERE id = $1',
        [invoiceId]
      );
      expect(invoiceResult.rows[0].status).toBe('partially_paid');
    });

    test('should mark invoice as paid when full amount is paid', async () => {
      // Pay remaining balance (1500.00)
      await queryWithTenant(
        tenantId,
        `INSERT INTO payments (invoice_id, amount, payment_method, notes)
         VALUES ($1, $2, $3, $4)`,
        [invoiceId, 1500.00, 'cash', 'Final payment']
      );

      // Verify invoice marked as paid
      const invoiceResult = await queryWithTenant(
        tenantId,
        'SELECT status, paid_at FROM invoices WHERE id = $1',
        [invoiceId]
      );

      expect(invoiceResult.rows[0].status).toBe('paid');
      expect(invoiceResult.rows[0].paid_at).toBeDefined();
    });

    test('should prevent overpayment via service validation', async () => {
      // Create new invoice for this test
      const newInvoiceResult = await queryWithTenant(
        tenantId,
        `INSERT INTO invoices (project_id, invoice_number, amount, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [projectId, 'INV-TEST-0002', 1000.00, 'sent']
      );
      const newInvoiceId = newInvoiceResult.rows[0].id;

      // Try to pay more than invoice amount
      const invoiceService = require('../services/invoiceService');

      await expect(
        invoiceService.recordPayment(tenantId, newInvoiceId, {
          amount: 1500.00,
          payment_method: 'cash'
        })
      ).rejects.toThrow('exceeds remaining balance');
    });

    test('should prevent payment on draft invoice', async () => {
      // Create draft invoice
      const draftInvoiceResult = await queryWithTenant(
        tenantId,
        `INSERT INTO invoices (project_id, invoice_number, amount, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [projectId, 'INV-TEST-0003', 500.00, 'draft']
      );
      const draftInvoiceId = draftInvoiceResult.rows[0].id;

      const invoiceService = require('../services/invoiceService');

      await expect(
        invoiceService.recordPayment(tenantId, draftInvoiceId, {
          amount: 500.00,
          payment_method: 'cash'
        })
      ).rejects.toThrow('Cannot record payment for draft invoice');
    });

    test('should prevent payment on canceled invoice', async () => {
      // Create and cancel invoice
      const canceledInvoiceResult = await queryWithTenant(
        tenantId,
        `INSERT INTO invoices (project_id, invoice_number, amount, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [projectId, 'INV-TEST-0004', 500.00, 'canceled']
      );
      const canceledInvoiceId = canceledInvoiceResult.rows[0].id;

      const invoiceService = require('../services/invoiceService');

      await expect(
        invoiceService.recordPayment(tenantId, canceledInvoiceId, {
          amount: 500.00,
          payment_method: 'cash'
        })
      ).rejects.toThrow('Cannot record payment for canceled invoice');
    });
  });

  describe('Payment Retrieval', () => {
    test('should retrieve all payments for an invoice', async () => {
      const invoiceService = require('../services/invoiceService');
      const payments = await invoiceService.getInvoicePayments(tenantId, invoiceId);

      expect(payments).toBeDefined();
      expect(payments.length).toBeGreaterThanOrEqual(3);
      expect(payments[0]).toHaveProperty('amount');
      expect(payments[0]).toHaveProperty('payment_method');
      expect(payments[0]).toHaveProperty('payment_date');
    });

    test('should include payment history in invoice details', async () => {
      const invoiceService = require('../services/invoiceService');
      const invoice = await invoiceService.getInvoiceById(tenantId, invoiceId);

      expect(invoice.payments).toBeDefined();
      expect(Array.isArray(invoice.payments)).toBe(true);
      expect(invoice.paid_amount).toBeDefined();
      expect(invoice.balance).toBeDefined();
      expect(parseFloat(invoice.paid_amount) + parseFloat(invoice.balance)).toBe(parseFloat(invoice.amount));
    });

    test('should show payment count in invoice list', async () => {
      const invoiceService = require('../services/invoiceService');
      const result = await invoiceService.getInvoices(tenantId, { limit: 10, offset: 0 });

      const testInvoice = result.invoices.find(inv => inv.id === invoiceId);
      expect(testInvoice).toBeDefined();
      expect(testInvoice.payment_count).toBeDefined();
      expect(parseInt(testInvoice.payment_count)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Payment Deletion', () => {
    let paymentToDelete;

    beforeAll(async () => {
      // Create test invoice and payment for deletion
      const testInvoiceResult = await queryWithTenant(
        tenantId,
        `INSERT INTO invoices (project_id, invoice_number, amount, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [projectId, 'INV-TEST-0005', 1000.00, 'sent']
      );
      const testInvoiceId = testInvoiceResult.rows[0].id;

      const paymentResult = await queryWithTenant(
        tenantId,
        `INSERT INTO payments (invoice_id, amount, payment_method)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [testInvoiceId, 500.00, 'cash']
      );
      paymentToDelete = paymentResult.rows[0];
    });

    test('should delete a payment and update invoice status', async () => {
      const invoiceService = require('../services/invoiceService');
      const result = await invoiceService.deletePayment(tenantId, paymentToDelete.id);

      expect(result.deleted_payment).toBeDefined();
      expect(result.deleted_payment.id).toBe(paymentToDelete.id);
      expect(result.invoice).toBeDefined();

      // Verify invoice status reverted to sent
      expect(result.invoice.status).toBe('sent');
      expect(parseFloat(result.invoice.paid_amount)).toBe(0);
    });

    test('should throw error when deleting non-existent payment', async () => {
      const invoiceService = require('../services/invoiceService');
      const fakePaymentId = '00000000-0000-0000-0000-000000000000';

      await expect(
        invoiceService.deletePayment(tenantId, fakePaymentId)
      ).rejects.toThrow('Payment not found');
    });
  });

  describe('Invoice Status Transitions', () => {
    test('should handle sent -> partially_paid -> paid workflow', async () => {
      // Create new invoice
      const workflowInvoiceResult = await queryWithTenant(
        tenantId,
        `INSERT INTO invoices (project_id, invoice_number, amount, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [projectId, 'INV-TEST-WORKFLOW', 2000.00, 'sent']
      );
      const workflowInvoiceId = workflowInvoiceResult.rows[0].id;

      // Check initial status
      let invoice = await queryWithTenant(
        tenantId,
        'SELECT status FROM invoices WHERE id = $1',
        [workflowInvoiceId]
      );
      expect(invoice.rows[0].status).toBe('sent');

      // Record partial payment
      await queryWithTenant(
        tenantId,
        `INSERT INTO payments (invoice_id, amount, payment_method)
         VALUES ($1, $2, $3)`,
        [workflowInvoiceId, 1000.00, 'check']
      );

      // Verify partially_paid status
      invoice = await queryWithTenant(
        tenantId,
        'SELECT status FROM invoices WHERE id = $1',
        [workflowInvoiceId]
      );
      expect(invoice.rows[0].status).toBe('partially_paid');

      // Complete payment
      await queryWithTenant(
        tenantId,
        `INSERT INTO payments (invoice_id, amount, payment_method)
         VALUES ($1, $2, $3)`,
        [workflowInvoiceId, 1000.00, 'credit_card']
      );

      // Verify paid status
      invoice = await queryWithTenant(
        tenantId,
        'SELECT status FROM invoices WHERE id = $1',
        [workflowInvoiceId]
      );
      expect(invoice.rows[0].status).toBe('paid');
    });

    test('should handle overdue status with partial payments', async () => {
      // Create overdue invoice
      const overdueInvoiceResult = await queryWithTenant(
        tenantId,
        `INSERT INTO invoices (project_id, invoice_number, amount, status, due_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [projectId, 'INV-TEST-OVERDUE', 3000.00, 'overdue', '2024-01-01']
      );
      const overdueInvoiceId = overdueInvoiceResult.rows[0].id;

      // Record partial payment on overdue invoice
      await queryWithTenant(
        tenantId,
        `INSERT INTO payments (invoice_id, amount, payment_method)
         VALUES ($1, $2, $3)`,
        [overdueInvoiceId, 1000.00, 'bank_transfer']
      );

      // Should change to partially_paid even though it was overdue
      const invoice = await queryWithTenant(
        tenantId,
        'SELECT status FROM invoices WHERE id = $1',
        [overdueInvoiceId]
      );
      expect(invoice.rows[0].status).toBe('partially_paid');
    });
  });

  describe('Payment Methods and Metadata', () => {
    test('should support different payment methods', async () => {
      const testInvoiceResult = await queryWithTenant(
        tenantId,
        `INSERT INTO invoices (project_id, invoice_number, amount, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [projectId, 'INV-TEST-METHODS', 5000.00, 'sent']
      );
      const testInvoiceId = testInvoiceResult.rows[0].id;

      const methods = ['cash', 'check', 'credit_card', 'bank_transfer', 'stripe'];

      for (const method of methods) {
        const result = await queryWithTenant(
          tenantId,
          `INSERT INTO payments (invoice_id, amount, payment_method)
           VALUES ($1, $2, $3)
           RETURNING payment_method`,
          [testInvoiceId, 100.00, method]
        );
        expect(result.rows[0].payment_method).toBe(method);
      }
    });

    test('should store payment notes and dates', async () => {
      const testInvoiceResult = await queryWithTenant(
        tenantId,
        `INSERT INTO invoices (project_id, invoice_number, amount, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [projectId, 'INV-TEST-METADATA', 1000.00, 'sent']
      );
      const testInvoiceId = testInvoiceResult.rows[0].id;

      const customDate = new Date('2024-06-15');
      const result = await queryWithTenant(
        tenantId,
        `INSERT INTO payments (invoice_id, amount, payment_method, payment_date, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [testInvoiceId, 500.00, 'check', customDate, 'Check #12345']
      );

      expect(result.rows[0].notes).toBe('Check #12345');
      expect(new Date(result.rows[0].payment_date).toISOString()).toBe(customDate.toISOString());
    });

    test('should store Stripe payment intent ID', async () => {
      const testInvoiceResult = await queryWithTenant(
        tenantId,
        `INSERT INTO invoices (project_id, invoice_number, amount, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [projectId, 'INV-TEST-STRIPE', 2500.00, 'sent']
      );
      const testInvoiceId = testInvoiceResult.rows[0].id;

      const stripeIntentId = 'pi_1234567890abcdef';
      const result = await queryWithTenant(
        tenantId,
        `INSERT INTO payments (invoice_id, amount, payment_method, stripe_payment_intent_id)
         VALUES ($1, $2, $3, $4)
         RETURNING stripe_payment_intent_id`,
        [testInvoiceId, 2500.00, 'stripe', stripeIntentId]
      );

      expect(result.rows[0].stripe_payment_intent_id).toBe(stripeIntentId);
    });
  });

  describe('Tenant Isolation', () => {
    test('should not allow accessing payments from different tenant', async () => {
      // Create second tenant
      const tenant2Result = await pool.query(
        `INSERT INTO tenants (email, password_hash, company_name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        ['tenant2@test.com', '$2b$10$test', 'Tenant 2']
      );
      const tenant2Id = tenant2Result.rows[0].id;

      const invoiceService = require('../services/invoiceService');

      // Try to access first tenant's invoice from second tenant
      await expect(
        invoiceService.getInvoicePayments(tenant2Id, invoiceId)
      ).rejects.toThrow('Invoice not found');

      // Cleanup
      await pool.query('DELETE FROM tenants WHERE id = $1', [tenant2Id]);
    });
  });
});
