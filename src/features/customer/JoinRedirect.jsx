import { useCallback } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublicShop } from '../../api/shopApi';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';

/**
 * Route target for a scanned shop QR code: flowcut.app/join/{shopId}.
 * This component's only job is to confirm the shop exists (a real
 * GET /api/shops/:shopId call) and is APPROVED, then hand off to the
 * normal public Join Queue flow — the same flow reachable by browsing.
 * Authentication (if needed) is handled by JoinQueue further down that
 * flow, which preserves this exact URL as the "return to" destination.
 */
export default function JoinRedirect() {
  const { shopId } = useParams();
  const loadShop = useCallback(() => fetchPublicShop(shopId), [shopId]);
  const { data: shop, loading, error } = useAsync(loadShop, [shopId]);

  if (loading) return <Skeleton height={120} />;

  if (error || !shop) {
    return (
      <EmptyState
        skin="pixel"
        title="Shop not found"
        body="This QR code doesn't match an active FlowCut shop. Try scanning again or search for the shop instead."
      />
    );
  }

  return <Navigate to={`/shops/${shopId}/join`} replace />;
}
