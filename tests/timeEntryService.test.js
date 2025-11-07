// Unit tests for Time Entry Service

const timeEntryService = require('../services/timeEntryService');
const { queryWithTenant } = require('../config/database');

// Mock database module
jest.mock('../config/database');

describe('TimeEntryService', () => {
  const mockTenantId = '123e4567-e89b-12d3-a456-426614174000';
  const mockProjectId = '223e4567-e89b-12d3-a456-426614174000';
  const mockTimeEntryId = '323e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTimeEntries', () => {
    it('should return paginated time entries', async () => {
      const mockEntries = [
        {
          id: mockTimeEntryId,
          start_time: '2025-01-15T09:00:00Z',
          end_time: '2025-01-15T11:00:00Z',
          duration_minutes: 120,
          description: 'Working on project'
        }
      ];

      queryWithTenant
        .mockResolvedValueOnce({ rows: mockEntries })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await timeEntryService.getTimeEntries(mockTenantId, {
        limit: 50,
        offset: 0
      });

      expect(result.timeEntries).toEqual(mockEntries);
      expect(result.total).toBe(1);
      expect(queryWithTenant).toHaveBeenCalledTimes(2);
    });

    it('should filter by project ID', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await timeEntryService.getTimeEntries(mockTenantId, {
        projectId: mockProjectId,
        limit: 50,
        offset: 0
      });

      const firstCall = queryWithTenant.mock.calls[0];
      expect(firstCall[2]).toContain(mockProjectId);
    });

    it('should filter by date range', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await timeEntryService.getTimeEntries(mockTenantId, {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        limit: 50,
        offset: 0
      });

      const firstCall = queryWithTenant.mock.calls[0];
      expect(firstCall[2]).toContain('2025-01-01');
      expect(firstCall[2]).toContain('2025-01-31');
    });

    it('should filter by running status', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await timeEntryService.getTimeEntries(mockTenantId, {
        isRunning: true,
        limit: 50,
        offset: 0
      });

      const firstCall = queryWithTenant.mock.calls[0];
      expect(firstCall[1]).toContain('end_time IS NULL');
    });
  });

  describe('getTimeEntryById', () => {
    it('should return time entry with details', async () => {
      const mockEntry = {
        id: mockTimeEntryId,
        start_time: '2025-01-15T09:00:00Z',
        end_time: '2025-01-15T11:00:00Z',
        duration_minutes: 120,
        project_title: 'Kitchen Renovation'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockEntry] });

      const result = await timeEntryService.getTimeEntryById(mockTenantId, mockTimeEntryId);

      expect(result).toEqual(mockEntry);
      expect(queryWithTenant).toHaveBeenCalledWith(
        mockTenantId,
        expect.any(String),
        [mockTenantId, mockTimeEntryId]
      );
    });

    it('should throw error if time entry not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        timeEntryService.getTimeEntryById(mockTenantId, mockTimeEntryId)
      ).rejects.toThrow('Time entry not found');
    });
  });

  describe('startTimer', () => {
    it('should start a new timer', async () => {
      const timerData = {
        projectId: mockProjectId,
        description: 'Working on feature'
      };

      const mockCreatedEntry = {
        id: mockTimeEntryId,
        project_id: mockProjectId,
        start_time: '2025-01-15T09:00:00Z',
        end_time: null,
        description: 'Working on feature'
      };

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] }) // Project check
        .mockResolvedValueOnce({ rows: [] }) // No running timer
        .mockResolvedValueOnce({ rows: [mockCreatedEntry] }); // Insert

      const result = await timeEntryService.startTimer(mockTenantId, timerData);

      expect(result.project_id).toBe(mockProjectId);
      expect(result.end_time).toBeNull();
    });

    it('should throw error if project not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        timeEntryService.startTimer(mockTenantId, {
          projectId: mockProjectId,
          description: 'Test'
        })
      ).rejects.toThrow('Project not found');
    });

    it('should throw error if timer already running', async () => {
      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] })
        .mockResolvedValueOnce({ rows: [{ id: 'running-timer-id' }] });

      await expect(
        timeEntryService.startTimer(mockTenantId, {
          projectId: mockProjectId
        })
      ).rejects.toThrow('A timer is already running');
    });
  });

  describe('stopTimer', () => {
    it('should stop a running timer', async () => {
      const mockStoppedEntry = {
        id: mockTimeEntryId,
        start_time: '2025-01-15T09:00:00Z',
        end_time: '2025-01-15T11:00:00Z',
        duration_minutes: 120
      };

      queryWithTenant.mockResolvedValue({ rows: [mockStoppedEntry] });

      const result = await timeEntryService.stopTimer(mockTenantId, mockTimeEntryId);

      expect(result.end_time).toBeDefined();
      expect(result.duration_minutes).toBe(120);
    });

    it('should throw error if timer not found or already stopped', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        timeEntryService.stopTimer(mockTenantId, mockTimeEntryId)
      ).rejects.toThrow('Time entry not found or already stopped');
    });
  });

  describe('getRunningTimer', () => {
    it('should return running timer', async () => {
      const mockRunningTimer = {
        id: mockTimeEntryId,
        start_time: '2025-01-15T09:00:00Z',
        end_time: null
      };

      queryWithTenant.mockResolvedValue({ rows: [mockRunningTimer] });

      const result = await timeEntryService.getRunningTimer(mockTenantId);

      expect(result).toEqual(mockRunningTimer);
      expect(result.end_time).toBeNull();
    });

    it('should return null if no running timer', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      const result = await timeEntryService.getRunningTimer(mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('createManualEntry', () => {
    it('should create manual time entry', async () => {
      const entryData = {
        projectId: mockProjectId,
        startTime: '2025-01-15T09:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
        description: 'Manual entry'
      };

      const mockCreatedEntry = {
        id: mockTimeEntryId,
        ...entryData,
        duration_minutes: 120
      };

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockProjectId }] })
        .mockResolvedValueOnce({ rows: [mockCreatedEntry] });

      const result = await timeEntryService.createManualEntry(mockTenantId, entryData);

      expect(result.duration_minutes).toBe(120);
    });

    it('should throw error if end time before start time', async () => {
      queryWithTenant.mockResolvedValueOnce({ rows: [{ id: mockProjectId }] });

      await expect(
        timeEntryService.createManualEntry(mockTenantId, {
          projectId: mockProjectId,
          startTime: '2025-01-15T11:00:00Z',
          endTime: '2025-01-15T09:00:00Z'
        })
      ).rejects.toThrow('End time must be after start time');
    });

    it('should throw error if project not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        timeEntryService.createManualEntry(mockTenantId, {
          projectId: mockProjectId,
          startTime: '2025-01-15T09:00:00Z',
          endTime: '2025-01-15T11:00:00Z'
        })
      ).rejects.toThrow('Project not found');
    });
  });

  describe('updateTimeEntry', () => {
    it('should update time entry fields', async () => {
      const updates = {
        description: 'Updated description',
        end_time: '2025-01-15T12:00:00Z'
      };

      const mockUpdatedEntry = {
        id: mockTimeEntryId,
        ...updates
      };

      queryWithTenant
        .mockResolvedValueOnce({ rows: [{ id: mockTimeEntryId }] })
        .mockResolvedValueOnce({ rows: [mockUpdatedEntry] });

      const result = await timeEntryService.updateTimeEntry(
        mockTenantId,
        mockTimeEntryId,
        updates
      );

      expect(result.description).toBe('Updated description');
    });

    it('should throw error if no valid fields provided', async () => {
      await expect(
        timeEntryService.updateTimeEntry(mockTenantId, mockTimeEntryId, {
          invalidField: 'value'
        })
      ).rejects.toThrow('No valid fields to update');
    });

    it('should throw error if time entry not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        timeEntryService.updateTimeEntry(mockTenantId, mockTimeEntryId, {
          description: 'Test'
        })
      ).rejects.toThrow('Time entry not found');
    });

    it('should validate times if both provided', async () => {
      queryWithTenant.mockResolvedValueOnce({ rows: [{ id: mockTimeEntryId }] });

      await expect(
        timeEntryService.updateTimeEntry(mockTenantId, mockTimeEntryId, {
          start_time: '2025-01-15T11:00:00Z',
          end_time: '2025-01-15T09:00:00Z'
        })
      ).rejects.toThrow('End time must be after start time');
    });
  });

  describe('deleteTimeEntry', () => {
    it('should delete time entry', async () => {
      queryWithTenant.mockResolvedValue({ rows: [{ id: mockTimeEntryId }] });

      const result = await timeEntryService.deleteTimeEntry(mockTenantId, mockTimeEntryId);

      expect(result.success).toBe(true);
      expect(result.id).toBe(mockTimeEntryId);
    });

    it('should throw error if time entry not found', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await expect(
        timeEntryService.deleteTimeEntry(mockTenantId, mockTimeEntryId)
      ).rejects.toThrow('Time entry not found');
    });
  });

  describe('getProjectTimeEntries', () => {
    it('should return all time entries for a project', async () => {
      const mockEntries = [
        { id: '1', duration_minutes: 60 },
        { id: '2', duration_minutes: 90 }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockEntries });

      const result = await timeEntryService.getProjectTimeEntries(
        mockTenantId,
        mockProjectId
      );

      expect(result).toEqual(mockEntries);
      expect(result.length).toBe(2);
    });
  });

  describe('getTimeEntryStats', () => {
    it('should return time entry statistics', async () => {
      const mockStats = {
        total_entries: '25',
        running_timers: '1',
        completed_entries: '24',
        total_minutes: '1500',
        average_minutes: '60',
        min_minutes: '15',
        max_minutes: '240'
      };

      queryWithTenant.mockResolvedValue({ rows: [mockStats] });

      const result = await timeEntryService.getTimeEntryStats(mockTenantId);

      expect(result).toEqual(mockStats);
      expect(result.total_entries).toBe('25');
      expect(result.total_minutes).toBe('1500');
    });

    it('should filter stats by project', async () => {
      queryWithTenant.mockResolvedValue({ rows: [{}] });

      await timeEntryService.getTimeEntryStats(mockTenantId, {
        projectId: mockProjectId
      });

      const call = queryWithTenant.mock.calls[0];
      expect(call[2]).toContain(mockProjectId);
    });

    it('should filter stats by date range', async () => {
      queryWithTenant.mockResolvedValue({ rows: [{}] });

      await timeEntryService.getTimeEntryStats(mockTenantId, {
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      });

      const call = queryWithTenant.mock.calls[0];
      expect(call[2]).toContain('2025-01-01');
      expect(call[2]).toContain('2025-01-31');
    });
  });

  describe('getTimeEntriesByProject', () => {
    it('should return time entries grouped by project', async () => {
      const mockProjects = [
        {
          project_id: mockProjectId,
          project_title: 'Kitchen Renovation',
          client_name: 'John Doe',
          entry_count: '10',
          total_minutes: '600',
          average_minutes: '60'
        }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockProjects });

      const result = await timeEntryService.getTimeEntriesByProject(mockTenantId);

      expect(result).toEqual(mockProjects);
      expect(result[0].entry_count).toBe('10');
    });

    it('should filter by date range', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await timeEntryService.getTimeEntriesByProject(mockTenantId, {
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      });

      const call = queryWithTenant.mock.calls[0];
      expect(call[2]).toContain('2025-01-01');
      expect(call[2]).toContain('2025-01-31');
    });
  });

  describe('getDailySummary', () => {
    it('should return daily time summary', async () => {
      const mockSummary = [
        { date: '2025-01-15', entry_count: '5', total_minutes: '300' },
        { date: '2025-01-14', entry_count: '3', total_minutes: '180' }
      ];

      queryWithTenant.mockResolvedValue({ rows: mockSummary });

      const result = await timeEntryService.getDailySummary(mockTenantId);

      expect(result).toEqual(mockSummary);
      expect(result.length).toBe(2);
    });

    it('should filter by date range', async () => {
      queryWithTenant.mockResolvedValue({ rows: [] });

      await timeEntryService.getDailySummary(mockTenantId, {
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      });

      const call = queryWithTenant.mock.calls[0];
      expect(call[2]).toContain('2025-01-01');
      expect(call[2]).toContain('2025-01-31');
    });
  });

  describe('Utility Methods', () => {
    describe('calculateElapsedMinutes', () => {
      it('should calculate elapsed minutes', () => {
        const pastTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
        const result = timeEntryService.calculateElapsedMinutes(pastTime);

        expect(result).toBeGreaterThanOrEqual(59);
        expect(result).toBeLessThanOrEqual(61);
      });
    });

    describe('formatDuration', () => {
      it('should format duration correctly', () => {
        const result = timeEntryService.formatDuration(125);

        expect(result.hours).toBe(2);
        expect(result.minutes).toBe(5);
        expect(result.formatted).toBe('2h 5m');
        expect(result.totalMinutes).toBe(125);
      });

      it('should handle zero minutes', () => {
        const result = timeEntryService.formatDuration(0);

        expect(result.hours).toBe(0);
        expect(result.minutes).toBe(0);
        expect(result.formatted).toBe('0h 0m');
      });

      it('should handle whole hours', () => {
        const result = timeEntryService.formatDuration(120);

        expect(result.hours).toBe(2);
        expect(result.minutes).toBe(0);
        expect(result.formatted).toBe('2h 0m');
      });
    });
  });
});
