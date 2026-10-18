import * as analyticsService from '../services/analyticsService.js';
import * as analyticsInsightsService from '../services/analyticsInsightsService.js';
import * as analyticsChatService from '../services/analyticsChatService.js';

export function createOwnShopAnalyticsHandler(readAnalytics = analyticsService.getOwnShopAnalytics) {
  return async function getOwnShopAnalytics(req, res, next) {
    try {
      const analytics = await readAnalytics(req.user.shopId, req.query);
      res.json({ success: true, data: analytics });
    } catch (err) {
      next(err);
    }
  };
}

export const getOwnShopAnalytics = createOwnShopAnalyticsHandler();

export function createOwnShopAnalyticsInsightsHandler(generateInsights = analyticsInsightsService.generateOwnShopAnalyticsInsights) {
  return async function getOwnShopAnalyticsInsights(req, res, next) {
    try {
      const insights = await generateInsights(req.user.shopId, req.body || {}, { requestId: req.geminiRequestId });
      res.json({ success: true, data: insights });
    } catch (err) {
      next(err);
    }
  };
}

export const getOwnShopAnalyticsInsights = createOwnShopAnalyticsInsightsHandler();

export function createOwnShopAnalyticsChatHandler(askAnalytics = analyticsChatService.askOwnShopAnalytics) {
  return async function chatWithOwnShopAnalytics(req, res, next) {
    try {
      const answer = await askAnalytics(req.user.shopId, req.body || {}, { requestId: req.geminiRequestId });
      res.json({ success: true, data: answer });
    } catch (err) {
      next(err);
    }
  };
}

export const chatWithOwnShopAnalytics = createOwnShopAnalyticsChatHandler();
