import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth';
import { ToastProvider } from '../components/ui/ToastContext';
import { router } from './routes';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider router={router}>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
  );
}
