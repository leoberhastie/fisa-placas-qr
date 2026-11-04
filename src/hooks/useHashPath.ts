import { useCallback, useEffect, useState } from 'react';

function readHashPath(): string {
  const path = window.location.hash.replace(/^#/, '');
  return path.startsWith('/') ? path : '';
}

export function useHashPath(): [string, (path: string) => void] {
  const [path, setPath] = useState(readHashPath);

  useEffect(() => {
    const handleChange = () => setPath(readHashPath());
    window.addEventListener('hashchange', handleChange);
    return () => window.removeEventListener('hashchange', handleChange);
  }, []);

  const navigate = useCallback((to: string) => {
    window.location.hash = to;
  }, []);

  return [path, navigate];
}
