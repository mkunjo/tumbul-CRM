import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { clientsAPI } from '../services/api';
import { format } from 'date-fns';
import { useClients } from '../hooks/useClients';
import DataTable from '../components/DataTable';
import ErrorBoundary from '../components/ErrorBoundary';
import FocusLock from 'react-focus-lock';
import './Clients.css';

const Clients = () => {
  // Use SWR hook for data fetching with caching
  const { clients, isLoading, mutate } = useClients();

  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [selectedClients, setSelectedClients] = useState([]);

  // Memoize handleSubmit to prevent unnecessary re-renders
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (editingClient) {
        await clientsAPI.update(editingClient.id, formData);
      } else {
        await clientsAPI.create(formData);
      }
      setShowModal(false);
      resetForm();
      // Revalidate cache after mutation
      mutate();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save client');
    }
  }, [editingClient, formData, mutate]);

  // Use optimistic updates for delete
  const handleDelete = useCallback(async (id) => {
    if (!confirm('Are you sure you want to delete this client?')) return;

    try {
      // Optimistically update UI
      mutate(
        clients.filter((c) => c.id !== id),
        false // Don't revalidate yet
      );

      await clientsAPI.delete(id);

      // Revalidate to ensure consistency
      mutate();
      toast.success('Client deleted successfully');
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to delete client';
      toast.error(message);
      // Revalidate on error to restore correct state
      mutate();
    }
  }, [clients, mutate]);

  // Use optimistic updates for archive
  const handleArchive = useCallback(async (id) => {
    try {
      // Optimistically remove from list
      mutate(
        clients.filter((c) => c.id !== id),
        false
      );

      await clientsAPI.archive(id);
      mutate();
      toast.success('Client archived successfully');
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to archive client';
      toast.error(message);
      mutate();
    }
  }, [clients, mutate]);

  // Bulk delete selected clients
  const handleBulkDelete = useCallback(async () => {
    if (!confirm(`Are you sure you want to delete ${selectedClients.length} client(s)?`)) return;

    try {
      // Delete all selected clients
      await Promise.all(selectedClients.map(id => clientsAPI.delete(id)));
      setSelectedClients([]);
      mutate();
      toast.success(`${selectedClients.length} client(s) deleted successfully`);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to delete some clients';
      toast.error(message);
      mutate();
    }
  }, [selectedClients, mutate]);

  // Bulk archive selected clients
  const handleBulkArchive = useCallback(async () => {
    if (!confirm(`Are you sure you want to archive ${selectedClients.length} client(s)?`)) return;

    try {
      await Promise.all(selectedClients.map(id => clientsAPI.archive(id)));
      setSelectedClients([]);
      mutate();
      toast.success(`${selectedClients.length} client(s) archived successfully`);
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to archive some clients';
      toast.error(message);
      mutate();
    }
  }, [selectedClients, mutate]);

  const openEditModal = useCallback((client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      notes: client.notes || '',
    });
    setShowModal(true);
  }, []);

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
    });
    setEditingClient(null);
    setError('');
  }, []);

  // Define table columns
  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (client) => <div className="client-name">{client.name}</div>,
    },
    {
      key: 'email',
      label: 'Email',
      sortable: true,
      render: (client) => client.email || '-',
    },
    {
      key: 'phone',
      label: 'Phone',
      sortable: false,
      render: (client) => client.phone || '-',
    },
    {
      key: 'project_count',
      label: 'Projects',
      sortable: true,
      render: (client) => (
        <span className="badge badge-primary">
          {client.project_count || 0} projects
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (client) => format(new Date(client.created_at), 'MMM d, yyyy'),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (client) => (
        <div className="table-actions">
          <button
            className="btn btn-sm btn-outline"
            onClick={() => openEditModal(client)}
          >
            Edit
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => handleArchive(client.id)}
          >
            Archive
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => handleDelete(client.id)}
          >
            Delete
          </button>
        </div>
      ),
    },
  ], [openEditModal, handleArchive, handleDelete]);

  return (
    <div className="clients-page">
      <div className="page-header">
        <h1>Clients</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
        >
          + Add Client
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          <ErrorBoundary>
            <DataTable
              data={clients || []}
              columns={columns}
              loading={isLoading}
              onSelectionChange={setSelectedClients}
              selectable={true}
              searchPlaceholder="Search clients by name or email..."
              searchFields={['name', 'email', 'phone']}
              actions={
                <>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={handleBulkArchive}
                  >
                    Archive Selected
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={handleBulkDelete}
                  >
                    Delete Selected
                  </button>
                </>
              }
              emptyState={
                <div className="empty-state">
                  <div className="empty-icon">👥</div>
                  <h3>No clients found</h3>
                  <p>Get started by creating your first client</p>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      resetForm();
                      setShowModal(true);
                    }}
                  >
                    + Add Client
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
              <h2 className="modal-title">
                {editingClient ? 'Edit Client' : 'Add New Client'}
              </h2>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  {error && <div className="alert alert-error">{error}</div>}

                  <div className="form-group">
                    <label htmlFor="name" className="form-label">
                      Name *
                    </label>
                    <input
                      id="name"
                      type="text"
                      className="form-input"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="email" className="form-label">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="form-input"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="phone" className="form-label">
                      Phone
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      className="form-input"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="address" className="form-label">
                      Address
                    </label>
                    <input
                      id="address"
                      type="text"
                      className="form-input"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="notes" className="form-label">
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      className="form-textarea"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editingClient ? 'Update Client' : 'Create Client'}
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

export default Clients;
