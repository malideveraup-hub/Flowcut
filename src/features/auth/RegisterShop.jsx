import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchMyShopApplication,
  fetchMyShopApplicationDocument,
  removeMyShopApplicationDocument,
  saveMyShopApplicationDraft,
  submitMyShopRegistration,
  uploadMyShopApplicationDocument,
} from '../../api/shopApi';
import {
  getShopDocumentList,
  hasValidDocumentSignature,
  hasValidationErrors,
  validateShopApplication,
  validateShopDetails,
  validateShopDocumentFile,
} from '../../validation/shopValidation';
import styles from './RegisterShop.module.css';

const EMPTY_FIELDS = {
  owner: '', shop: '', phone: '', email: '', street: '', barangay: '', city: '', province: '',
  lat: '', lng: '', confirmed: false,
};

const EMPTY_DOCUMENT = { number: '', issue: '', expiry: '', file: null };
const EMPTY_DOCUMENTS = Object.fromEntries(['mayor', 'brgy', 'dti', 'sec', 'bir', 'sanitary', 'fsic'].map((key) => [key, { ...EMPTY_DOCUMENT }]));
const BUSINESS_TYPES = [
  { value: 'sole', title: 'Sole Proprietorship', detail: 'DTI-registered owner' },
  { value: 'corp', title: 'Corporation', detail: 'SEC-registered entity' },
  { value: 'part', title: 'Partnership', detail: 'Registered partnership' },
];

function Icon({ name, className = '' }) {
  const shapes = {
    check: <path d="m5 12 4 4L19 6" />,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M4 16v4h16v-4" /></>,
    file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    shop: <><path d="M3 10h18l-1.5-6h-15L3 10Z" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    phone: <path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c0 1.1-.9 2-2 2C10 21 3 14 3 5c0-1.1.9-2 2-2Z" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

function RegistrationShell({ children }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.logo} to="/" aria-label="FlowCut home"><b>F</b>FlowCut</Link>
          <div className={styles.headerRight}><span>Already manage a shop?</span><Link className={styles.headerButton} to="/login">Sign in</Link></div>
        </div>
      </header>
      <main className={styles.main}><div className={styles.layout}>{children}</div></main>
    </div>
  );
}

function ApplicationSidebar({ step, completed = false }) {
  const steps = [
    ['Shop details', 'Owner and location'],
    ['Documents', 'Business registration'],
    ['Review', 'Confirm and submit'],
  ];
  return (
    <aside className={styles.sidebar}>
      <section className={styles.intro}>
        <div className={styles.eyebrow}><i />FLOWCUT ONBOARDING</div>
        <h2>Let’s get your shop verified.</h2>
        <p>Add your shop details and documents. You can save a draft and come back anytime.</p>
      </section>
      <section className={styles.steps} aria-labelledby="application-steps-title">
        <h2 id="application-steps-title">Your application</h2>
        <ol className={styles.stepList}>
          {steps.map(([title, detail], index) => {
            const number = index + 1;
            const done = completed || number < step;
            return <li className={`${styles.step} ${number === step && !completed ? styles.current : ''} ${done ? styles.done : ''}`} key={title}>
              <span className={styles.stepNumber}>{done ? <Icon name="check" /> : number}</span>
              <span><b>{title}</b><small>{completed && number === 1 ? 'Submitted' : number === step && !completed ? 'Current step' : detail}</small></span>
            </li>;
          })}
        </ol>
      </section>
    </aside>
  );
}

function Field({ label, name, value, onChange, error, type = 'text', placeholder, required = false, maxLength, readOnly = false, icon, autoComplete, min, max, step }) {
  return (
    <div className={`${styles.field} ${error ? styles.fieldBad : ''}`}>
      <label htmlFor={name}>{label}{required && <em aria-hidden="true"> *</em>}</label>
      <div className={`${styles.inputWrap} ${icon ? styles.withIcon : ''}`}>
        {icon && <span className={styles.inputIcon}><Icon name={icon} /></span>}
        <input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} maxLength={maxLength} readOnly={readOnly} autoComplete={autoComplete} min={min} max={max} step={step} />
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

function formatSize(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function todayInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function RegisterShop() {
  const { role, user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [fields, setFields] = useState({ ...EMPTY_FIELDS });
  const [businessType, setBusinessType] = useState('sole');
  const [documents, setDocuments] = useState(() => structuredClone(EMPTY_DOCUMENTS));
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [application, setApplication] = useState(null);
  const [loadingApplication, setLoadingApplication] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftAt, setDraftAt] = useState(null);
  const [banner, setBanner] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [locationStatus, setLocationStatus] = useState('');
  const [accuracy, setAccuracy] = useState(null);
  const [locating, setLocating] = useState(false);
  const [manualLocation, setManualLocation] = useState(false);
  const [preview, setPreview] = useState(null);

  const documentList = useMemo(() => getShopDocumentList(businessType, fields.city), [businessType, fields.city]);
  const isSubmitted = ['PENDING', 'APPROVED', 'SUSPENDED'].includes(application?.status);
  const fullAddress = [fields.street, fields.barangay, fields.city, fields.province].map((part) => part.trim()).filter(Boolean).join(', ');
  const coordinatesValid = fields.lat.trim() !== '' && fields.lng.trim() !== ''
    && Number.isFinite(Number(fields.lat)) && Number(fields.lat) >= -90 && Number(fields.lat) <= 90
    && Number.isFinite(Number(fields.lng)) && Number(fields.lng) >= -180 && Number(fields.lng) <= 180;
  const outsidePhilippines = coordinatesValid && (Number(fields.lat) < 4 || Number(fields.lat) > 22 || Number(fields.lng) < 116 || Number(fields.lng) > 127);

  useEffect(() => {
    let active = true;
    if (!role) return () => { active = false; };
    fetchMyShopApplication().then((saved) => {
      if (!active) return;
      if (!saved) {
        setFields((current) => ({ ...current, owner: user?.name || current.owner, email: user?.email || current.email }));
        return;
      }
      setApplication(saved);
      setFields({ ...EMPTY_FIELDS, ...saved.fields, owner: saved.fields.owner || user?.name || '', email: saved.fields.email || user?.email || '' });
      setBusinessType(saved.businessType || 'sole');
      setDraftAt(saved.savedAt || null);
      if (saved.status === 'DRAFT' || saved.status === 'REJECTED') {
        const restored = structuredClone(EMPTY_DOCUMENTS);
        Object.entries(saved.documents || {}).forEach(([key, value]) => {
          restored[key] = { ...EMPTY_DOCUMENT, ...value, file: value.file ? { ...value.file, status: 'uploaded', server: true } : null };
        });
        setDocuments(restored);
      }
    }).catch((error) => {
      if (active && error.status !== 404) setBanner(error.message);
    }).finally(() => { if (active) setLoadingApplication(false); });
    return () => { active = false; };
  }, [role, user?.email, user?.name]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = window.setTimeout(() => setToastMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    if (!preview) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [preview]);

  function toast(message) { setToastMessage(message); }
  function updateField(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: null, coords: key === 'lat' || key === 'lng' ? null : current.coords }));
    setBanner('');
  }

  function updateDocument(key, field, value) {
    setDocuments((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
    setErrors((current) => {
      const next = { ...current, documents: { ...(current.documents || {}) } };
      delete next.documents[key];
      return next;
    });
  }

  function buildPayload() {
    return {
      ...fields,
      businessType,
      documents: Object.fromEntries(Object.entries(documents).map(([key, value]) => [key, {
        number: value.number,
        issue: value.issue,
        expiry: value.expiry,
      }])),
    };
  }

  function applyServerErrors(fieldErrors) {
    if (!fieldErrors) return;
    setErrors((current) => ({ ...current, ...fieldErrors }));
    if (fieldErrors.documents) setStep(2);
    else setStep(1);
  }

  function scrollToError() {
    window.setTimeout(() => document.querySelector(`.${styles.fieldBad}, .${styles.docBad}, .${styles.error}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  async function saveDraft() {
    if (saving || submitting || isSubmitted) return;
    setSaving(true);
    setBanner('');
    try {
      const saved = await saveMyShopApplicationDraft(buildPayload());
      setApplication(saved);
      setDraftAt(saved.savedAt || new Date().toISOString());
      toast('Draft saved');
    } catch (error) {
      applyServerErrors(error.fieldErrors);
      setBanner(error.message || 'Couldn’t save the draft. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(key, file) {
    const fileError = validateShopDocumentFile(file);
    if (fileError) {
      setErrors((current) => ({ ...current, documents: { ...(current.documents || {}), [key]: [fileError] } }));
      return;
    }
    try {
      if (!(await hasValidDocumentSignature(file))) {
        setErrors((current) => ({ ...current, documents: { ...(current.documents || {}), [key]: ['This file doesn’t look like a real PDF, JPG or PNG.'] } }));
        return;
      }
    } catch {
      setErrors((current) => ({ ...current, documents: { ...(current.documents || {}), [key]: ['We couldn’t read this file. Try another one.'] } }));
      return;
    }

    const previous = documents[key].file;
    updateDocument(key, 'file', { name: file.name, size: file.size, mimeType: file.type, status: 'uploading', progress: 0, raw: file, server: false });
    try {
      const saved = await saveMyShopApplicationDraft(buildPayload());
      setApplication(saved);
      setDraftAt(saved.savedAt || null);
      const uploaded = await uploadMyShopApplicationDocument(key, file, (progress) => {
        setDocuments((current) => current[key]?.file?.name === file.name
          ? { ...current, [key]: { ...current[key], file: { ...current[key].file, progress } } }
          : current);
      });
      setDocuments((current) => ({ ...current, [key]: { ...current[key], file: { ...uploaded, status: 'uploaded', progress: 100, server: true } } }));
      setApplication((current) => current ? { ...current, status: 'DRAFT' } : current);
      toast('Document uploaded');
    } catch (error) {
      setDocuments((current) => ({ ...current, [key]: { ...current[key], file: previous || { name: file.name, size: file.size, mimeType: file.type, status: 'error', raw: file, server: false } } }));
      if (error.fieldErrors) applyServerErrors(error.fieldErrors);
      setErrors((current) => ({ ...current, documents: { ...(current.documents || {}), [key]: [error.message || 'Upload failed. Check your connection and retry.'] } }));
    }
  }

  async function removeFile(key) {
    const file = documents[key].file;
    if (!file) return;
    try {
      if (file.server) await removeMyShopApplicationDocument(key);
      updateDocument(key, 'file', null);
      toast('File removed');
    } catch (error) {
      setErrors((current) => ({ ...current, documents: { ...(current.documents || {}), [key]: [error.message] } }));
    }
  }

  async function viewFile(key) {
    try {
      const blob = await fetchMyShopApplicationDocument(key);
      const url = URL.createObjectURL(blob);
      setPreview({ url, type: blob.type, name: documents[key]?.file?.name || 'Document' });
    } catch (error) {
      setBanner(error.message || 'Couldn’t open this document.');
    }
  }

  function validateStepOne() {
    const next = validateShopDetails(fields);
    setErrors((current) => ({ ...current, ...next }));
    if (Object.values(next).some(Boolean)) { scrollToError(); return false; }
    return true;
  }

  function validateStepTwo() {
    const next = validateShopApplication(fields, businessType, documents);
    const documentErrors = next.documents || {};
    setErrors((current) => ({ ...current, documents: documentErrors }));
    if (Object.keys(documentErrors).length) { scrollToError(); return false; }
    return true;
  }

  async function advance() {
    setBanner('');
    if (step === 1) {
      if (!validateStepOne()) return;
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (step === 2) {
      if (!validateStepTwo()) return;
      setStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const next = validateShopApplication(fields, businessType, documents);
      setErrors(next);
      if (hasValidationErrors(next)) { setBanner('Please fix the items above before submitting.'); scrollToError(); return; }
      setSubmitting(true);
      try {
        const submitted = await submitMyShopRegistration(buildPayload());
        setApplication(submitted);
        toast('Application submitted');
      } catch (error) {
        applyServerErrors(error.fieldErrors);
        setBanner(error.message || 'We couldn’t submit your application. Nothing was lost. Please try again.');
      } finally { setSubmitting(false); }
    }
  }

  function useDeviceLocation() {
    setLocationStatus('Waiting for your permission…');
    if (!('geolocation' in navigator)) {
      setLocationStatus('This browser doesn’t support location. Enter coordinates manually, or leave the pin empty.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      updateField('lat', position.coords.latitude.toFixed(6));
      updateField('lng', position.coords.longitude.toFixed(6));
      updateField('confirmed', false);
      setAccuracy(position.coords.accuracy);
      setManualLocation(false);
      setLocating(false);
      setLocationStatus('Location found. Check the pin, then confirm it.');
    }, (error) => {
      setLocating(false);
      setLocationStatus(error.code === 1
        ? 'Location permission was denied. Enter coordinates manually, or leave the pin empty.'
        : error.code === 3 ? 'Getting your location took too long. Try again, or enter coordinates manually.'
          : 'Your device couldn’t determine its location. Try again, or enter coordinates manually.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  if (authLoading || (role && loadingApplication)) return null;

  if (!role) {
    return <RegistrationShell>
      <ApplicationSidebar step={1} />
      <section className={styles.card}>
        <div className={styles.cardHeader}><div><div className={styles.eyebrowPurple}>CREATE YOUR SHOP ACCOUNT</div><h1>Register your shop</h1><p>Sign in to your FlowCut account first. Your application will be linked to the account you use.</p></div></div>
        <div className={styles.loginPrompt}><p>Already have a FlowCut account? Sign in to continue with your shop application.</p>
          <button className={`${styles.button} ${styles.primary}`} type="button" onClick={() => navigate('/login', { state: { from: { pathname: location.pathname } } })}>Sign in to continue</button>
          <p>New to FlowCut? <Link to="/register">Create an account</Link></p>
        </div>
      </section>
    </RegistrationShell>;
  }

  if (isSubmitted) {
    const approved = application.status === 'APPROVED' || application.status === 'SUSPENDED';
    return <RegistrationShell>
      <ApplicationSidebar step={3} completed />
      <section className={styles.card}>
        <header className={styles.cardHeader}><div><div className={styles.eyebrowPurple}>APPLICATION STATUS</div><h1>Application submitted</h1><p>Your shop details and documents are with FlowCut for review.</p></div><span className={`${styles.statusChip} ${styles.uploaded}`}>{application.status === 'PENDING' ? 'Pending verification' : application.status}</span></header>
        <div className={styles.successPanel}>
          <span className={styles.successIcon}><Icon name="check" /></span>
          <h2>{approved ? (application.status === 'APPROVED' ? 'Your shop is approved' : 'Your shop is suspended') : 'We’ve received your application'}</h2>
          <p>{approved ? 'Your application has completed review. You can manage your shop from the Shop Admin dashboard.' : 'A FlowCut administrator will review your documents. Your shop appears in Discover only after it is verified and approved.'}</p>
          <div className={styles.flow}><span className={approved ? styles.flowDone : styles.flowCurrent}>Pending verification</span><Icon name="arrow" /><span className={approved ? styles.flowDone : ''}>Verified</span><Icon name="arrow" /><span className={application.status === 'APPROVED' ? styles.flowCurrent : application.status === 'SUSPENDED' ? styles.flowDone : ''}>Approved</span></div>
        </div>
      </section>
    </RegistrationShell>;
  }

  return <RegistrationShell>
    <ApplicationSidebar step={step} />
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div><div className={styles.eyebrowPurple}>CREATE YOUR SHOP ACCOUNT</div><h1>{['Shop details', 'Business registration', 'Review your application'][step - 1]}</h1><p>{['Add the owner, contact, and location details for your shop.', 'Upload the business documents needed for verification.', 'Check your application before sending it to FlowCut.'][step - 1]}</p></div>
        {draftAt && <span className={styles.draftChip}>Draft saved</span>}
      </header>

      {application?.status === 'REJECTED' && <div className={styles.rejectedNotice}>Your previous application was rejected. Update the details or documents and submit again.</div>}

      {step === 1 && <div className={styles.formBody}>
        <section className={styles.section}>
          <h2>Owner and shop details</h2><p className={styles.sectionDescription}>Tell us who owns the shop and how customers can contact it.</p>
          <div className={styles.gridTwo}>
            <Field label="Owner’s full name" name="owner" value={fields.owner} onChange={(event) => updateField('owner', event.target.value)} error={errors.owner} maxLength={100} placeholder="Enter the owner’s name" required autoComplete="name" />
            <Field label="Shop name" name="shop" value={fields.shop} onChange={(event) => updateField('shop', event.target.value)} error={errors.shop} maxLength={100} placeholder="Your shop name" required icon="shop" autoComplete="organization" />
            <Field label="Contact number" name="phone" type="tel" value={fields.phone} onChange={(event) => updateField('phone', event.target.value.replace(/[^0-9+()\-\s]/g, ''))} error={errors.phone} maxLength={20} placeholder="e.g. 0917 123 4567" required icon="phone" autoComplete="tel" />
            <Field label="Contact email" name="email" type="email" value={fields.email} onChange={(event) => updateField('email', event.target.value)} error={errors.email} maxLength={254} placeholder="shop@example.com" required icon="mail" autoComplete="email" />
          </div>
        </section>

        <section className={styles.section}>
          <h2>Shop address</h2><p className={styles.sectionDescription}>Use the address where customers can visit your shop.</p>
          <div className={styles.gridTwo}>
            <Field label="Street, building, or unit" name="street" value={fields.street} onChange={(event) => updateField('street', event.target.value)} error={errors.street} maxLength={150} placeholder="House / building / street" required />
            <Field label="Barangay" name="barangay" value={fields.barangay} onChange={(event) => updateField('barangay', event.target.value)} error={errors.barangay} maxLength={100} placeholder="Barangay" required />
            <Field label="City or municipality" name="city" value={fields.city} onChange={(event) => updateField('city', event.target.value)} error={errors.city} maxLength={100} placeholder="City or municipality" required />
            <Field label="Province" name="province" value={fields.province} onChange={(event) => updateField('province', event.target.value)} error={errors.province} maxLength={100} placeholder="Province" required />
          </div>
          <div className={styles.callout}><Icon name="pin" />Adding a map pin helps customers find your shop. You can skip it and we’ll use the address above.</div>
          <div className={styles.locationActions}>
            <button className={`${styles.button} ${styles.small}`} type="button" disabled={locating} onClick={useDeviceLocation}><Icon name="pin" />{locating ? 'Finding location…' : 'Use my current location'}</button>
            <button className={styles.linkButton} type="button" onClick={() => setManualLocation((value) => !value)}>{manualLocation ? 'Done adjusting' : fields.lat ? 'Adjust manually' : 'Enter coordinates manually'}</button>
            {locationStatus && <span className={styles.locationStatus}>{locationStatus}</span>}
          </div>
          {(fields.lat || fields.lng || manualLocation) && <div className={styles.pinBox}>
            <div className={styles.mapPlaceholder}>
              <svg className={styles.mapGraphic} viewBox="0 0 200 150" preserveAspectRatio="none" aria-hidden="true">
                <path d="M-10 38 48 52 76 34 113 46 145 22 210 35M-4 104 42 88 83 110 122 91 207 107M34-8 48 52 42 88 57 158M119-8 113 46 122 91 110 158M180-8 145 22 153 66 190 83 180 158" fill="none" stroke="#d2d0e2" strokeWidth="5" />
                <path d="M-10 38 48 52 76 34 113 46 145 22 210 35M-4 104 42 88 83 110 122 91 207 107" fill="none" stroke="#faf9ff" strokeWidth="2" />
              </svg>
              <span className={styles.mapMarker}><Icon name="pin" /></span>
            </div>
            <div className={styles.pinBody}>
              <div className={styles.coordinates}>
                <Field label="Latitude" name="lat" value={fields.lat} onChange={(event) => { updateField('lat', event.target.value); updateField('confirmed', false); }} error={errors.coords} readOnly={!manualLocation} placeholder="Latitude" maxLength={24} />
                <Field label="Longitude" name="lng" value={fields.lng} onChange={(event) => { updateField('lng', event.target.value); updateField('confirmed', false); }} readOnly={!manualLocation} placeholder="Longitude" maxLength={24} />
              </div>
              {accuracy && <small>Accuracy about ±{Math.round(accuracy)} m</small>}
              {outsidePhilippines && <small className={styles.warning}>These coordinates look outside the Philippines. Please double-check.</small>}
              {coordinatesValid && <a className={styles.linkButton} href={`https://www.google.com/maps?q=${encodeURIComponent(`${fields.lat},${fields.lng}`)}`} target="_blank" rel="noreferrer">Open pin in Google Maps</a>}
              <label className={styles.checkbox}><input type="checkbox" checked={fields.confirmed} onChange={(event) => updateField('confirmed', event.target.checked)} /><span className={styles.checkboxBox}><Icon name="check" /></span>I confirm this pin is at my shop.</label>
              {(fields.lat || fields.lng) && <button className={styles.linkButton} type="button" onClick={() => { updateField('lat', ''); updateField('lng', ''); updateField('confirmed', false); setAccuracy(null); setLocationStatus(''); setManualLocation(false); }}>Clear location pin</button>}
              {errors.coords && <p className={styles.error}>{errors.coords}</p>}
            </div>
          </div>}
        </section>
      </div>}

      {step === 2 && <div className={styles.formBody}>
        <section className={styles.section}>
          <h2>Business type</h2><p className={styles.sectionDescription}>Select the legal structure that matches your registration.</p>
          <div className={styles.businessTypes}>
            {BUSINESS_TYPES.map((item) => <label className={`${styles.businessType} ${businessType === item.value ? styles.businessTypeSelected : ''}`} key={item.value}>
              <input type="radio" name="businessType" value={item.value} checked={businessType === item.value} onChange={() => { setBusinessType(item.value); setErrors((current) => ({ ...current, type: null })); }} />
              <span className={styles.radioMark} /><span><b>{item.title}</b><small>{item.detail}</small></span>
            </label>)}
          </div>
          {errors.type && <p className={styles.error}>{errors.type}</p>}
        </section>
        <section className={styles.section}>
          <h2>Required documents</h2><p className={styles.sectionDescription}>Upload one file for each required document. PDF, JPG or PNG, up to 5 MB each.</p>
          <div className={styles.documentSummary}>
            <b>{documentList.filter((item) => item.requirement === 'required' && documents[item.key]?.file?.status === 'uploaded').length} of {documentList.filter((item) => item.requirement === 'required').length}</b><span>required files uploaded</span>
            <div className={styles.progressTrack}><div style={{ width: `${documentList.filter((item) => item.requirement === 'required' && documents[item.key]?.file?.status === 'uploaded').length / documentList.filter((item) => item.requirement === 'required').length * 100}%` }} /></div>
          </div>
          <p className={styles.note}>Requirements depend on your city or municipality{fields.city && <> (<b>{fields.city}</b>)</>}. Documents marked <b>If applicable</b> are only needed if your shop has them.</p>
          <div className={styles.documents}>
            {documentList.map((item, index) => {
              const value = documents[item.key] || EMPTY_DOCUMENT;
              const file = value.file;
              const docErrors = errors.documents?.[item.key] || [];
              const dateCount = item.dates.length;
              return <article className={`${styles.docCard} ${file?.status === 'uploaded' ? styles.docUploaded : ''} ${docErrors.length ? styles.docBad : ''}`} key={item.key}>
                <div className={styles.docLeft}>
                  <div className={styles.docTop}>
                    <div className={styles.docTitle}><span className={`${styles.docNumber} ${file?.status === 'uploaded' ? styles.docNumberDone : ''}`}>{file?.status === 'uploaded' ? <Icon name="check" /> : index + 1}</span><div><b>{item.name}</b><div className={styles.docMeta}><span className={`${styles.badge} ${item.requirement === 'required' ? styles.badgeRequired : styles.badgeConditional}`}>{item.requirement === 'required' ? 'Required' : 'If applicable'}</span>{item.detail && <small>{item.detail}</small>}</div></div></div>
                    <span className={`${styles.statusChip} ${file?.status === 'uploaded' ? styles.uploaded : file?.status === 'uploading' ? styles.uploading : file ? styles.failed : ''}`}>{file?.status === 'uploaded' ? 'Uploaded' : file?.status === 'uploading' ? 'Uploading…' : file ? 'Failed' : 'Not uploaded'}</span>
                  </div>
                  <div className={`${styles.docFields} ${dateCount === 0 ? styles.docFieldsOne : dateCount === 1 ? styles.docFieldsTwo : ''}`}>
                    <Field label={item.numberLabel} name={`${item.key}-number`} value={value.number} onChange={(event) => updateDocument(item.key, 'number', event.target.value)} error={docErrors[0] && !value.number ? docErrors[0] : null} maxLength={100} placeholder="Enter document number" required={item.requirement === 'required'} />
                    {item.dates.includes('issue') && <Field label="Issue date" name={`${item.key}-issue`} type="date" value={value.issue} onChange={(event) => updateDocument(item.key, 'issue', event.target.value)} max={todayInputValue()} required />}
                    {item.dates.includes('expiry') && <Field label="Expiration date" name={`${item.key}-expiry`} type="date" value={value.expiry} onChange={(event) => updateDocument(item.key, 'expiry', event.target.value)} min={todayInputValue()} required />}
                  </div>
                  {docErrors.length > 0 && <p className={styles.error}>{docErrors.join(' ')}</p>}
                </div>
                <div className={styles.docRight}>
                  <input className={styles.fileInput} id={`file-${item.key}`} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) handleFile(item.key, file); }} />
                  {!file ? <label className={styles.dropZone} htmlFor={`file-${item.key}`} onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add(styles.dropOver); }} onDragLeave={(event) => event.currentTarget.classList.remove(styles.dropOver)} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove(styles.dropOver); const fileDrop = event.dataTransfer.files?.[0]; if (fileDrop) handleFile(item.key, fileDrop); }}>
                    <span className={styles.dropIcon}><Icon name="upload" /></span><span><b>Drag and drop your file here</b><small>or choose a file from your computer</small></span><span className={styles.browse}>Browse file</span><small>PDF, JPG or PNG · up to 5 MB</small>
                  </label> : <div className={styles.filePanel}>
                    <div className={styles.fileTop}><span className={styles.fileThumb}><Icon name="file" /></span><span className={styles.fileInfo}><b title={file.name}>{file.name}</b><small>{(file.mimeType || '').split('/').pop()?.toUpperCase()} · {formatSize(file.size)}</small></span></div>
                    {file.status === 'uploading' && <div className={styles.progressTrack}><div style={{ width: `${file.progress || 0}%` }} /></div>}
                    <div className={styles.fileActions}>{file.server && <button type="button" className={styles.buttonSmall} onClick={() => viewFile(item.key)}>View</button>}{file.status === 'error' && <button type="button" className={styles.buttonSmall} onClick={() => handleFile(item.key, file.raw)}>Retry</button>}{file.status === 'uploading' ? <span className={`${styles.buttonSmall} ${styles.disabledAction}`} aria-disabled="true">Replace</span> : <label className={styles.buttonSmall} htmlFor={`file-${item.key}`}>Replace</label>}<button type="button" className={`${styles.buttonSmall} ${styles.removeButton}`} disabled={file.status === 'uploading'} onClick={() => removeFile(item.key)}>Remove</button></div>
                  </div>}
                </div>
              </article>;
            })}
          </div>
        </section>
      </div>}

      {step === 3 && <div className={styles.formBody}>
        {hasValidationErrors(validateShopApplication(fields, businessType, documents))
          ? <div className={styles.issues}><b>Fix these before submitting</b><ul>
            {Object.entries(validateShopApplication(fields, businessType, documents)).flatMap(([key, value]) => key === 'documents'
              ? Object.entries(value || {}).flatMap(([docKey, messages]) => messages.map((message) => <li key={`${docKey}-${message}`}>{documentList.find((item) => item.key === docKey)?.name}: {message} <button className={styles.linkButton} type="button" onClick={() => { setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Fix</button></li>))
              : value ? [<li key={key}>{value} <button className={styles.linkButton} type="button" onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Fix</button></li>] : [])}
          </ul></div>
          : <div className={styles.allGood}>Everything looks complete. Your application is ready for verification.</div>}
        <ReviewCard title="Owner and shop" onEdit={() => setStep(1)} rows={[
          ['Owner', fields.owner], ['Shop name', fields.shop], ['Contact number', fields.phone], ['Contact email', fields.email],
        ]} />
        <ReviewCard title="Address and location" onEdit={() => setStep(1)} rows={[
          ['Address', fullAddress], ['Map pin', fields.lat && fields.lng ? `${fields.lat}, ${fields.lng}${fields.confirmed ? ' · Confirmed' : ' · Not confirmed'}` : 'Not pinned. Your address will be used.'],
        ]} />
        <ReviewCard title="Business registration" onEdit={() => setStep(2)} rows={[
          ['Business type', BUSINESS_TYPES.find((item) => item.value === businessType)?.title],
          ...documentList.filter((item) => item.requirement === 'required' || documents[item.key]?.file || documents[item.key]?.number.trim()).map((item) => {
            const value = documents[item.key];
            return [item.name, `${value.number || 'Missing number'}${value.file ? ` · ${value.file.name} (${value.file.status === 'uploaded' ? 'Uploaded' : value.file.status})` : ' · Missing file'}`];
          }),
        ]} />
      </div>}

      {banner && <div className={styles.banner} role="alert">{banner}</div>}
      <footer className={styles.footer}>
        <span className={styles.footerHint}>{step === 3 ? '' : '* Required fields'}</span>
        <div className={styles.footerActions}>
          {step > 1 && <button className={styles.button} type="button" onClick={() => setStep((current) => current - 1)}>Back</button>}
          <button className={styles.button} type="button" disabled={saving || submitting} onClick={saveDraft}>{saving ? 'Saving…' : 'Save as draft'}</button>
          <button className={`${styles.button} ${styles.primary}`} type="button" disabled={submitting} onClick={advance}>{submitting ? <><span className={styles.spinner} />Submitting…</> : ['Continue to documents', 'Continue to review', 'Submit for verification'][step - 1]}</button>
        </div>
      </footer>
      {draftAt && <p className={styles.savedAt}>Last saved {new Date(draftAt).toLocaleString()}</p>}

      {preview && <div className={styles.modal} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
        <button className={`${styles.button} ${styles.closeModal}`} type="button" onClick={() => setPreview(null)}>Close</button>
        {preview.type?.startsWith('image/') ? <img src={preview.url} alt={preview.name} /> : <iframe src={preview.url} title={preview.name} />}
      </div>}
      <div className={`${styles.toast} ${toastMessage ? styles.toastVisible : ''}`} role="status">{toastMessage}</div>
    </section>
  </RegistrationShell>;
}

function ReviewCard({ title, rows, onEdit }) {
  return <section className={styles.reviewCard}>
    <header><b>{title}</b><button className={styles.linkButton} type="button" onClick={onEdit}>Edit</button></header>
    {rows.map(([label, value]) => <div className={styles.reviewRow} key={label}><span>{label}</span><div>{value || '—'}</div></div>)}
  </section>;
}
