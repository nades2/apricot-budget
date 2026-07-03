import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // 30s — calendar view doesn't need to be more fresh than that
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
