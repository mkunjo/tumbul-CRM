// Client portal API endpoints - Read-only access for clients

const express = require('express');
const router = express.Router();
const { query, param, validationResult } = require('express-validator');
const portalService = require('../services/portalService');
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
 * GET /api/portal/info
 * Get client's own information
 */
router.get('/info',
  authenticate,
  async (req, res) => {
    try {
      // Assuming req.user.clientId exists for portal users
      const clientInfo = await portalService.getClientInfo(req.tenant.id, req.user.clientId);
      res.json(clientInfo);
    } catch (error) {
      console.error('Get client info error:', error);

      if (error.message === 'Client not found') {
        return res.status(404).json({
          error: 'Client not found',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Failed to fetch client information',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/portal/projects
 * Get all projects for the authenticated client
 */
router.get('/projects',
  authenticate,
  async (req, res) => {
    try {
      const projects = await portalService.getClientProjects(req.tenant.id, req.user.clientId);
      res.json({ projects });
    } catch (error) {
      console.error('Get client projects error:', error);
      res.status(500).json({
        error: 'Failed to fetch projects',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/portal/projects/:projectId
 * Get single project details
 */
router.get('/projects/:projectId',
  authenticate,
  [
    param('projectId').isUUID().withMessage('Invalid project ID format')
  ],
  validate,
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const project = await portalService.getProjectDetails(
        req.tenant.id,
        req.user.clientId,
        projectId
      );
      res.json(project);
    } catch (error) {
      console.error('Get project details error:', error);

      if (error.message === 'Access denied') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }

      if (error.message === 'Project not found') {
        return res.status(404).json({
          error: 'Project not found',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Failed to fetch project details',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/portal/projects/:projectId/photos
 * Get project photos (only auto-shared ones)
 */
router.get('/projects/:projectId/photos',
  authenticate,
  [
    param('projectId').isUUID().withMessage('Invalid project ID format')
  ],
  validate,
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const photos = await portalService.getProjectPhotos(
        req.tenant.id,
        req.user.clientId,
        projectId
      );
      res.json({ photos });
    } catch (error) {
      console.error('Get project photos error:', error);

      if (error.message === 'Access denied') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }

      res.status(500).json({
        error: 'Failed to fetch project photos',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/portal/projects/:projectId/invoices
 * Get project invoices (client view - no drafts)
 */
router.get('/projects/:projectId/invoices',
  authenticate,
  [
    param('projectId').isUUID().withMessage('Invalid project ID format')
  ],
  validate,
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const invoices = await portalService.getProjectInvoices(
        req.tenant.id,
        req.user.clientId,
        projectId
      );
      res.json({ invoices });
    } catch (error) {
      console.error('Get project invoices error:', error);

      if (error.message === 'Access denied') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }

      res.status(500).json({
        error: 'Failed to fetch project invoices',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/portal/projects/:projectId/expenses
 * Get project expenses
 */
router.get('/projects/:projectId/expenses',
  authenticate,
  [
    param('projectId').isUUID().withMessage('Invalid project ID format')
  ],
  validate,
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const expenses = await portalService.getProjectExpenses(
        req.tenant.id,
        req.user.clientId,
        projectId
      );
      res.json({ expenses });
    } catch (error) {
      console.error('Get project expenses error:', error);

      if (error.message === 'Access denied') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }

      res.status(500).json({
        error: 'Failed to fetch project expenses',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/portal/projects/:projectId/timeline
 * Get project activity timeline
 */
router.get('/projects/:projectId/timeline',
  authenticate,
  [
    param('projectId').isUUID().withMessage('Invalid project ID format'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const { limit } = req.query;

      const timeline = await portalService.getProjectTimeline(
        req.tenant.id,
        req.user.clientId,
        projectId,
        { limit: limit || 50 }
      );

      res.json({ timeline });
    } catch (error) {
      console.error('Get project timeline error:', error);

      if (error.message === 'Access denied') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this project'
        });
      }

      res.status(500).json({
        error: 'Failed to fetch project timeline',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/portal/summary
 * Get client statistics summary
 */
router.get('/summary',
  authenticate,
  async (req, res) => {
    try {
      const summary = await portalService.getClientSummary(req.tenant.id, req.user.clientId);
      res.json(summary);
    } catch (error) {
      console.error('Get client summary error:', error);
      res.status(500).json({
        error: 'Failed to fetch client summary',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/portal/expenses/:expenseId/approve
 * Approve an expense (client action)
 */
router.post('/expenses/:expenseId/approve',
  authenticate,
  [
    param('expenseId').isUUID().withMessage('Invalid expense ID format')
  ],
  validate,
  async (req, res) => {
    try {
      const { expenseId } = req.params;
      const expense = await portalService.approveExpense(
        req.tenant.id,
        req.user.clientId,
        expenseId
      );

      res.json({
        message: 'Expense approved successfully',
        expense
      });
    } catch (error) {
      console.error('Approve expense error:', error);

      if (error.message === 'Expense not found or already approved') {
        return res.status(404).json({
          error: 'Expense not found',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Failed to approve expense',
        message: error.message
      });
    }
  }
);

module.exports = router;
