import { fetchShopAiInsights, askShopAi } from './shopAdminApi';
import { fetchPlatformAiInsights, askPlatformAi as fetchAskPlatformAi } from './adminApi';

export async function getAiInsights(shopData) {
  const result = await fetchShopAiInsights(shopData);
  return result?.data || result;
}

export async function askAi(question, context) {
  const result = await askShopAi(question, context);
  const response = result?.data || result;
  return response?.answer || 'No answer generated.';
}

export async function getPlatformAiInsights(platformData) {
  const result = await fetchPlatformAiInsights(platformData);
  return result?.data || result;
}

export async function askPlatformAi(question, context) {
  const result = await fetchAskPlatformAi(question, context);
  return result?.data || result;
}
