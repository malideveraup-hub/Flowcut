import * as shopService from '../services/shopService.js';
import { Barber, QueueEntry, Service, User } from '../models/index.js';
import { computeLiveWaitEstimate } from '../utils/waitEstimate.js';

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

export async function getPublicShopByQueueQr(req, res, next) {
  try {
    const shop = await shopService.getShopByActiveQueueQr(req.params.token);
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

export async function getMyFavoriteShops(req, res, next) {
  try {
    const shops = await shopService.getMyFavoriteShops(req.user.id);
    res.json({ success: true, data: { shops } });
  } catch (err) {
    next(err);
  }
}

export async function addMyFavoriteShop(req, res, next) {
  try {
    await shopService.addFavoriteShop(req.user.id, req.params.shopId);
    res.json({ success: true, message: 'Shop added to favorites.' });
  } catch (err) {
    next(err);
  }
}

export async function removeMyFavoriteShop(req, res, next) {
  try {
    await shopService.removeFavoriteShop(req.user.id, req.params.shopId);
    res.json({ success: true, message: 'Shop removed from favorites.' });
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

export async function getOwnShopDashboardSummary(req, res, next) {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const activitySince = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [completedEntries, waitEstimate, activityEntries] = await Promise.all([
      QueueEntry.find({
        shopId: req.user.shopId,
        status: 'COMPLETED',
        updatedAt: { $gte: dayStart },
      }).select('serviceId'),
      computeLiveWaitEstimate(req.user.shopId),
      QueueEntry.find({
        shopId: req.user.shopId,
        status: { $in: ['WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED', 'COMPLETED'] },
        updatedAt: { $gte: activitySince },
      })
        .sort({ updatedAt: -1 })
        .limit(6)
        .select('customerId walkInName serviceId barberId status createdAt updatedAt'),
    ]);

    const serviceIds = [...new Set(completedEntries.map((entry) => String(entry.serviceId)))];
    const services = await Service.find({ _id: { $in: serviceIds } }).select('price');
    const priceByService = new Map(services.map((service) => [String(service._id), service.price]));
    const listedValue = completedEntries.reduce(
      (total, entry) => total + (priceByService.get(String(entry.serviceId)) || 0),
      0
    );
    const [activityCustomers, activityServices, activityBarbers] = await Promise.all([
      User.find({ _id: { $in: activityEntries.map((entry) => entry.customerId).filter(Boolean) } }).select('name'),
      Service.find({ _id: { $in: activityEntries.map((entry) => entry.serviceId) } }).select('name'),
      Barber.find({ _id: { $in: activityEntries.map((entry) => entry.barberId).filter(Boolean) } }).select('name'),
    ]);
    const customerNameById = new Map(activityCustomers.map((customer) => [String(customer._id), customer.name]));
    const serviceNameById = new Map(activityServices.map((service) => [String(service._id), service.name]));
    const barberNameById = new Map(activityBarbers.map((barber) => [String(barber._id), barber.name]));
    const recentActivity = activityEntries.map((entry) => ({
      id: entry._id.toString(),
      status: entry.status,
      customerName: (entry.customerId && customerNameById.get(String(entry.customerId))) || entry.walkInName || 'Walk-in customer',
      serviceName: serviceNameById.get(String(entry.serviceId)) || 'Service',
      barberName: entry.barberId ? barberNameById.get(String(entry.barberId)) || null : null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));

    res.json({
      success: true,
      data: {
        completedServices: completedEntries.length,
        listedValue,
        waitEstimate,
        recentActivity,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getOwnShopQueueQr(req, res, next) {
  try {
    const assignment = await shopService.getOwnShopQueueQr(req.user.shopId);
    res.json({ success: true, data: assignment });
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
