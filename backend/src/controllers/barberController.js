import * as barberService from '../services/barberManagementService.js';
import * as serviceManagementService from '../services/serviceManagementService.js';
import * as queueService from '../services/queueService.js';

// ---- Shop Admin managing barbers ----

export async function listShopBarbers(req, res, next) {
  try {
    const barbers = await barberService.getShopBarbers(req.user.shopId);
    res.json({ success: true, data: { barbers } });
  } catch (err) {
    next(err);
  }
}

export async function createBarber(req, res, next) {
  try {
    const { name, mobileNumber, password } = req.body || {};
    const barber = await barberService.createBarber(req.user.shopId, { name, mobileNumber, password });
    res.status(201).json({ success: true, data: { barber } });
  } catch (err) {
    next(err);
  }
}

export async function updateBarberStatus(req, res, next) {
  try {
    const { status, availability } = req.body || {};
    const barber = await barberService.updateBarberStatus(req.user.shopId, req.params.barberId, { status, availability });
    res.json({ success: true, data: { barber } });
  } catch (err) {
    next(err);
  }
}

// ---- Barber's own dashboard/actions (req.barber set by attachBarberProfile) ----

export async function listMyShopServices(req, res, next) {
  try {
    const services = await serviceManagementService.getShopServices(req.barber.shopId);
    res.json({ success: true, data: { services } });
  } catch (err) {
    next(err);
  }
}

export async function createMyShopService(req, res, next) {
  try {
    const { name, description, estimatedDuration, price } = req.body || {};
    const service = await serviceManagementService.createService(req.barber.shopId, {
      name,
      description,
      estimatedDuration,
      price,
    });
    res.status(201).json({ success: true, data: { service } });
  } catch (err) {
    next(err);
  }
}

export async function getMyDashboard(req, res, next) {
  try {
    const dashboard = await queueService.getBarberDashboard(req.barber.shopId, req.barber.id);
    res.json({ success: true, data: dashboard });
  } catch (err) {
    next(err);
  }
}

export async function setMyAvailability(req, res, next) {
  try {
    const { availability, requestId } = req.body || {};
    const barber = await barberService.setOwnAvailability(req.user.id, req.user.shopId, availability, requestId);
    res.json({ success: true, data: { barber: { id: barber._id.toString(), name: barber.name, availability: barber.availability } } });
  } catch (err) {
    next(err);
  }
}
