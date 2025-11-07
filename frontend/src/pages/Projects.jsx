import { useState, useCallback, useMemo } from 'react';
import { projectsAPI } from '../services/api';
import { format } from 'date-fns';
import { useProjects } from '../hooks/useProjects';
import { useClients } from '../hooks/useClients';
import '../pages/Clients.css';

const Projects = () => {
  // Use SWR hooks for data fetching with caching
  const { projects, isLoading: projectsLoading, mutate: mutateProjects } = useProjects();
  const { clients, isLoading: clientsLoading } = useClients();

  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formData, setFormData] = useState({
    clientId: '',
    title: '',
    description: '',
    status: 'active',
    totalAmount: '',
    startDate: '',
    estimatedCompletion: '',
  });

  const loading = projectsLoading || clientsLoading;

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      if (editingProject) {
        await projectsAPI.update(editingProject.id, formData);
      } else {
        await projectsAPI.create(formData);
      }
      setShowModal(false);
      resetForm();
      // Revalidate cache after mutation
      mutateProjects();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save project');
    }
  }, [editingProject, formData, mutateProjects]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      // Optimistic update
      mutateProjects(
        projects.filter((p) => p.id !== id),
        false
      );

      await projectsAPI.delete(id);
      mutateProjects();
    } catch (err) {
      alert('Failed to delete project');
      mutateProjects();
    }
  }, [projects, mutateProjects]);

  const openEditModal = useCallback((project) => {
    setEditingProject(project);
    setFormData({
      clientId: project.client_id,
      title: project.title,
      description: project.description || '',
      status: project.status,
      totalAmount: project.total_amount || '',
      startDate: project.start_date ? project.start_date.split('T')[0] : '',
      estimatedCompletion: project.estimated_completion ? project.estimated_completion.split('T')[0] : '',
    });
    setShowModal(true);
  }, []);

  const resetForm = useCallback(() => {
    setFormData({
      clientId: '',
      title: '',
      description: '',
      status: 'active',
      totalAmount: '',
      startDate: '',
      estimatedCompletion: '',
    });
    setEditingProject(null);
  }, []);

  const getStatusBadge = useCallback((status) => {
    const badges = {
      active: 'success',
      completed: 'primary',
      on_hold: 'warning',
      canceled: 'danger',
    };
    return `badge badge-${badges[status] || 'secondary'}`;
  }, []);

  if (loading && !projects && !clients) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div className="clients-page">
      <div className="page-header">
        <h1>Projects</h1>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
          + Add Project
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          {projects && projects.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Budget</th>
                  <th>Start Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td><div className="client-name">{project.title}</div></td>
                    <td>{project.client_name}</td>
                    <td><span className={getStatusBadge(project.status)}>{project.status}</span></td>
                    <td>${project.total_amount || 0}</td>
                    <td>{project.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '-'}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-sm btn-outline" onClick={() => openEditModal(project)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(project.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📁</div>
              <h3>No projects found</h3>
              <p>Create your first project</p>
              <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>+ Add Project</button>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingProject ? 'Edit Project' : 'Add New Project'}</h2>
              <button className="btn btn-sm btn-outline" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Client *</label>
                  <select className="form-select" value={formData.clientId} onChange={(e) => setFormData({ ...formData, clientId: e.target.value })} required>
                    <option value="">Select a client</option>
                    {clients && clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Project Name *</label>
                  <input type="text" className="form-input" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                </div>

                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Budget</label>
                  <input type="number" className="form-input" value={formData.totalAmount} onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })} />
                </div>

                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input type="date" className="form-input" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} />
                </div>

                <div className="form-group">
                  <label className="form-label">Estimated Completion</label>
                  <input type="date" className="form-input" value={formData.estimatedCompletion} onChange={(e) => setFormData({ ...formData, estimatedCompletion: e.target.value })} />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingProject ? 'Update' : 'Create'} Project</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Projects;
