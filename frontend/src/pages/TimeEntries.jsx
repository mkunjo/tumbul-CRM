import { useState, useEffect, useRef, useCallback } from 'react';
import { timeEntriesAPI } from '../services/api';
import { format, differenceInSeconds } from 'date-fns';
import { useTimeEntries, useRunningTimer } from '../hooks/useTimeEntries';
import { useProjects } from '../hooks/useProjects';
import './TimeEntries.css';

const TimeEntries = () => {
  // Use SWR hooks for data fetching with caching
  const { timeEntries, isLoading: entriesLoading, mutate: mutateTimeEntries } = useTimeEntries();
  const { runningTimer, mutate: mutateRunningTimer } = useRunningTimer();
  const { projects, isLoading: projectsLoading } = useProjects();

  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerIntervalRef = useRef(null);
  const [formData, setFormData] = useState({
    projectId: '',
    description: '',
    startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    endTime: '',
  });

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
      startTimerInterval();
    } else {
      stopTimerInterval();
    }
  }, [runningTimer]);

  const startTimerInterval = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const updateElapsedTime = () => {
      if (runningTimer) {
        const start = new Date(runningTimer.start_time);
        const now = new Date();
        setElapsedTime(differenceInSeconds(now, start));
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
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to start timer');
    }
  }, [mutateRunningTimer, mutateTimeEntries]);

  const handleStopTimer = useCallback(async () => {
    if (!runningTimer) return;

    try {
      await timeEntriesAPI.stop(runningTimer.id);
      mutateRunningTimer(null);
      stopTimerInterval();
      mutateTimeEntries();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to stop timer');
    }
  }, [runningTimer, mutateRunningTimer, mutateTimeEntries]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      if (editingEntry) {
        await timeEntriesAPI.update(editingEntry.id, formData);
      } else {
        await timeEntriesAPI.create(formData);
      }
      setShowModal(false);
      resetForm();
      mutateTimeEntries();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save time entry');
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
    } catch (err) {
      alert('Failed to delete time entry');
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

  if (loading && !timeEntries && !projects) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

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
                      {runningTimer.project_name && <span> / {runningTimer.project_name}</span>}
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
          {timeEntries && timeEntries.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Client</th>
                  <th>Project</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {timeEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.start_time ? format(new Date(entry.start_time), 'MMM d, yyyy') : '-'}</td>
                    <td>
                      <div className="entry-description">{entry.description}</div>
                    </td>
                    <td>{entry.client_name || '-'}</td>
                    <td>{entry.project_name || '-'}</td>
                    <td>{entry.start_time ? format(new Date(entry.start_time), 'h:mm a') : '-'}</td>
                    <td>{entry.end_time ? format(new Date(entry.end_time), 'h:mm a') : '-'}</td>
                    <td>
                      <span className="duration-badge">{formatDurationMinutes(entry.duration_minutes)}</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => openEditModal(entry)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(entry.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">⏱️</div>
              <h3>No time entries yet</h3>
              <p>Start tracking time for your projects</p>
            </div>
          )}
        </div>
      </div>

      {/* Manual Entry Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
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
        </div>
      )}
    </div>
  );
};

export default TimeEntries;
