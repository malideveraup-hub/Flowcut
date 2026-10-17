import { Barber, QueueEntry, Service, ServiceLog } from '../models/index.js';

function historyStart(now) {
  // Include the start of the sixth prior UTC month. The client trims the
  // extra edge hours against its local calendar when it renders reports.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
}

export async function getOwnShopAnalytics(shopId, now = new Date()) {
  const from = historyStart(now);
  const [entries, barbers] = await Promise.all([
    QueueEntry.find({ shopId, status: 'COMPLETED', updatedAt: { $gte: from } })
      .select('_id serviceId barberId customerId createdAt updatedAt')
      .lean(),
    Barber.find({ shopId }).select('_id name').sort({ name: 1 }).lean(),
  ]);

  const entryById = new Map(entries.map((entry) => [String(entry._id), entry]));
  const entryIds = entries.map((entry) => entry._id);
  const logs = entryIds.length
    ? await ServiceLog.find({
      queueEntryId: { $in: entryIds },
      startTime: { $ne: null },
      endTime: { $gte: from },
    })
      .select('queueEntryId serviceId barberId startTime endTime actualDuration priceAtStart serviceNameAtStart')
      .sort({ endTime: 1 })
      .lean()
    : [];

  const serviceIds = [...new Set(logs.map((log) => String(log.serviceId)))];
  const barberIds = [...new Set(logs.map((log) => String(log.barberId)))];
  const [services, loggedBarbers] = await Promise.all([
    serviceIds.length
      ? Service.find({ _id: { $in: serviceIds }, shopId }).select('_id name').lean()
      : [],
    barberIds.length
      ? Barber.find({ _id: { $in: barberIds }, shopId }).select('_id name').lean()
      : [],
  ]);
  const serviceById = new Map(services.map((service) => [String(service._id), service]));
  const barberById = new Map(loggedBarbers.map((barber) => [String(barber._id), barber]));

  const customerIds = [...new Set(entries.map((entry) => entry.customerId && String(entry.customerId)).filter(Boolean))];
  const customerVisits = customerIds.length
    ? await QueueEntry.find({ shopId, status: 'COMPLETED', customerId: { $in: customerIds } })
      .select('_id customerId createdAt')
      .sort({ createdAt: 1 })
      .lean()
    : [];
  const visitsByCustomer = new Map();
  customerVisits.forEach((entry) => {
    const key = String(entry.customerId);
    const visits = visitsByCustomer.get(key) || [];
    visits.push(entry);
    visitsByCustomer.set(key, visits);
  });

  const records = logs.flatMap((log) => {
    const entry = entryById.get(String(log.queueEntryId));
    const service = serviceById.get(String(log.serviceId));
    if (!entry || !service || !log.startTime || !log.endTime) return [];

    const barber = barberById.get(String(log.barberId));
    const minutes = Number.isFinite(log.actualDuration)
      ? log.actualDuration
      : Math.max(0, (new Date(log.endTime) - new Date(log.startTime)) / 60000);
    const previousVisits = entry.customerId
      ? (visitsByCustomer.get(String(entry.customerId)) || []).some((visit) => (
        String(visit._id) !== String(entry._id) && visit.createdAt < entry.createdAt
      ))
      : null;

    return [{
      id: String(log._id),
      serviceId: String(service._id),
      serviceName: log.serviceNameAtStart || service.name,
      price: Number.isFinite(log.priceAtStart) ? log.priceAtStart : null,
      barberId: barber ? String(barber._id) : null,
      barberName: barber?.name || 'Former barber',
      startedAt: log.startTime,
      finishedAt: log.endTime,
      durationMinutes: minutes,
      joinedAt: entry.createdAt,
      returning: previousVisits,
    }];
  });

  return {
    barbers: barbers.map((barber) => ({ id: String(barber._id), name: barber.name })),
    records,
  };
}
