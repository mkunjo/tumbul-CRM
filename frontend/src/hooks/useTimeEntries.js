import useSWR from 'swr';
import { timeEntriesAPI } from '../services/api';

export const useTimeEntries = () => {
  const fetcher = async () => {
    const response = await timeEntriesAPI.getAll();
    return response.data.time_entries || [];
  };

  const { data, error, isLoading, mutate } = useSWR(
    '/api/time-entries',
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
    }
  );

  return {
    timeEntries: data || [],
    isLoading,
    isError: error,
    mutate,
  };
};

export const useRunningTimer = () => {
  const fetcher = async () => {
    try {
      const response = await timeEntriesAPI.getRunning();
      return response.data.timer || null;
    } catch (error) {
      return null;
    }
  };

  const { data, error, isLoading, mutate } = useSWR(
    '/api/time-entries/running',
    fetcher,
    {
      revalidateOnFocus: true, // Check for running timer when window is focused
      refreshInterval: 5000, // Refresh every 5 seconds when timer is running
      dedupingInterval: 2000, // 2 seconds
    }
  );

  return {
    runningTimer: data,
    isLoading,
    isError: error,
    mutate,
  };
};

export const useTimeEntry = (id) => {
  const fetcher = async () => {
    if (!id) return null;
    const response = await timeEntriesAPI.getById(id);
    return response.data.time_entry;
  };

  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/time-entries/${id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    timeEntry: data,
    isLoading,
    isError: error,
    mutate,
  };
};
