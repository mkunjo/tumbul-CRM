import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { projectsAPI } from '../services/api';
import { format } from 'date-fns';
import { useProjects } from '../hooks/useProjects';
import { useClients } from '../hooks/useClients';
import DataTable from '../components/DataTable';
import ErrorBoundary from '../components/ErrorBoundary';
import FocusLock from 'react-focus-lock';
import { sanitizeFormData, validateAmount } from '../utils/sanitize';
import '../pages/Clients.css';

const Projects = () => {
  // Use SWR hooks for data fetching with caching
  const { projects, isLoading: projectsLoading, mutate: mutateProjects } = useProjects();
  const { clients, isLoading: clientsLoading } = useClients();

  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [selectedProjects, setSelectedProjects] = useState([]);
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

    // Validate amount if provided
    if (formData.totalAmount) {
      const amountValidation = validateAmount(formData.totalAmount);
      if (!amountValidation.isValid) {
        toast.error(amountValidation.error);
        return;
      }
    }

    // Sanitize form data before sending
    const sanitizedData = sanitizeFormData(formData, {
      clientId: 'string',
      title: 'string',
      description: 'string',
      status: 'string',
      totalAmount: 'number',
      startDate: 'date',
      estimatedCompletion: 'date',
    });

    try {
      if (editingProject) {
        await projectsAPI.update(editingProject.id, sanitizedData);
        toast.success('Project updated successfully');
      } else {
        await projectsAPI.create(sanitizedData);
        toast.success('Project created successfully');
      }
      setShowModal(false);
      resetForm();
      // Revalidate cache after mutation
      mutateProjects();
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to save project';
      toast.error(message);
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
      toast.success('Project deleted successfully');
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to delete project';
      toast.error(message);
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

  // Bulk delete selected projects
  const handleBulkDelete = useCallback(async () => {
    if (!confirm(`Are you sure you want to delete ${selectedProjects.length} project(s)?`)) return;

    try {
      await Promise.all(selectedProjects.map(id => projectsAPI.delete(id)));
      setSelectedProjects([]);
      mutateProjects();
      toast.success(`${selectedProjects.length} project(s) deleted successfully`);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to delete some projects';
      toast.error(message);
      mutateProjects();
    }
  }, [selectedProjects, mutateProjects]);

  // Define table columns
  const columns = useMemo(() => [
    {
      key: 'title',
      label: 'Project',
      sortable: true,
      render: (project) => <div className="client-name">{project.title}</div>,
    },
    {
      key: 'client_name',
      label: 'Client',
      sortable: true,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (project) => <span className={getStatusBadge(project.status)}>{project.status}</span>,
    },
    {
      key: 'total_amount',
      label: 'Budget',
      sortable: true,
      render: (project) => `$${project.total_amount || 0}`,
    },
    {
      key: 'start_date',
      label: 'Start Date',
      sortable: true,
      render: (project) => project.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '-',
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (project) => (
        <div className="table-actions">
          <button className="btn btn-sm btn-outline" onClick={() => openEditModal(project)}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(project.id)}>Delete</button>
        </div>
      ),
    },
  ], [getStatusBadge, openEditModal, handleDelete]);

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
          <ErrorBoundary>
            <DataTable
              data={projects || []}
              columns={columns}
              loading={projectsLoading}
              onSelectionChange={setSelectedProjects}
              selectable={true}
              searchPlaceholder="Search projects by name, client, or status..."
              searchFields={['title', 'client_name', 'status', 'description']}
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
                  <div className="empty-icon">📁</div>
                  <h3>No projects found</h3>
                  <p>Create your first project</p>
                  <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                    + Add Project
                  </button>
                </div>
              }
            />
          </ErrorBoundary>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <FocusLock returnFocus>
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
          </FocusLock>
        </div>
      )}
    </div>
  );
};

export default Projects;
