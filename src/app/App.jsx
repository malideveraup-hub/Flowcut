import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth';
import { ToastProvider } from '../components/ui/ToastContext';
import { router } from './routes';
import ScrollRevealObserver from '../components/ui/ScrollRevealObserver';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ScrollRevealObserver />
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  );
}
