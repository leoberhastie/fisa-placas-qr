import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from '@/context/AuthContext';
import { ProductionSelectionProvider } from '@/context/ProductionSelectionContext';
import { DataSyncProvider } from '@/context/DataSyncContext';
import { AppErrorBoundary } from '@/components/ui/AppErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <DataSyncProvider>
          <ProductionSelectionProvider>
            <App />
          </ProductionSelectionProvider>
        </DataSyncProvider>
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>
);
