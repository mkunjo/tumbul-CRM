// Project management API endpoints

const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const projectService = require('../services/projectService');
const { authenticate, checkUsageLimit } = require('../middleware/auth');

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
 * GET /api/projects
 * Get all projects with filtering
 */
router.get('/',
  authenticate,
  [
    query('status').optional().isIn(['active', 'completed', 'on_hold', 'canceled']),
    query('clientId').optional().isUUID(),
    query('search').optional().trim(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const { status, clientId, search, limit, offset } = req.query;
      
      const result = await projectService.getProjects(req.tenant.id, {
        status,
        clientId,
        search: search || '',
        limit: limit || 50,
        offset: offset || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Get projects error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch projects',
        message: error.message 
      });
    }
  }
);

/**
 * GET /api/projects/stats
 * Get project statistics
 */
router.get('/stats',
  authenticate,
  async (req, res) => {
    try {
      const stats = await projectService.getProjectStats(req.tenant.id);
      res.json(stats);
    } catch (error) {
      console.error('Get project stats error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch statistics',
        message: error.message 
      });
    }
  }
);

/**
 * GET /api/projects/status-summary
 * Get projects grouped by status
 */
router.get('/status-summary',
  authenticate,
  async (req, res) => {
    try {
      const summary = await projectService.getStatusSummary(req.tenant.id);
      res.json({ summary });
    } catch (error) {
      console.error('Get status summary error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch status summary',
        message: error.message 
      });
    }
  }
);

/**
 * GET /api/projects/:id
 * Get single project by ID
 */
router.get('/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      const project = await projectService.getProjectById(req.tenant.id, req.params.id);
      res.json(project);
    } catch (error) {
      console.error('Get project error:', error);
      const statusCode = error.message === 'Project not found' ? 404 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to fetch project',
        message: error.message 
      });
    }
  }
);

/**
 * GET /api/projects/:id/timeline
 * Get project activity timeline
 */
router.get('/:id/timeline',
  authenticate,
  [
    param('id').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt()
  ],
  validate,
  async (req, res) => {
    try {
      const timeline = await projectService.getProjectTimeline(
        req.tenant.id,
        req.params.id,
        { limit: req.query.limit || 50 }
      );
      res.json({ timeline });
    } catch (error) {
      console.error('Get project timeline error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch timeline',
        message: error.message 
      });
    }
  }
);

/**
 * POST /api/projects
 * Create new project
 */
router.post('/',
  authenticate,
  checkUsageLimit('projects'),
  [
    body('clientId').isUUID().withMessage('Valid client ID is required'),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('description').optional().trim(),
    body('status').optional().isIn(['active', 'completed', 'on_hold', 'canceled']),
    body('startDate').optional().isISO8601(),
    body('estimatedCompletion').optional().isISO8601(),
    body('totalAmount').optional().isFloat({ min: 0 })
  ],
  validate,
  async (req, res) => {
    try {
      const project = await projectService.createProject(req.tenant.id, req.body);
      
      res.status(201).json({
        project,
        usageInfo: req.usageInfo
      });
    } catch (error) {
      console.error('Create project error:', error);
      const statusCode = error.message === 'Client not found' ? 404 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to create project',
        message: error.message 
      });
    }
  }
);

/**
 * PUT /api/projects/:id
 * Update project
 */
router.put('/:id',
  authenticate,
  [
    param('id').isUUID(),
    body('title').optional().trim().notEmpty(),
    body('description').optional().trim(),
    body('status').optional().isIn(['active', 'completed', 'on_hold', 'canceled']),
    body('startDate').optional().isISO8601(),
    body('estimatedCompletion').optional().isISO8601(),
    body('actualCompletion').optional().isISO8601(),
    body('totalAmount').optional().isFloat({ min: 0 })
  ],
  validate,
  async (req, res) => {
    try {
      const project = await projectService.updateProject(
        req.tenant.id,
        req.params.id,
        req.body
      );
      
      res.json(project);
    } catch (error) {
      console.error('Update project error:', error);
      const statusCode = error.message === 'Project not found' ? 404 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to update project',
        message: error.message 
      });
    }
  }
);

/**
 * PATCH /api/projects/:id/status
 * Update only project status (common operation)
 */
router.patch('/:id/status',
  authenticate,
  [
    param('id').isUUID(),
    body('status').isIn(['active', 'completed', 'on_hold', 'canceled'])
  ],
  validate,
  async (req, res) => {
    try {
      const project = await projectService.updateProject(
        req.tenant.id,
        req.params.id,
        { status: req.body.status }
      );
      
      res.json({
        message: 'Project status updated',
        project
      });
    } catch (error) {
      console.error('Update project status error:', error);
      const statusCode = error.message === 'Project not found' ? 404 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to update status',
        message: error.message 
      });
    }
  }
);

/**
 * DELETE /api/projects/:id
 * Delete project and all related data
 */
router.delete('/:id',
  authenticate,
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    try {
      await projectService.deleteProject(req.tenant.id, req.params.id);
      res.json({ 
        success: true,
        message: 'Project deleted successfully' 
      });
    } catch (error) {
      console.error('Delete project error:', error);
      const statusCode = error.message === 'Project not found' ? 404 : 500;
      res.status(statusCode).json({ 
        error: 'Failed to delete project',
        message: error.message 
      });
    }
  }
);

module.exports = router;