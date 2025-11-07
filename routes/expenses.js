// Expense management API endpoints

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { body, query, param, validationResult } = require('express-validator');
const expenseService = require('../services/expenseService');
const { authenticate } = require('../middleware/auth');

// Configure multer for receipt uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs only
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image and PDF files are allowed'));
    }
  }
});

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
 * GET /api/expenses
 * Get all expenses with optional filtering
 */
router.get('/',
  authenticate,
  [
    query('projectId').optional().isUUID(),
    query('category').optional().trim(),
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate(),
    query('clientApproved').optional().isBoolean().toBoolean(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { projectId, category, startDate, endDate, clientApproved, limit, offset } = req.query;

      const result = await expenseService.getExpenses(req.tenant.id, {
        projectId: projectId || null,
        category: category || null,
        startDate: startDate || null,
        endDate: endDate || null,
        clientApproved: clientApproved !== undefined ? clientApproved : null,
        limit: limit || 50,
        offset: offset || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Get expenses error:', error);
      res.status(500).json({
        error: 'Failed to fetch expenses',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/expenses/stats
 * Get expense statistics
 */
router.get('/stats',
  authenticate,
  [
    query('projectId').optional().isUUID(),
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate()
  ],
  validate,
  async (req, res) => {
    try {
      const { projectId, startDate, endDate } = req.query;

      const stats = await expenseService.getExpenseStats(req.tenant.id, {
        projectId: projectId || null,
        startDate: startDate || null,
        endDate: endDate || null
      });

      res.json(stats);
    } catch (error) {
      console.error('Get expense stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch statistics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/expenses/by-category
 * Get expenses grouped by category
 */
router.get('/by-category',
  authenticate,
  [
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate()
  ],
  validate,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const categories = await expenseService.getExpensesByCategory(req.tenant.id, {
        startDate: startDate || null,
        endDate: endDate || null
      });

      res.json({ categories });
    } catch (error) {
      console.error('Get expenses by category error:', error);
      res.status(500).json({
        error: 'Failed to fetch expenses by category',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/expenses/:id
 * Get single expense by ID
 */
router.get('/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const expense = await expenseService.getExpenseById(req.tenant.id, req.params.id);
      res.json(expense);
    } catch (error) {
      console.error('Get expense error:', error);
      const statusCode = error.message === 'Expense not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to fetch expense',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/expenses/:id/receipt
 * Get signed URL for expense receipt
 */
router.get('/:id/receipt',
  authenticate,
  [
    param('id').isUUID(),
    query('expiresIn').optional().isInt({ min: 60, max: 86400 }).toInt() // 1 min to 24 hours
  ],
  validate,
  async (req, res) => {
    try {
      const expense = await expenseService.getExpenseById(req.tenant.id, req.params.id);

      if (!expense.receipt_photo_s3_key) {
        return res.status(404).json({
          error: 'Receipt not found',
          message: 'This expense does not have a receipt'
        });
      }

      const expiresIn = req.query.expiresIn || 3600; // Default 1 hour
      const url = await expenseService.getReceiptUrl(expense.receipt_photo_s3_key, expiresIn);

      res.json({ url, expiresIn });
    } catch (error) {
      console.error('Get receipt URL error:', error);
      const statusCode = error.message === 'Expense not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to get receipt URL',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/expenses
 * Create new expense (with optional receipt upload)
 */
router.post('/',
  authenticate,
  upload.single('receipt'),
  [
    body('projectId').isUUID().withMessage('Valid project ID is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('category').optional().trim(),
    body('date').optional().isISO8601().toDate(),
    body('notes').optional().trim()
  ],
  validate,
  async (req, res) => {
    try {
      const expense = await expenseService.createExpense(
        req.tenant.id,
        req.body,
        req.file // Multer file object (if uploaded)
      );

      res.status(201).json(expense);
    } catch (error) {
      console.error('Create expense error:', error);
      const statusCode = error.message === 'Project not found' ? 404 :
                         error.message.includes('S3') ? 503 : 500;
      res.status(statusCode).json({
        error: 'Failed to create expense',
        message: error.message
      });
    }
  }
);

/**
 * PUT /api/expenses/:id
 * Update expense (with optional receipt upload)
 */
router.put('/:id',
  authenticate,
  upload.single('receipt'),
  [
    param('id').isUUID(),
    body('description').optional().trim().notEmpty(),
    body('amount').optional().isFloat({ min: 0.01 }),
    body('category').optional().trim(),
    body('date').optional().isISO8601().toDate(),
    body('notes').optional().trim(),
    body('clientApproved').optional().isBoolean().toBoolean()
  ],
  validate,
  async (req, res) => {
    try {
      // Convert clientApproved to client_approved for database
      const updates = { ...req.body };
      if ('clientApproved' in updates) {
        updates.client_approved = updates.clientApproved;
        delete updates.clientApproved;
      }

      const expense = await expenseService.updateExpense(
        req.tenant.id,
        req.params.id,
        updates,
        req.file // Multer file object (if uploaded)
      );

      res.json(expense);
    } catch (error) {
      console.error('Update expense error:', error);
      const statusCode = error.message === 'Expense not found' ? 404 :
                         error.message.includes('No valid fields') ? 400 :
                         error.message.includes('S3') ? 503 : 500;
      res.status(statusCode).json({
        error: 'Failed to update expense',
        message: error.message
      });
    }
  }
);

/**
 * PATCH /api/expenses/:id/approve
 * Approve expense (for client approval workflow)
 */
router.patch('/:id/approve',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const expense = await expenseService.approveExpense(req.tenant.id, req.params.id);
      res.json({
        message: 'Expense approved successfully',
        expense
      });
    } catch (error) {
      console.error('Approve expense error:', error);
      const statusCode = error.message === 'Expense not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to approve expense',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/expenses/:id
 * Delete expense (and receipt from S3)
 */
router.delete('/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      await expenseService.deleteExpense(req.tenant.id, req.params.id);
      res.json({
        success: true,
        message: 'Expense deleted successfully'
      });
    } catch (error) {
      console.error('Delete expense error:', error);
      const statusCode = error.message === 'Expense not found' ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to delete expense',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/expenses/project/:projectId
 * Get all expenses for a project
 */
router.get('/project/:projectId',
  authenticate,
  [param('projectId').isUUID()],
  validate,
  async (req, res) => {
    try {
      const expenses = await expenseService.getProjectExpenses(
        req.tenant.id,
        req.params.projectId
      );
      res.json({ expenses });
    } catch (error) {
      console.error('Get project expenses error:', error);
      res.status(500).json({
        error: 'Failed to fetch project expenses',
        message: error.message
      });
    }
  }
);

module.exports = router;
