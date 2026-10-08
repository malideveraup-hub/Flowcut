import { useCallback } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { fetchPublicShopByQueueQr } from '../../api/shopApi';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { useAsync } from '../../hooks/useAsync';

export default function JoinQueueQr() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('shop') || '';
  const loadShop = useCallback(() => fetchPublicShopByQueueQr(token), [token]);
  const { data: shop, loading, error } = useAsync(loadShop, [token]);

  if (!token) {
    return <EmptyState title="Shop not found" body="This QR code doesn't match an active FlowCut shop." />;
  }
  if (loading) return <Skeleton height={120} />;
  if (error || !shop) {
    return <EmptyState title="Shop not found" body="This QR code doesn't match an active FlowCut shop. Try scanning again or search for the shop instead." />;
  }

  return <Navigate to={`/shops/${shop.id}/join`} replace />;
}
