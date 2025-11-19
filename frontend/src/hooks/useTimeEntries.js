import useSWR from 'swr';
import { timeEntriesAPI } from '../services/api';

export const useTimeEntries = () => {
  const fetcher = async () => {
    const response = await timeEntriesAPI.getAll();
    // Backend returns { timeEntries: [...], total: N, limit, offset }
    return response.data.timeEntries || response.data || [];
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
      // Backend returns timer object directly with elapsed_minutes and duration fields
      return response.data || null;
    } catch (error) {
      // 404 means no running timer, which is expected
      if (error.response?.status === 404) {
        return null;
      }
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
