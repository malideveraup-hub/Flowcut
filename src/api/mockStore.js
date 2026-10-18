// A tiny in-memory store standing in for the real Node/Express + MongoDB
// backend described in the Master Project Document. Every "API" function in
// this folder reads/writes this store and notifies subscribers, so React
// components re-render the same way they would from real WebSocket pushes.
//
// Swap the functions in queueApi.js for real fetch() calls once the backend
// exists — nothing above this layer needs to change.

let listeners = [];

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export const db = {
  shops: [
    {
      id: 'shop-1',
      name: 'Fade District',
      address: '221 Main St',
      hours: '9:00 AM - 7:00 PM',
      status: 'active',
    },
    {
      id: 'shop-2',
      name: 'Clipper Club',
      address: '48 Oak Ave',
      hours: '10:00 AM - 8:00 PM',
      status: 'active',
    },
    {
      id: 'shop-3',
      name: 'Cutthroat Co.',
      address: '9 River Rd',
      hours: '8:00 AM - 6:00 PM',
      status: 'active',
    },
    {
      id: 'shop-4',
      name: 'Sharp Cuts Studio',
      address: '77 Elm St',
      hours: '9:00 AM - 6:00 PM',
      status: 'pending',
    },
  ],

  services: [
    { id: 'svc-1', shopId: 'shop-1', name: 'Haircut', durationMin: 25, price: 28, active: true },
    { id: 'svc-2', shopId: 'shop-1', name: 'Haircut + Beard', durationMin: 40, price: 40, active: true },
    { id: 'svc-3', shopId: 'shop-1', name: 'Beard trim', durationMin: 15, price: 15, active: true },
    { id: 'svc-4', shopId: 'shop-2', name: 'Haircut', durationMin: 30, price: 25, active: true },
    { id: 'svc-5', shopId: 'shop-3', name: 'Haircut', durationMin: 30, price: 22, active: true },
  ],

  barbers: [
    { id: 'barber-1', shopId: 'shop-1', name: 'Mark', status: 'in_service' },
    { id: 'barber-2', shopId: 'shop-1', name: 'Ana', status: 'on_break' },
    { id: 'barber-3', shopId: 'shop-1', name: 'Leo', status: 'in_service' },
    { id: 'barber-4', shopId: 'shop-2', name: 'Priya', status: 'available' },
  ],

  queue: [
    {
      id: 'q-1',
      shopId: 'shop-1',
      customerName: 'Josh R.',
      serviceId: 'svc-2',
      barberId: 'barber-1',
      source: 'walk_in',
      status: 'IN_SERVICE',
      startedAt: Date.now() - 18 * 60 * 1000 - 42 * 1000,
      position: 0,
    },
    {
      id: 'q-2',
      shopId: 'shop-1',
      customerName: 'Dana K.',
      serviceId: 'svc-1',
      barberId: 'barber-3',
      source: 'reservation',
      status: 'IN_SERVICE',
      startedAt: Date.now() - 6 * 60 * 1000,
      position: 0,
    },
    {
      id: 'q-3',
      shopId: 'shop-1',
      customerName: 'Theo M.',
      serviceId: 'svc-3',
      barberId: null,
      source: 'walk_in',
      status: 'WAITING',
      startedAt: null,
      position: 1,
    },
    {
      id: 'q-4',
      shopId: 'shop-1',
      customerName: 'Ana P.',
      serviceId: 'svc-1',
      barberId: null,
      source: 'walk_in',
      status: 'WAITING',
      startedAt: null,
      position: 2,
    },
  ],

  users: [
    { id: 'u-1', name: 'You', role: 'customer', email: 'you@example.com' },
  ],

  // The currently "logged in" customer's own queue entry id, if any.
  myQueueEntryId: null,

  approvals: [
    { id: 'appr-1', shopName: 'Sharp Cuts Studio', owner: 'R. Alvarez', submitted: '2 days ago' },
    { id: 'appr-2', shopName: 'The Barber Bar', owner: 'M. Chen', submitted: '4 days ago' },
    { id: 'appr-3', shopName: 'Clean Line Co.', owner: 'S. Osei', submitted: '5 days ago' },
  ],

  notifications: [
    { id: 'n-1', text: "You're next in line at Fade District.", read: false },
    { id: 'n-2', text: 'Your service at Fade District has started.', read: false },
    { id: 'n-3', text: 'Welcome to FlowCut! Find a shop to get started.', read: true },
  ],
};

export function mutate(fn) {
  fn(db);
  notify();
}
