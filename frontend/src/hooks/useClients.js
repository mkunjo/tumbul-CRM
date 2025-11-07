import useSWR from 'swr';
import { clientsAPI } from '../services/api';

const fetcher = async () => {
  const response = await clientsAPI.getAll();
  return response.data.clients || [];
};

export const useClients = () => {
  const { data, error, isLoading, mutate } = useSWR('/api/clients', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // 1 minute
  });

  return {
    clients: data || [],
    isLoading,
    isError: error,
    mutate, // For manual revalidation after mutations
  };
};

export const useClient = (id) => {
  const fetcher = async () => {
    if (!id) return null;
    const response = await clientsAPI.getById(id);
    return response.data.client;
  };

  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/clients/${id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    client: data,
    isLoading,
    isError: error,
    mutate,
  };
};
