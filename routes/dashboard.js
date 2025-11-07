// Dashboard and analytics API endpoints

const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const dashboardService = require('../services/dashboardService');
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
 * GET /api/dashboard
 * Get comprehensive dashboard overview
 */
router.get('/',
  authenticate,
  async (req, res) => {
    try {
      const overview = await dashboardService.getOverview(req.tenant.id);
      res.json(overview);
    } catch (error) {
      console.error('Get dashboard overview error:', error);
      res.status(500).json({
        error: 'Failed to fetch dashboard overview',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/metrics
 * Get dashboard metrics (alias for overview)
 */
router.get('/metrics',
  authenticate,
  async (req, res) => {
    try {
      const overview = await dashboardService.getOverview(req.tenant.id);
      res.json(overview);
    } catch (error) {
      console.error('Get dashboard metrics error:', error);
      res.status(500).json({
        error: 'Failed to fetch dashboard metrics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/clients
 * Get client statistics
 */
router.get('/clients',
  authenticate,
  async (req, res) => {
    try {
      const stats = await dashboardService.getClientStats(req.tenant.id);
      res.json(stats);
    } catch (error) {
      console.error('Get client stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch client statistics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/projects
 * Get project statistics
 */
router.get('/projects',
  authenticate,
  async (req, res) => {
    try {
      const stats = await dashboardService.getProjectStats(req.tenant.id);
      res.json(stats);
    } catch (error) {
      console.error('Get project stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch project statistics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/invoices
 * Get invoice statistics
 */
router.get('/invoices',
  authenticate,
  async (req, res) => {
    try {
      const stats = await dashboardService.getInvoiceStats(req.tenant.id);
      res.json(stats);
    } catch (error) {
      console.error('Get invoice stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch invoice statistics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/expenses
 * Get expense statistics
 */
router.get('/expenses',
  authenticate,
  async (req, res) => {
    try {
      const stats = await dashboardService.getExpenseStats(req.tenant.id);
      res.json(stats);
    } catch (error) {
      console.error('Get expense stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch expense statistics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/time
 * Get time entry statistics
 */
router.get('/time',
  authenticate,
  async (req, res) => {
    try {
      const stats = await dashboardService.getTimeStats(req.tenant.id);
      res.json(stats);
    } catch (error) {
      console.error('Get time stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch time statistics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/recent-activity
 * Get recent activity feed
 */
router.get('/recent-activity',
  authenticate,
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { limit, offset } = req.query;

      const activity = await dashboardService.getRecentActivity(req.tenant.id, {
        limit: limit || 20,
        offset: offset || 0
      });

      res.json({ activity });
    } catch (error) {
      console.error('Get recent activity error:', error);
      res.status(500).json({
        error: 'Failed to fetch recent activity',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/revenue
 * Get revenue metrics
 */
router.get('/revenue',
  authenticate,
  [
    query('period').optional().isInt({ min: 1, max: 365 }).toInt(),
    query('days').optional().isInt({ min: 1, max: 365 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { period, days } = req.query;

      const metrics = await dashboardService.getRevenueMetrics(req.tenant.id, {
        period: days || period || 30
      });

      res.json(metrics);
    } catch (error) {
      console.error('Get revenue metrics error:', error);
      res.status(500).json({
        error: 'Failed to fetch revenue metrics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/expense-trends
 * Get expense trends
 */
router.get('/expense-trends',
  authenticate,
  [
    query('period').optional().isInt({ min: 1, max: 365 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { period } = req.query;

      const trends = await dashboardService.getExpenseTrends(req.tenant.id, {
        period: period || 30
      });

      res.json(trends);
    } catch (error) {
      console.error('Get expense trends error:', error);
      res.status(500).json({
        error: 'Failed to fetch expense trends',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/top-projects
 * Get top projects by revenue
 */
router.get('/top-projects',
  authenticate,
  [
    query('limit').optional().isInt({ min: 1, max: 20 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { limit } = req.query;

      const projects = await dashboardService.getTopProjects(req.tenant.id, {
        limit: limit || 5
      });

      res.json({ projects });
    } catch (error) {
      console.error('Get top projects error:', error);
      res.status(500).json({
        error: 'Failed to fetch top projects',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/active-projects
 * Get active projects summary
 */
router.get('/active-projects',
  authenticate,
  async (req, res) => {
    try {
      const projects = await dashboardService.getActiveProjects(req.tenant.id);
      res.json({ projects });
    } catch (error) {
      console.error('Get active projects error:', error);
      res.status(500).json({
        error: 'Failed to fetch active projects',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/upcoming-deadlines
 * Get upcoming deadlines
 */
router.get('/upcoming-deadlines',
  authenticate,
  [
    query('days').optional().isInt({ min: 1, max: 90 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { days } = req.query;

      const deadlines = await dashboardService.getUpcomingDeadlines(req.tenant.id, {
        days: days || 14
      });

      res.json({ deadlines });
    } catch (error) {
      console.error('Get upcoming deadlines error:', error);
      res.status(500).json({
        error: 'Failed to fetch upcoming deadlines',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/dashboard/financial-summary
 * Get financial summary
 */
router.get('/financial-summary',
  authenticate,
  async (req, res) => {
    try {
      const summary = await dashboardService.getFinancialSummary(req.tenant.id);
      res.json(summary);
    } catch (error) {
      console.error('Get financial summary error:', error);
      res.status(500).json({
        error: 'Failed to fetch financial summary',
        message: error.message
      });
    }
  }
);

module.exports = router;
