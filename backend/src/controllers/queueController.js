import * as queueService from '../services/queueService.js';

// ---- Public ----

export async function getPublicQueue(req, res, next) {
  try {
    const viewerCustomerId = req.user?.role === 'customer' ? req.user.id : null;
    const queue = await queueService.getPublicShopQueue(req.params.shopId, viewerCustomerId);
    res.json({ success: true, data: { queue } });
  } catch (err) {
    next(err);
  }
}

// ---- Customer ----

export async function joinQueue(req, res, next) {
  try {
    const { serviceId } = req.body || {};
    const entry = await queueService.joinQueue(req.user.id, req.params.shopId, serviceId);
    res.status(201).json({ success: true, data: { queueEntryId: entry._id.toString() } });
  } catch (err) {
    next(err);
  }
}

export async function getMyQueue(req, res, next) {
  try {
    const entry = await queueService.getMyActiveQueueEntry(req.user.id);
    res.json({ success: true, data: { entry } });
  } catch (err) {
    next(err);
  }
}

export async function checkInMyQueue(req, res, next) {
  try {
    const entry = await queueService.checkInMyQueue(req.user.id);
    res.json({ success: true, data: { entry } });
  } catch (err) {
    next(err);
  }
}

export async function getMyQueueHistory(req, res, next) {
  try {
    const history = await queueService.getMyQueueHistory(req.user.id, {
      page: req.query.page,
      pageSize: req.query.limit,
    });
    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
}

export async function cancelMyQueue(req, res, next) {
  try {
    const entry = await queueService.getMyActiveQueueEntry(req.user.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'No active queue entry.', errors: [] });
    }
    await queueService.cancelMyQueueEntry(req.user.id, entry.id);
    res.json({ success: true, message: 'Queue entry cancelled.' });
  } catch (err) {
    next(err);
  }
}

// ---- Shop Admin ----

export async function getShopQueue(req, res, next) {
  try {
    const queue = await queueService.getShopQueue(req.user.shopId);
    res.json({ success: true, data: { queue } });
  } catch (err) {
    next(err);
  }
}

export async function getShopQueueBoard(req, res, next) {
  try {
    const board = await queueService.getShopQueueBoard(req.user.shopId, req.query);
    res.json({ success: true, data: board });
  } catch (err) {
    next(err);
  }
}

export async function updateShopQueueEntry(req, res, next) {
  try {
    await queueService.updateShopQueueEntry(req.user.shopId, req.params.entryId, req.body || {});
    res.json({ success: true, message: 'Queue entry updated.' });
  } catch (err) {
    next(err);
  }
}

export async function completeShopQueueEntry(req, res, next) {
  try {
    await queueService.completeShopQueueEntry(req.user.shopId, req.params.entryId);
    res.json({ success: true, message: 'Service marked completed.' });
  } catch (err) {
    next(err);
  }
}

export async function moveShopQueueEntry(req, res, next) {
  try {
    await queueService.moveShopQueueEntry(req.user.shopId, req.params.entryId, req.body?.position);
    res.json({ success: true, message: 'Queue position updated.' });
  } catch (err) {
    next(err);
  }
}

export async function setShopQueueOpen(req, res, next) {
  try {
    const queueOpen = await queueService.setShopQueueOpen(req.user.shopId, req.body?.open);
    res.json({ success: true, data: { queueOpen } });
  } catch (err) {
    next(err);
  }
}

export async function addWalkIn(req, res, next) {
  try {
    const { serviceId, walkInName } = req.body || {};
    const entry = await queueService.addWalkIn(req.user.shopId, { serviceId, walkInName });
    res.status(201).json({ success: true, data: { queueEntryId: entry._id.toString() } });
  } catch (err) {
    next(err);
  }
}

export async function skipEntry(req, res, next) {
  try {
    await queueService.skipEntry(req.user.shopId, req.params.entryId);
    res.json({ success: true, message: 'Entry skipped.' });
  } catch (err) {
    next(err);
  }
}

export async function cancelEntryByStaff(req, res, next) {
  try {
    await queueService.cancelEntryByStaff(req.user.shopId, req.params.entryId);
    res.json({ success: true, message: 'Entry cancelled.' });
  } catch (err) {
    next(err);
  }
}

// ---- Barber (req.barber set by attachBarberProfile) ----

export async function startService(req, res, next) {
  try {
    await queueService.startService(req.barber.shopId, req.barber.id, req.params.entryId);
    res.json({ success: true, message: 'Service started.' });
  } catch (err) {
    next(err);
  }
}

export async function finishService(req, res, next) {
  try {
    await queueService.finishService(req.barber.shopId, req.barber.id, req.params.entryId);
    res.json({ success: true, message: 'Service finished.' });
  } catch (err) {
    next(err);
  }
}

export async function applyDelay(req, res, next) {
  try {
    const { minutes } = req.body || {};
    await queueService.applyDelay(req.barber.shopId, req.barber.id, req.params.entryId, minutes);
    res.json({ success: true, message: 'Delay recorded.' });
  } catch (err) {
    next(err);
  }
}
