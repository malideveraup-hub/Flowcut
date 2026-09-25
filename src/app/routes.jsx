import { createBrowserRouter, Navigate } from 'react-router-dom';

import RequireRole from '../features/auth/RequireRole';

import Login from '../features/auth/Login';
import Register from '../features/auth/Register';
import RegisterShop from '../features/auth/RegisterShop';
import ForgotPassword from '../features/auth/ForgotPassword';
import Consent from '../features/auth/Consent';
import ResetPassword from '../features/auth/ResetPassword';
import VerifyEmail from '../features/auth/VerifyEmail';

import CustomerLayout from '../features/customer/CustomerLayout';
import Landing from '../features/customer/Landing';
import Discovery from '../features/customer/Discovery';
import ShopDetails from '../features/customer/ShopDetails';
import PublicQueueView from '../features/customer/PublicQueueView';
import JoinQueue from '../features/customer/JoinQueue';
import JoinRedirect from '../features/customer/JoinRedirect';
import ScanToJoin from '../features/customer/ScanToJoin';
import MyQueue from '../features/customer/MyQueue';
import RecommendedTime from '../features/customer/RecommendedTime';
import Profile from '../features/customer/Profile';
import Notifications from '../features/customer/Notifications';

import BarberLayout from '../features/barber/BarberLayout';
import BarberHome from '../features/barber/BarberHome';

import StaffLayout from '../components/staff/StaffLayout';
import ShopAdminDashboard from '../features/shop-admin/Dashboard';
import QueueManagement from '../features/shop-admin/QueueManagement';
import BarberManagement from '../features/shop-admin/BarberManagement';
import ServiceManagement from '../features/shop-admin/ServiceManagement';
import ShopSettings from '../features/shop-admin/ShopSettings';
import ShopAnalytics from '../features/shop-admin/Analytics';
import QRManagement from '../features/shop-admin/QRManagement';

import SuperAdminDashboard from '../features/super-admin/SuperAdminDashboard';
import ShopManagement from '../features/super-admin/ShopManagement';
import ShopApproval from '../features/super-admin/ShopApproval';
import UserManagement from '../features/super-admin/UserManagement';
import PlatformAnalytics from '../features/super-admin/PlatformAnalytics';
import PlatformSettings from '../features/super-admin/PlatformSettings';

const SHOP_ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/queue', label: 'Queue' },
  { to: '/admin/barbers', label: 'Barbers' },
  { to: '/admin/services', label: 'Services' },
  { to: '/admin/qr', label: 'QR code' },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/settings', label: 'Settings' },
];

const SUPER_ADMIN_NAV = [
  { to: '/super-admin', label: 'Dashboard', end: true },
  { to: '/super-admin/shops', label: 'Shops' },
  { to: '/super-admin/approvals', label: 'Approvals' },
  { to: '/super-admin/users', label: 'Users' },
  { to: '/super-admin/analytics', label: 'Analytics' },
  { to: '/super-admin/settings', label: 'Settings' },
];

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/register-shop', element: <RegisterShop /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/consent', element: <Consent /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/verify-email', element: <VerifyEmail /> },

  // QR entry point: flowcut.app/join/{shopId}. Public — it only ever
  // validates the shop and hands off into the public join flow below.
  { path: '/join/:shopId', element: <JoinRedirect /> },

  {
    // PUBLIC customer surface — no RequireRole here on purpose (Section 2:
    // "do not force authentication before users can browse shops").
    path: '/',
    element: <CustomerLayout />,
    children: [
      { index: true, element: <Landing /> },
      { path: 'discover', element: <Discovery /> },
      { path: 'scan', element: <ScanToJoin /> },
      { path: 'shops/:shopId', element: <ShopDetails /> },
      { path: 'shops/:shopId/queue', element: <PublicQueueView /> },
      // Browsable without an account; only the "Confirm and join" button
      // inside this page requires auth (see JoinQueue.jsx).
      { path: 'shops/:shopId/join', element: <JoinQueue /> },

      // PROTECTED customer surface — these genuinely need an authenticated
      // customer, guarded individually rather than gating the whole tree.
      {
        path: 'my-queue',
        element: (
          <RequireRole role="customer">
            <MyQueue />
          </RequireRole>
        ),
      },
      {
        path: 'recommended-time',
        element: (
          <RequireRole role="customer">
            <RecommendedTime />
          </RequireRole>
        ),
      },
      {
        path: 'profile',
        element: (
          <RequireRole role="customer">
            <Profile />
          </RequireRole>
        ),
      },
      {
        path: 'notifications',
        element: (
          <RequireRole role="customer">
            <Notifications />
          </RequireRole>
        ),
      },
    ],
  },

  {
    path: '/barber',
    element: (
      <RequireRole role="barber">
        <BarberLayout />
      </RequireRole>
    ),
    children: [{ index: true, element: <BarberHome /> }],
  },

  {
    path: '/admin',
    element: (
      <RequireRole role="shop_admin">
        <StaffLayout navItems={SHOP_ADMIN_NAV} subtitle="Fade District" />
      </RequireRole>
    ),
    children: [
      { index: true, element: <ShopAdminDashboard /> },
      { path: 'queue', element: <QueueManagement /> },
      { path: 'barbers', element: <BarberManagement /> },
      { path: 'services', element: <ServiceManagement /> },
      { path: 'qr', element: <QRManagement /> },
      { path: 'analytics', element: <ShopAnalytics /> },
      { path: 'settings', element: <ShopSettings /> },
    ],
  },

  {
    path: '/super-admin',
    element: (
      <RequireRole role="super_admin">
        <StaffLayout navItems={SUPER_ADMIN_NAV} subtitle="Platform" />
      </RequireRole>
    ),
    children: [
      { index: true, element: <SuperAdminDashboard /> },
      { path: 'shops', element: <ShopManagement /> },
      { path: 'approvals', element: <ShopApproval /> },
      { path: 'users', element: <UserManagement /> },
      { path: 'analytics', element: <PlatformAnalytics /> },
      { path: 'settings', element: <PlatformSettings /> },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
]);
