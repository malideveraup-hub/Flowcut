import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  validateContactPhone,
  validateOperatingHours,
  validateShopName,
  validateShopRegistration,
} from '../src/validation/shopValidation.js';
import {
  hasValidationErrors,
  validateContact,
  validateShopApplication,
  validateShopDetails,
  validateShopDocumentFile,
} from '../../src/validation/shopValidation.js';
import Shop from '../src/models/Shop.js';

const futureDate = '2099-12-31';

function makeApplication({ businessType = 'sole', city = 'Manila', lat = '', lng = '', confirmed = false } = {}) {
  const fields = {
    owner: 'Alex Santos',
    shop: 'Fade District',
    phone: '+63 (2) 1234-5678',
    email: 'owner@example.com',
    street: '12 Rizal Avenue',
    barangay: 'Barangay 1',
    city,
    province: 'Metro Manila',
    lat,
    lng,
    confirmed,
  };
  const registration = {
    mayor: { number: 'MAY-100', issue: '2024-01-01', expiry: futureDate },
    brgy: { number: '', issue: '', expiry: '' },
    dti: { number: 'DTI-200', issue: '2024-01-01', expiry: futureDate },
    sec: { number: 'SEC-200', issue: '', expiry: '' },
    bir: { number: 'BIR-300', issue: '', expiry: '' },
    sanitary: { number: 'SAN-400', issue: '', expiry: futureDate },
    fsic: { number: 'FSIC-500', issue: '', expiry: futureDate },
  };
  if (businessType !== 'sole') registration.dti = { number: '', issue: '', expiry: '' };
  return { fields, businessType, registration };
}

function uploadsFor(_city, businessType = 'sole') {
  const required = ['mayor', businessType === 'sole' ? 'dti' : 'sec', 'bir'];
  // The fixture includes these optional document details, so their matching
  // files are expected too even when the city does not require them.
  required.push('sanitary', 'fsic');
  return required;
}

test('legacy shop validators accept normal values and reject malformed phone or hours', () => {
  assert.equal(validateShopName('Fade District'), null);
  assert.equal(validateShopName('x'), 'Shop name must be 2-100 characters.');
  assert.equal(validateContactPhone('+63 (2) 1234-5678'), null);
  assert.equal(validateContact('+63 (2) 1234-5678'), null);
  assert.ok(validateContact('12AB3456'));
  assert.equal(validateOperatingHours('09:00', '18:00'), null);
  assert.ok(validateOperatingHours('18:00', '09:00'));
  assert.ok(validateShopDetails(makeApplication().fields).email === null);
});

test('server registration validation requires complete details, applicable files, and valid coordinates', () => {
  const application = makeApplication({ city: 'Quezon City', lat: '14.6507', lng: '121.0494', confirmed: true });
  const errors = validateShopRegistration({
    ...application.fields,
    businessType: application.businessType,
    documents: application.registration,
  }, { uploadedDocuments: uploadsFor('Quezon City') });
  assert.deepEqual(errors, {});

  const unconfirmed = validateShopRegistration({
    ...application.fields,
    confirmed: false,
    businessType: application.businessType,
    documents: application.registration,
  }, { uploadedDocuments: uploadsFor('Quezon City') });
  assert.match(unconfirmed.coords, /Confirm/);
});

test('city-dependent documents and the chosen legal registration are enforced', () => {
  const makati = makeApplication({ city: 'Makati City' });
  let errors = validateShopRegistration({ ...makati.fields, businessType: 'sole', documents: makati.registration }, {
    uploadedDocuments: uploadsFor('Makati City'),
  });
  assert.equal(errors.documents, undefined);

  const missingSanitary = validateShopRegistration({ ...makati.fields, businessType: 'sole', documents: makati.registration }, {
    uploadedDocuments: ['mayor', 'dti', 'bir', 'fsic'],
  });
  assert.ok(missingSanitary.documents.sanitary);

  const withoutDocumentMap = { ...makati.fields, businessType: 'sole' };
  const missingAllFiles = validateShopRegistration(withoutDocumentMap, { uploadedDocuments: [] });
  assert.ok(missingAllFiles.documents.mayor);
  assert.ok(missingAllFiles.documents.sanitary);

  const corporation = makeApplication({ businessType: 'corp' });
  errors = validateShopRegistration({ ...corporation.fields, businessType: 'corp', documents: corporation.registration }, {
    uploadedDocuments: uploadsFor('Manila', 'corp'),
  });
  assert.equal(errors.documents, undefined);
});

test('email, address lengths, dates, and unsupported field types are rejected', () => {
  const application = makeApplication();
  const invalid = {
    ...application.fields,
    email: 'not-an-email',
    street: 'x'.repeat(151),
    lat: { $gt: 0 },
    businessType: 'sole',
    documents: application.registration,
  };
  const errors = validateShopRegistration(invalid, { uploadedDocuments: uploadsFor('Manila') });
  assert.match(errors.email, /valid contact email/);
  assert.match(errors.street, /150 characters/);
  assert.ok(errors.coords);

  application.registration.mayor.issue = futureDate;
  const invalidDate = validateShopRegistration({ ...application.fields, businessType: 'sole', documents: application.registration }, {
    uploadedDocuments: uploadsFor('Manila'),
  });
  assert.ok(invalidDate.documents.mayor.some((message) => message.includes('future')));
});

test('frontend document validation checks required docs, file size, and upload file types', () => {
  const application = makeApplication({ city: 'Quezon City' });
  const docs = Object.fromEntries(Object.entries(application.registration).map(([key, value]) => [key, {
    ...value,
    file: uploadsFor('Quezon City').includes(key) ? { status: 'uploaded', name: `${key}.pdf` } : null,
  }]));
  let errors = validateShopApplication(application.fields, 'sole', docs);
  assert.equal(hasValidationErrors(errors), false);

  docs.fsic.file = null;
  errors = validateShopApplication(application.fields, 'sole', docs);
  assert.ok(errors.documents.fsic);
  assert.ok(validateShopDocumentFile({ name: 'permit.exe', type: 'application/octet-stream', size: 10 }));
  assert.ok(validateShopDocumentFile({ name: 'permit.pdf', type: 'application/pdf', size: 5 * 1024 * 1024 + 1 }));
  assert.equal(validateShopDocumentFile({ name: 'permit.pdf', type: 'application/pdf', size: 100 }), null);
});

test('draft model permits incomplete application data while submitted registrations require the added fields', async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const draft = new Shop({ ownerId, status: 'DRAFT', applicationVersion: 2 });
  await draft.validate();

  const incomplete = new Shop({ ownerId, status: 'PENDING', applicationVersion: 2 });
  await assert.rejects(incomplete.validate(), (error) => {
    assert.ok(error.errors.ownerName);
    assert.ok(error.errors['contact.email']);
    assert.ok(error.errors.businessType);
    assert.ok(error.errors['addressDetails.street']);
    return true;
  });

  const submitted = new Shop({
    ownerId,
    status: 'PENDING',
    applicationVersion: 2,
    name: 'Fade District',
    address: '12 Rizal Avenue, Barangay 1, Manila, Metro Manila',
    ownerName: 'Alex Santos',
    contact: { phone: '09171234567', email: 'owner@example.com' },
    businessType: 'sole',
    addressDetails: { street: '12 Rizal Avenue', barangay: 'Barangay 1', city: 'Manila', province: 'Metro Manila' },
  });
  await submitted.validate();
});
