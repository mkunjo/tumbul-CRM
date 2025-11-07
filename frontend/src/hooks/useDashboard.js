import useSWR from 'swr';
import { dashboardAPI } from '../services/api';

export const useDashboardMetrics = () => {
  const fetcher = async () => {
    const response = await dashboardAPI.getMetrics();
    return response.data; // API returns metrics directly, not nested
  };

  const { data, error, isLoading, mutate } = useSWR(
    '/api/dashboard/metrics',
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 120000, // 2 minutes - dashboard data doesn't change frequently
    }
  );

  return {
    metrics: data,
    isLoading,
    isError: error,
    mutate,
  };
};

export const useDashboardRevenue = (days = 30) => {
  const fetcher = async () => {
    const response = await dashboardAPI.getRevenue(days);
    return response.data; // API returns revenue metrics directly
  };

  const { data, error, isLoading, mutate } = useSWR(
    `/api/dashboard/revenue?days=${days}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 120000, // 2 minutes
    }
  );

  return {
    revenue: data,
    isLoading,
    isError: error,
    mutate,
  };
};

export const useDashboardTopProjects = (limit = 5) => {
  const fetcher = async () => {
    const response = await dashboardAPI.getTopProjects(limit);
    return response.data.projects || [];
  };

  const { data, error, isLoading, mutate } = useSWR(
    `/api/dashboard/top-projects?limit=${limit}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 120000, // 2 minutes
    }
  );

  return {
    topProjects: data || [],
    isLoading,
    isError: error,
    mutate,
  };
};

export const useDashboardRecentActivity = (limit = 10) => {
  const fetcher = async () => {
    const response = await dashboardAPI.getRecentActivity(limit);
    return response.data.activity || []; // API returns { activity: [...] }
  };

  const { data, error, isLoading, mutate } = useSWR(
    `/api/dashboard/recent-activity?limit=${limit}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute - activity should update more frequently
    }
  );

  return {
    recentActivity: data || [],
    isLoading,
    isError: error,
    mutate,
  };
};
