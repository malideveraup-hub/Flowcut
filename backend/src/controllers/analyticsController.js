import * as analyticsService from '../services/analyticsService.js';
import { calculateDashboardMetricsWithGemini } from '../services/analyticsMetricService.js';

export function createOwnShopAnalyticsHandler(
  readAnalytics = analyticsService.getOwnShopAnalytics,
  calculateMetrics = calculateDashboardMetricsWithGemini,
) {
  return async function getOwnShopAnalytics(req, res, next) {
    try {
      const analytics = await readAnalytics(req.user.shopId, req.query);
      const response = analytics.calculationInputs ? await calculateMetrics(analytics) : analytics;
      res.json({ success: true, data: response });
    } catch (err) {
      next(err);
    }
  };
}

export const getOwnShopAnalytics = createOwnShopAnalyticsHandler();
