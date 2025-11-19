import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { timeEntriesAPI } from '../services/api';
import { format, differenceInSeconds } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useTimeEntries, useRunningTimer } from '../hooks/useTimeEntries';
import { useProjects } from '../hooks/useProjects';
import DataTable from '../components/DataTable';
import ErrorBoundary from '../components/ErrorBoundary';
import FocusLock from 'react-focus-lock';
import './TimeEntries.css';

const TimeEntries = () => {
  // Use SWR hooks for data fetching with caching
  const { timeEntries, isLoading: entriesLoading, mutate: mutateTimeEntries } = useTimeEntries();
  const { runningTimer, mutate: mutateRunningTimer } = useRunningTimer();
  const { projects, isLoading: projectsLoading } = useProjects();

  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerIntervalRef = useRef(null);
  const timerStartRef = useRef(null); // Track when timer started in UI
  const [formData, setFormData] = useState({
    projectId: '',
    description: '',
    startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    endTime: '',
  });

  // Get user's timezone
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const loading = entriesLoading || projectsLoading;

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (runningTimer) {
      // Set timer start reference if not already set
      if (!timerStartRef.current) {
        timerStartRef.current = new Date();
      }
      startTimerInterval();
    } else {
      stopTimerInterval();
      timerStartRef.current = null;
    }
  }, [runningTimer]);

  const startTimerInterval = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    //Calculate elapsed time from the database `start_time`, not the UI reference:
    const updateElapsedTime = () => {
      if (runningTimer?.start_time) {
          const now = new Date();
          const startTime = new Date(runningTimer.start_time);
          setElapsedTime(differenceInSeconds(now, startTime));
        }
    };

    updateElapsedTime();
    timerIntervalRef.current = setInterval(updateElapsedTime, 1000);
  };

  const stopTimerInterval = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setElapsedTime(0);
  };

  const handleStartTimer = useCallback(async (projectId, description) => {
    try {
      const response = await timeEntriesAPI.start({
        projectId: projectId,
        description: description,
      });
      mutateRunningTimer(response.data.timeEntry);
      mutateTimeEntries();
      toast.success('Timer started successfully');
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to start timer';
      toast.error(message);
    }
  }, [mutateRunningTimer, mutateTimeEntries]);

  const handleStopTimer = useCallback(async () => {
    if (!runningTimer) return;

    try {
      await timeEntriesAPI.stop(runningTimer.id);
      mutateRunningTimer(null);
      stopTimerInterval();
      mutateTimeEntries();
      toast.success('Timer stopped successfully');
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to stop timer';
      toast.error(message);
    }
  }, [runningTimer, mutateRunningTimer, mutateTimeEntries]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      if (editingEntry) {
        await timeEntriesAPI.update(editingEntry.id, formData);
        toast.success('Time entry updated successfully');
      } else {
        await timeEntriesAPI.create(formData);
        toast.success('Time entry created successfully');
      }
      setShowModal(false);
      resetForm();
      mutateTimeEntries();
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to save time entry';
      toast.error(message);
    }
  }, [editingEntry, formData, mutateTimeEntries]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Are you sure you want to delete this time entry?')) return;
    try {
      // Optimistic update
      mutateTimeEntries(
        timeEntries.filter((entry) => entry.id !== id),
        false
      );
      await timeEntriesAPI.delete(id);
      mutateTimeEntries();
      toast.success('Time entry deleted successfully');
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to delete time entry';
      toast.error(message);
      mutateTimeEntries();
    }
  }, [timeEntries, mutateTimeEntries]);

  const openEditModal = useCallback((entry) => {
    setEditingEntry(entry);
    setFormData({
      projectId: entry.project_id || '',
      description: entry.description,
      startTime: entry.start_time ? format(new Date(entry.start_time), "yyyy-MM-dd'T'HH:mm") : '',
      endTime: entry.end_time ? format(new Date(entry.end_time), "yyyy-MM-dd'T'HH:mm") : '',
    });
    setShowModal(true);
  }, []);

  const resetForm = useCallback(() => {
    setFormData({
      projectId: '',
      description: '',
      startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      endTime: '',
    });
    setEditingEntry(null);
  }, []);

  const formatDuration = useCallback((seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const formatDurationMinutes = useCallback((minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }, []);

  const getTotalHours = useCallback(() => {
    const totalMinutes = timeEntries ? timeEntries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0) : 0;
    return (totalMinutes / 60).toFixed(1);
  }, [timeEntries]);

  // Bulk delete selected time entries
  const handleBulkDelete = useCallback(async () => {
    if (!confirm(`Are you sure you want to delete ${selectedEntries.length} time entry(ies)?`)) return;

    try {
      await Promise.all(selectedEntries.map(id => timeEntriesAPI.delete(id)));
      setSelectedEntries([]);
      mutateTimeEntries();
      toast.success(`${selectedEntries.length} time entry(ies) deleted successfully`);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to delete some time entries';
      toast.error(message);
      mutateTimeEntries();
    }
  }, [selectedEntries, mutateTimeEntries]);

  // Define table columns
  const columns = useMemo(() => [
    {
      key: 'start_time',
      label: 'Date',
      sortable: true,
      render: (entry) => entry.start_time ? format(new Date(entry.start_time), 'MMM d, yyyy') : '-',
    },
    {
      key: 'description',
      label: 'Description',
      sortable: false,
      render: (entry) => <div className="entry-description">{entry.description}</div>,
    },
    {
      key: 'client_name',
      label: 'Client',
      sortable: true,
      render: (entry) => entry.client_name || '-',
    },
    {
      key: 'project_title',
      label: 'Project',
      sortable: true,
      render: (entry) => entry.project_title || '-',
    },
    {
      key: 'start_time_formatted',
      label: 'Start Time',
      sortable: false,
      render: (entry) => entry.start_time ? (
        <span title={userTimezone}>
          {formatInTimeZone(new Date(entry.start_time), userTimezone, 'h:mm a zzz')}
        </span>
      ) : '-',
    },
    {
      key: 'end_time',
      label: 'End Time',
      sortable: false,
      render: (entry) => entry.end_time ? (
        <span title={userTimezone}>
          {formatInTimeZone(new Date(entry.end_time), userTimezone, 'h:mm a zzz')}
        </span>
      ) : '-',
    },
    {
      key: 'duration_minutes',
      label: 'Duration',
      sortable: true,
      render: (entry) => <span className="duration-badge">{formatDurationMinutes(entry.duration_minutes)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (entry) => (
        <div className="table-actions">
          <button className="btn btn-sm btn-outline" onClick={() => openEditModal(entry)}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(entry.id)}>Delete</button>
        </div>
      ),
    },
  ], [userTimezone, formatInTimeZone, formatDurationMinutes, openEditModal, handleDelete]);

  return (
    <div className="time-entries-page">
      <div className="page-header">
        <div>
          <h1>Time Tracking</h1>
          <div className="time-summary">
            Total Hours Tracked: <strong>{getTotalHours()}h</strong>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          + Add Manual Entry
        </button>
      </div>

      {/* Active Timer Section */}
      <div className="timer-section">
        <div className="card">
          <div className="card-body">
            {runningTimer ? (
              <div className="active-timer">
                <div className="timer-display">
                  <div className="timer-time">{formatDuration(elapsedTime)}</div>
                  <div className="timer-label">Timer Running</div>
                </div>
                <div className="timer-details">
                  <div className="timer-info">
                    <div className="timer-description">{runningTimer.description || 'No description'}</div>
                    <div className="timer-meta">
                      {runningTimer.client_name && <span>{runningTimer.client_name}</span>}
                      {/* Fixed: Backend returns 'project_title', not 'project_name' */}
                      {runningTimer.project_title && <span> / {runningTimer.project_title}</span>}
                    </div>
                  </div>
                  <button className="btn btn-danger" onClick={handleStopTimer}>
                    ⏹ Stop Timer
                  </button>
                </div>
              </div>
            ) : (
              <div className="timer-start">
                <div className="timer-form">
                  <select
                    className="form-select timer-select"
                    onChange={(e) => {
                      const projectId = e.target.value;
                      const description = e.target.options[e.target.selectedIndex].text;
                      if (projectId) {
                        handleStartTimer(projectId, `Work on ${description}`);
                      }
                    }}
                    value=""
                  >
                    <option value="">Select project to start timer...</option>
                    {projects && projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.title} ({project.client_name})</option>
                    ))}
                  </select>
                  <div className="timer-hint">
                    Or click a quick start button below
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Start Buttons */}
      {!runningTimer && projects && projects.length > 0 && (
        <div className="quick-start-section">
          <h3>Quick Start</h3>
          <div className="quick-start-grid">
            {projects.slice(0, 6).map((project) => (
              <button
                key={project.id}
                className="quick-start-btn"
                onClick={() => handleStartTimer(project.id, `Work on ${project.title}`)}
              >
                <div className="quick-start-icon">▶️</div>
                <div className="quick-start-content">
                  <div className="quick-start-project">{project.title}</div>
                  <div className="quick-start-client">{project.client_name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Time Entries List */}
      <div className="card">
        <div className="card-header">
          <h3>Time Entries</h3>
        </div>
        <div className="card-body">
          <ErrorBoundary>
            <DataTable
              data={timeEntries || []}
              columns={columns}
              loading={entriesLoading}
              onSelectionChange={setSelectedEntries}
              selectable={true}
              searchPlaceholder="Search time entries by description, client, or project..."
              searchFields={['description', 'client_name', 'project_title']}
              actions={
                <button
                  className="btn btn-sm btn-danger"
                  onClick={handleBulkDelete}
                >
                  Delete Selected
                </button>
              }
              emptyState={
                <div className="empty-state">
                  <div className="empty-icon">⏱️</div>
                  <h3>No time entries yet</h3>
                  <p>Start tracking time for your projects</p>
                </div>
              }
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* Manual Entry Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <FocusLock returnFocus>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">{editingEntry ? 'Edit Time Entry' : 'Add Manual Time Entry'}</h2>
                <button className="btn btn-sm btn-outline" onClick={() => setShowModal(false)}>✕</button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="form-label">Project *</label>
                    <select
                      className="form-select"
                      value={formData.projectId}
                      onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                      required
                    >
                      <option value="">Select a project</option>
                      {projects && projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.title} ({project.client_name})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="What did you work on?"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Start Time *</label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        value={formData.startTime}
                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">End Time *</label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        value={formData.endTime}
                        onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editingEntry ? 'Update' : 'Add'} Time Entry
                  </button>
                </div>
              </form>
            </div>
          </FocusLock>
        </div>
      )}
    </div>
  );
};

export default TimeEntries;
