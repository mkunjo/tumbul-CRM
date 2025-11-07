import useSWR from 'swr';
import { projectsAPI } from '../services/api';

const fetcher = async () => {
  const response = await projectsAPI.getAll();
  return response.data.projects || [];
};

export const useProjects = () => {
  const { data, error, isLoading, mutate } = useSWR('/api/projects', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // 1 minute
  });

  return {
    projects: data || [],
    isLoading,
    isError: error,
    mutate,
  };
};

export const useProject = (id) => {
  const fetcher = async () => {
    if (!id) return null;
    const response = await projectsAPI.getById(id);
    return response.data.project;
  };

  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/projects/${id}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    project: data,
    isLoading,
    isError: error,
    mutate,
  };
};
