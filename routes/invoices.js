// Invoice management API endpoints

const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const invoiceService = require('../services/invoiceService');
const { authenticate } = require('../middleware/auth');

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

/**
 * GET /api/invoices
 * Get all invoices with optional filtering
 */
router.get('/',
  authenticate,
  [
    query('status').optional().isIn(['draft', 'sent', 'paid', 'partially_paid', 'overdue', 'canceled']),
    query('projectId').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { status, projectId, limit, offset } = req.query;

      const result = await invoiceService.getInvoices(req.tenant.id, {
        status: status || null,
        projectId: projectId || null,
        limit: limit || 50,
        offset: offset || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Get invoices error:', error);
      res.status(500).json({
        error: 'Failed to fetch invoices',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/invoices/stats
 * Get invoice statistics
 */
router.get('/stats',
  authenticate,
  async (req, res) => {
    try {
      const stats = await invoiceService.getInvoiceStats(req.tenant.id);
      res.json(stats);
    } catch (error) {
      console.error('Get invoice stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch statistics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/invoices/overdue
 * Get all overdue invoices
 */
router.get('/overdue',
  authenticate,
  async (req, res) => {
    try {
      const invoices = await invoiceService.getOverdueInvoices(req.tenant.id);
      res.json({ invoices });
    } catch (error) {
      console.error('Get overdue invoices error:', error);
      res.status(500).json({
        error: 'Failed to fetch overdue invoices',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/invoices/:id
 * Get single invoice by ID
 */
router.get('/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const invoice = await invoiceService.getInvoiceById(req.tenant.id, req.params.id);
      res.json(invoice);
    } catch (error) {
      console.error('Get invoice error:', error);
      const statusCode = error.message === 'Invoice not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to fetch invoice',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/invoices/number/:invoiceNumber
 * Get invoice by invoice number
 */
router.get('/number/:invoiceNumber',
  authenticate,
  [param('invoiceNumber').matches(/^INV-\d{8}-\d{4}$/)],
  validate,
  async (req, res) => {
    try {
      const invoice = await invoiceService.getInvoiceByNumber(req.tenant.id, req.params.invoiceNumber);
      res.json(invoice);
    } catch (error) {
      console.error('Get invoice by number error:', error);
      const statusCode = error.message === 'Invoice not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to fetch invoice',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/invoices
 * Create new invoice
 */
router.post('/',
  authenticate,
  [
    body('projectId').isUUID().withMessage('Valid project ID is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('dueDate').optional().isISO8601().toDate(),
    body('notes').optional().trim()
  ],
  validate,
  async (req, res) => {
    try {
      const invoice = await invoiceService.createInvoice(req.tenant.id, req.body);

      res.status(201).json(invoice);
    } catch (error) {
      console.error('Create invoice error:', error);
      const statusCode = error.message === 'Project not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to create invoice',
        message: error.message
      });
    }
  }
);

/**
 * PUT /api/invoices/:id
 * Update invoice
 */
router.put('/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('amount').optional().isFloat({ min: 0.01 }),
    body('dueDate').optional().isISO8601().toDate(),
    body('notes').optional().trim(),
    body('status').optional().isIn(['draft', 'sent', 'paid', 'partially_paid', 'overdue', 'canceled'])
  ],
  validate,
  async (req, res) => {
    try {
      const invoice = await invoiceService.updateInvoice(
        req.tenant.id,
        req.params.id,
        req.body
      );

      res.json(invoice);
    } catch (error) {
      console.error('Update invoice error:', error);
      const statusCode = error.message === 'Invoice not found' ? 404 :
                         error.message.includes('No valid fields') ? 400 : 500;
      res.status(statusCode).json({
        error: 'Failed to update invoice',
        message: error.message
      });
    }
  }
);

/**
 * PATCH /api/invoices/:id/send
 * Mark invoice as sent
 */
router.patch('/:id/send',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const invoice = await invoiceService.markAsSent(req.tenant.id, req.params.id);
      res.json({
        message: 'Invoice marked as sent',
        invoice
      });
    } catch (error) {
      console.error('Send invoice error:', error);
      const statusCode = error.message === 'Invoice not found or already sent' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to send invoice',
        message: error.message
      });
    }
  }
);

/**
 * PATCH /api/invoices/:id/pay
 * Mark invoice as paid
 */
router.patch('/:id/pay',
  authenticate,
  [
    param('id').isUUID(),
    body('stripePaymentIntentId').optional().trim(),
    body('paidAt').optional().isISO8601().toDate()
  ],
  validate,
  async (req, res) => {
    try {
      const invoice = await invoiceService.markAsPaid(
        req.tenant.id,
        req.params.id,
        req.body
      );
      res.json({
        message: 'Invoice marked as paid',
        invoice
      });
    } catch (error) {
      console.error('Pay invoice error:', error);
      const statusCode = error.message.includes('not found or cannot') ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to mark invoice as paid',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/invoices/:id/payment
 * Record a payment for an invoice (supports partial payments)
 */
router.post('/:id/payment',
  authenticate,
  [
    param('id').isUUID(),
    body('amount').isFloat({ min: 0.01 }),
    body('payment_date').optional().isISO8601().toDate(),
    body('payment_method').optional().isIn(['cash', 'check', 'credit_card', 'bank_transfer', 'stripe', 'other']),
    body('stripe_payment_intent_id').optional().trim(),
    body('notes').optional().trim()
  ],
  validate,
  async (req, res) => {
    try {
      const result = await invoiceService.recordPayment(
        req.tenant.id,
        req.params.id,
        req.body
      );
      res.status(201).json({
        message: 'Payment recorded successfully',
        payment: result.payment,
        invoice: result.invoice
      });
    } catch (error) {
      console.error('Record payment error:', error);
      const statusCode = error.message === 'Invoice not found' ? 404 :
                         error.message.includes('Cannot record payment') ? 400 :
                         error.message.includes('exceeds remaining balance') ? 400 : 500;
      res.status(statusCode).json({
        error: 'Failed to record payment',
        message: error.message
      });
    }
  }
);

/**
 * PATCH /api/invoices/:id/cancel
 * Cancel invoice
 */
router.patch('/:id/cancel',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const invoice = await invoiceService.cancelInvoice(req.tenant.id, req.params.id);
      res.json({
        message: 'Invoice canceled successfully',
        invoice
      });
    } catch (error) {
      console.error('Cancel invoice error:', error);
      const statusCode = error.message.includes('not found or cannot') ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to cancel invoice',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/invoices/:id
 * Delete invoice (only drafts)
 */
router.delete('/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      await invoiceService.deleteInvoice(req.tenant.id, req.params.id);
      res.json({
        success: true,
        message: 'Invoice deleted successfully'
      });
    } catch (error) {
      console.error('Delete invoice error:', error);
      const statusCode = error.message === 'Invoice not found' ? 404 :
                         error.message.includes('Only draft') ? 409 : 500;
      res.status(statusCode).json({
        error: 'Failed to delete invoice',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/invoices/project/:projectId
 * Get all invoices for a project
 */
router.get('/project/:projectId',
  authenticate,
  [param('projectId').isUUID()],
  validate,
  async (req, res) => {
    try {
      const invoices = await invoiceService.getProjectInvoices(
        req.tenant.id,
        req.params.projectId
      );
      res.json({ invoices });
    } catch (error) {
      console.error('Get project invoices error:', error);
      res.status(500).json({
        error: 'Failed to fetch project invoices',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/invoices/:id/payments
 * Get all payments for an invoice
 */
router.get('/:id/payments',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const payments = await invoiceService.getInvoicePayments(
        req.tenant.id,
        req.params.id
      );
      res.json({ payments });
    } catch (error) {
      console.error('Get invoice payments error:', error);
      const statusCode = error.message === 'Invoice not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to fetch payments',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/invoices/:invoiceId/payments/:paymentId
 * Delete a payment (for corrections)
 */
router.delete('/:invoiceId/payments/:paymentId',
  authenticate,
  [
    param('invoiceId').isUUID(),
    param('paymentId').isUUID()
  ],
  validate,
  async (req, res) => {
    try {
      const result = await invoiceService.deletePayment(
        req.tenant.id,
        req.params.paymentId
      );
      res.json({
        success: true,
        message: 'Payment deleted successfully',
        deleted_payment: result.deleted_payment,
        invoice: result.invoice
      });
    } catch (error) {
      console.error('Delete payment error:', error);
      const statusCode = error.message === 'Payment not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to delete payment',
        message: error.message
      });
    }
  }
);

module.exports = router;
