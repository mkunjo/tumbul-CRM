// Unit tests for Dashboard Service

const dashboardService = require('../services/dashboardService');
const { queryWithTenant } = require('../config/database');

// Mock database module
jest.mock('../config/database');

describe('DashboardService', () => {
  const mockTenantId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOverview', () => {
    it('should return comprehensive dashboard overview', async () => {
      // Mock all the parallel queries
      queryWithTenant.mockResolvedValue({
        rows: [{
          total_clients: '10',
          active_clients: '8',
          total_projects: '15',
          active_projects: '5',
          total_invoices: '25',
          paid_count: '20',
          total_expenses: '50',
          total_entries: '100',
          total_minutes: '6000'
        }]
      });

      const result = await dashboardService.getOverview(mockTenantId);

      expect(result).toHaveProperty('clients');
      expect(result).toHaveProperty('projects');
      expect(result).toHaveProperty('invoices');
      expect(result).toHaveProperty('expenses');
      expect(result).toHaveProperty('time');
      expect(result).toHaveProperty('recentActivity');
    });
  });

  describe('getClientStats', () => {
    it('should return client statistics', async () => {
      const mockStats = {
        total_clients: '50',
        active_clients: '45',
        new_this_month: '5',
        new_this_week: '2'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockStats] });

      const result = await dashboardService.getClientStats(mockTenantId);

      expect(result).toEqual(mockStats);
      expect(result.total_clients).toBe('50');
      expect(result.active_clients).toBe('45');
    });
  });

  describe('getProjectStats', () => {
    it('should return project statistics', async () => {
      const mockStats = {
        total_projects: '25',
        active_projects: '10',
        completed_projects: '12',
        on_hold_projects: '2',
        canceled_projects: '1',
        total_contract_value: '100000.00',
        avg_project_value: '4000.00',
        new_this_month: '3'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockStats] });

      const result = await dashboardService.getProjectStats(mockTenantId);

      expect(result).toEqual(mockStats);
      expect(result.total_projects).toBe('25');
      expect(result.active_projects).toBe('10');
    });
  });

  describe('getInvoiceStats', () => {
    it('should return invoice statistics', async () => {
      const mockStats = {
        total_invoices: '50',
        draft_count: '5',
        sent_count: '10',
        paid_count: '30',
        overdue_count: '5',
        total_amount: '50000.00',
        paid_amount: '35000.00',
        outstanding_amount: '15000.00',
        avg_invoice_amount: '1000.00'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockStats] });

      const result = await dashboardService.getInvoiceStats(mockTenantId);

      expect(result).toEqual(mockStats);
      expect(result.total_invoices).toBe('50');
      expect(result.paid_amount).toBe('35000.00');
    });
  });

  describe('getExpenseStats', () => {
    it('should return expense statistics', async () => {
      const mockStats = {
        total_expenses: '100',
        approved_count: '80',
        pending_approval_count: '20',
        total_amount: '25000.00',
        approved_amount: '20000.00',
        avg_expense_amount: '250.00'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockStats] });

      const result = await dashboardService.getExpenseStats(mockTenantId);

      expect(result).toEqual(mockStats);
      expect(result.total_expenses).toBe('100');
      expect(result.approved_count).toBe('80');
    });
  });

  describe('getTimeStats', () => {
    it('should return time entry statistics with formatted hours', async () => {
      const mockStats = {
        total_entries: '200',
        running_timers: '2',
        total_minutes: '12000',
        avg_minutes: '60',
        entries_this_week: '50'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockStats] });

      const result = await dashboardService.getTimeStats(mockTenantId);

      expect(result.total_entries).toBe('200');
      expect(result.total_hours).toBe(200); // 12000 / 60
      expect(result.avg_hours).toBe(1); // 60 / 60
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent activity feed', async () => {
      const mockActivity = [
        {
          activity_type: 'photo',
          id: '1',
          project_id: '123',
          activity_time: '2025-01-15T10:00:00Z',
          description: 'Photo uploaded',
          project_title: 'Kitchen Renovation',
          client_name: 'John Doe'
        },
        {
          activity_type: 'invoice',
          id: '2',
          project_id: '123',
          activity_time: '2025-01-15T09:00:00Z',
          description: 'Invoice created',
          project_title: 'Kitchen Renovation',
          client_name: 'John Doe'
        }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockActivity });

      const result = await dashboardService.getRecentActivity(mockTenantId, {
        limit: 20,
        offset: 0
      });

      expect(result).toEqual(mockActivity);
      expect(result.length).toBe(2);
    });
  });

  describe('getRevenueMetrics', () => {
    it('should return revenue metrics with totals', async () => {
      const mockDaily = [
        { date: '2025-01-15', invoice_count: '5', revenue: '5000.00' },
        { date: '2025-01-14', invoice_count: '3', revenue: '3000.00' }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockDaily });

      const result = await dashboardService.getRevenueMetrics(mockTenantId, {
        period: 30
      });

      expect(result.daily).toEqual(mockDaily);
      expect(result.totals.revenue).toBe(8000); // 5000 + 3000
      expect(result.totals.invoices).toBe(8); // 5 + 3
      expect(result.totals.avgPerDay).toBe(4000); // 8000 / 2
    });

    it('should handle empty revenue data', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      const result = await dashboardService.getRevenueMetrics(mockTenantId);

      expect(result.daily).toEqual([]);
      expect(result.totals.revenue).toBe(0);
      expect(result.totals.invoices).toBe(0);
      expect(result.totals.avgPerDay).toBe(0);
    });
  });

  describe('getExpenseTrends', () => {
    it('should return expense trends with totals', async () => {
      const mockDaily = [
        { date: '2025-01-15', expense_count: '10', total_amount: '2000.00' },
        { date: '2025-01-14', expense_count: '8', total_amount: '1500.00' }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockDaily });

      const result = await dashboardService.getExpenseTrends(mockTenantId, {
        period: 30
      });

      expect(result.daily).toEqual(mockDaily);
      expect(result.totals.expenses).toBe(3500); // 2000 + 1500
      expect(result.totals.count).toBe(18); // 10 + 8
      expect(result.totals.avgPerDay).toBe(1750); // 3500 / 2
    });
  });

  describe('getTopProjects', () => {
    it('should return top projects with profit calculation', async () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Kitchen Renovation',
          status: 'active',
          client_name: 'John Doe',
          contract_value: '10000.00',
          revenue: '8000.00',
          expenses: '3000.00',
          total_minutes: '600'
        },
        {
          id: '2',
          title: 'Bathroom Remodel',
          status: 'completed',
          client_name: 'Jane Smith',
          contract_value: '5000.00',
          revenue: '5000.00',
          expenses: '2000.00',
          total_minutes: '300'
        }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockProjects });

      const result = await dashboardService.getTopProjects(mockTenantId, {
        limit: 5
      });

      expect(result.length).toBe(2);
      expect(result[0].profit).toBe(5000); // 8000 - 3000
      expect(result[0].hours).toBe(10); // 600 / 60
      expect(result[1].profit).toBe(3000); // 5000 - 2000
      expect(result[1].hours).toBe(5); // 300 / 60
    });
  });

  describe('getActiveProjects', () => {
    it('should return active projects summary', async () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Kitchen Renovation',
          status: 'active',
          start_date: '2025-01-01',
          estimated_completion: '2025-02-01',
          client_name: 'John Doe',
          running_timers: '1',
          overdue_invoices: '0'
        }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockProjects });

      const result = await dashboardService.getActiveProjects(mockTenantId);

      expect(result).toEqual(mockProjects);
      expect(result[0].status).toBe('active');
    });
  });

  describe('getUpcomingDeadlines', () => {
    it('should return upcoming project and invoice deadlines', async () => {
      const mockDeadlines = [
        {
          type: 'project',
          id: '1',
          name: 'Kitchen Renovation',
          deadline: '2025-01-20',
          client_name: 'John Doe',
          days_until: '5'
        },
        {
          type: 'invoice',
          id: '2',
          name: 'INV-20250115-0001',
          deadline: '2025-01-22',
          client_name: 'Jane Smith',
          days_until: '7'
        }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockDeadlines });

      const result = await dashboardService.getUpcomingDeadlines(mockTenantId, {
        days: 14
      });

      expect(result).toEqual(mockDeadlines);
      expect(result.length).toBe(2);
      expect(result[0].type).toBe('project');
      expect(result[1].type).toBe('invoice');
    });
  });

  describe('getFinancialSummary', () => {
    it('should return financial summary with profit calculations', async () => {
      const mockSummary = {
        total_revenue: '50000.00',
        outstanding_revenue: '10000.00',
        total_expenses: '20000.00',
        pending_expenses: '2000.00'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockSummary] });

      const result = await dashboardService.getFinancialSummary(mockTenantId);

      expect(result.total_revenue).toBe('50000.00');
      expect(result.total_expenses).toBe('20000.00');
      expect(result.profit).toBe(30000); // 50000 - 20000
      expect(result.profit_margin).toBe('60.00'); // (30000 / 50000) * 100
    });

    it('should handle zero revenue', async () => {
      const mockSummary = {
        total_revenue: '0',
        outstanding_revenue: '0',
        total_expenses: '5000.00',
        pending_expenses: '1000.00'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockSummary] });

      const result = await dashboardService.getFinancialSummary(mockTenantId);

      expect(result.profit).toBe(-5000); // 0 - 5000
      expect(result.profit_margin).toBe(0); // No revenue = 0% margin
    });
  });
});
