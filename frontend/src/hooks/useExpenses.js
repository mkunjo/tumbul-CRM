import useSWR from 'swr';
import { expensesAPI } from '../services/api';

export const useExpenses = (params = {}) => {
  const fetcher = async () => {
    const response = await expensesAPI.getAll(params);
    return response.data.expenses || [];
  };

  const queryString = Object.keys(params).length > 0
    ? `?${new URLSearchParams(params).toString()}`
    : '';

  const { data, error, isLoading, mutate } = useSWR(
    `/api/expenses${queryString}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
    }
  );

  return {
    expenses: data || [],
    isLoading,
    isError: error,
    mutate,
  };
};

export const useExpense = (id) => {
  const fetcher = async () => {
    if (!id) return null;
    const response = await expensesAPI.getById(id);
    return response.data.expense;
  };

  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/expenses/${id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    expense: data,
    isLoading,
    isError: error,
    mutate,
  };
};
