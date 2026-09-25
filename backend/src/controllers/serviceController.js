import * as serviceService from '../services/serviceManagementService.js';

export async function listPublicServices(req, res, next) {
  try {
    const services = await serviceService.getPublicServices(req.params.shopId);
    res.json({ success: true, data: { services } });
  } catch (err) {
    next(err);
  }
}

export async function listOwnServices(req, res, next) {
  try {
    const services = await serviceService.getShopServices(req.user.shopId);
    res.json({ success: true, data: { services } });
  } catch (err) {
    next(err);
  }
}

export async function createService(req, res, next) {
  try {
    const { name, description, estimatedDuration, price } = req.body || {};
    const service = await serviceService.createService(req.user.shopId, { name, description, estimatedDuration, price });
    res.status(201).json({ success: true, data: { service } });
  } catch (err) {
    next(err);
  }
}

export async function updateService(req, res, next) {
  try {
    const { name, description, estimatedDuration, price } = req.body || {};
    const service = await serviceService.updateService(req.user.shopId, req.params.serviceId, {
      name,
      description,
      estimatedDuration,
      price,
    });
    res.json({ success: true, data: { service } });
  } catch (err) {
    next(err);
  }
}

export async function setServiceStatus(req, res, next) {
  try {
    const { status } = req.body || {};
    const service = await serviceService.setServiceStatus(req.user.shopId, req.params.serviceId, status);
    res.json({ success: true, data: { service } });
  } catch (err) {
    next(err);
  }
}
