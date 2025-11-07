import useSWR from 'swr';
import { invoicesAPI } from '../services/api';

export const useInvoices = (params = {}) => {
  const fetcher = async () => {
    const response = await invoicesAPI.getAll(params);
    return response.data.invoices || [];
  };

  const queryString = Object.keys(params).length > 0
    ? `?${new URLSearchParams(params).toString()}`
    : '';

  const { data, error, isLoading, mutate } = useSWR(
    `/api/invoices${queryString}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
    }
  );

  return {
    invoices: data || [],
    isLoading,
    isError: error,
    mutate,
  };
};

export const useInvoice = (id) => {
  const fetcher = async () => {
    if (!id) return null;
    const response = await invoicesAPI.getById(id);
    return response.data.invoice;
  };

  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/invoices/${id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    invoice: data,
    isLoading,
    isError: error,
    mutate,
  };
};
