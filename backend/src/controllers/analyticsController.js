import * as analyticsService from '../services/analyticsService.js';
import * as aiAnalyticsService from '../services/aiAnalyticsService.js';

export async function getOwnShopAnalytics(req, res, next) {
  try {
    const analytics = await analyticsService.getOwnShopAnalytics(req.user.shopId);
    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
}

export async function getShopAiInsights(req, res, next) {
  try {
    const shopData = req.body || {};
    const insights = await aiAnalyticsService.generateShopAiInsights(shopData);
    res.json({ success: true, data: insights });
  } catch (err) {
    next(err);
  }
}

export async function askShopAi(req, res, next) {
  try {
    const { question, context } = req.body || {};
    const normalizedQuestion = typeof question === 'string' ? question.trim() : '';
    if (!normalizedQuestion) {
      return res.status(400).json({ success: false, error: 'A question is required' });
    }
    if (normalizedQuestion.length > 500) {
      return res.status(400).json({ success: false, error: 'Questions must be 500 characters or fewer' });
    }
    const response = await aiAnalyticsService.askShopAi(normalizedQuestion, context || {});
    res.json({ success: true, data: response });
  } catch (err) {
    next(err);
  }
}
