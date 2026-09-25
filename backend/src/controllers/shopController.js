import * as shopService from '../services/shopService.js';

export async function listPublicShops(req, res, next) {
  try {
    const shops = await shopService.getPublicShops();
    res.json({ success: true, data: { shops } });
  } catch (err) {
    next(err);
  }
}

export async function getPublicShop(req, res, next) {
  try {
    const shop = await shopService.getPublicShopById(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found.', errors: [] });
    }
    res.json({ success: true, data: { shop } });
  } catch (err) {
    next(err);
  }
}

// POST /api/shops — submit a shop application. Requires auth; ownerId is
// ALWAYS req.user.id, never read from the body (Section 25).
export async function submitShopApplication(req, res, next) {
  try {
    const { name, address, contactPhone, openingTime, closingTime } = req.body || {};
    const shop = await shopService.submitShopApplication(req.user.id, {
      name,
      address,
      contactPhone,
      openingTime,
      closingTime,
    });
    res.status(201).json({
      success: true,
      data: { shop: { id: shop._id.toString(), name: shop.name, status: shop.status } },
    });
  } catch (err) {
    next(err);
  }
}
export async function getMyShopApplication(req, res, next) {
  try {
    const shop = await shopService.getMyShopApplication(req.user.id);

    res.json({
      success: true,
      data: { shop },
    });
  } catch (err) {
    next(err);
  }
}
// GET/PATCH /api/shop-admin/shop — shopId always from req.user.shopId.
export async function getOwnShop(req, res, next) {
  try {
    const shop = await shopService.getOwnShop(req.user.shopId);
    res.json({ success: true, data: { shop } });
  } catch (err) {
    next(err);
  }
}

export async function updateOwnShop(req, res, next) {
  try {
    const { name, address, contactPhone, openingTime, closingTime } = req.body || {};
    const shop = await shopService.updateOwnShop(req.user.shopId, {
      name,
      address,
      contactPhone,
      openingTime,
      closingTime,
    });
    res.json({ success: true, data: { shop } });
  } catch (err) {
    next(err);
  }
}
