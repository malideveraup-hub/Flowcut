import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../../api/httpClient';
import { fetchMyQueue, fetchPublicServices, fetchPublicShops, fetchPublishedMapImages } from '../../api/shopApi';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../hooks/useAuth';
import { TERMS_SUMMARY, PRIVACY_SUMMARY } from '../../constants/legal';
import styles from './WebsiteGuide.module.css';
import RoleGuide from './RoleGuide';
import { ROLE_GUIDES } from './roleGuideContent';

const STEPS = [
  {
    id: 'account',
    category: 'ACCOUNT ACCESS',
    title: 'Start with your account.',
    copy: 'Browse shops without signing in. Create a customer account when you are ready to join a queue and manage your account.',
    points: ['Sign in with your FlowCut account.', 'Create a customer account if you are new.', 'Use the existing password recovery flow if you lose access.'],
    tip: 'Joining a queue and viewing your personal queue require a customer account.',
    caption: 'Sign in, registration, and account recovery routes',
  },
  {
    id: 'discover',
    category: 'SHOP DISCOVERY',
    title: 'Find your next fresh cut.',
    copy: 'Browse real, currently listed shops. Search, filter by wait and rating, and switch between the list and the discovery map.',
    points: ['Check shop addresses and current wait estimates.', 'Use the map or list view and the available filters.', 'Open a shop card to see its details and published photo.'],
    tip: 'FlowCut does not request your location here; distance filtering is not available because shop coordinates are not provided.',
    caption: 'Live shop listings and published shop photos',
  },
  {
    id: 'choose',
    category: 'SHOP DETAILS',
    title: 'Find a shop that fits.',
    copy: 'Compare the shop information FlowCut actually provides before opening its details or queue.',
    points: ['Review the shop name, address, and published photo.', 'Check actual customer ratings when available.', 'Service and price details are shown only when listed by the shop.'],
    tip: 'A shop without submitted ratings is labelled “No ratings yet”; no example ratings are invented.',
    caption: 'Real shop information from the public directory',
  },
  {
    id: 'join',
    category: 'JOIN A QUEUE',
    title: 'Take your place in line.',
    copy: 'Choose a shop and review its real services and prices. FlowCut only creates a queue entry after you confirm on the shop’s queue page.',
    points: ['Open a shop to view the services it has published.', 'Choose your service on the real queue page.', 'Sign in and confirm only when you are ready to join.'],
    tip: 'This guide is read-only. Its preview cannot create a queue entry.',
    caption: 'Published services, shown read-only',
  },
  {
    id: 'track',
    category: 'QUEUE TRACKING',
    title: 'Know when you’re up.',
    copy: 'My Queue loads your own current queue entry from FlowCut. If you are not signed in, the guide does not request private queue data.',
    points: ['See your position and estimated wait when you have an active queue.', 'Check the latest queue status from My Queue.', 'Leave or check in only from the actual My Queue page.'],
    tip: 'The preview below is live account data when available, never a sample queue position.',
    caption: 'Your current queue state, or a clear empty/sign-in state',
  },
  {
    id: 'profile',
    category: 'YOUR ACCOUNT',
    title: 'Keep your account close.',
    copy: 'Open your customer profile to manage available account details, saved shops, and queue history.',
    points: ['Use Profile to view account and history sections.', 'Saved shops and history are available from the profile page.', 'Sign out using the account controls when you are finished.'],
    tip: 'The guide does not display private contact details.',
    caption: 'Your account status and the real profile destination',
  },
];

function getWaitText(shop) {
  if (shop?.waitMin == null || !Number.isFinite(shop.waitMin)) return 'Wait estimate unavailable';
  if (shop.waitMin === 0 && (shop.waitMax == null || shop.waitMax === 0)) return 'No wait';
  return `${shop.waitMin}–${Number.isFinite(shop.waitMax) ? shop.waitMax : shop.waitMin} min wait`;
}

function ShopPhoto({ image, shopName }) {
  const [failed, setFailed] = useState(false);
  if (!image || !image.imageUrl || failed) {
    return <div className={styles.photoFallback} aria-label={image ? 'Shop photo unavailable' : 'No published shop photo'}>{image ? 'Photo unavailable' : 'No published photo'}</div>;
  }
  const version = image.updatedAt || image.uploadedAt;
  const imageSource = `${API_BASE}${image.imageUrl}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
  return <img className={styles.shopPhoto} src={imageSource} alt={`${shopName}: ${image.title || 'shop photo'}`} loading="lazy" onError={() => setFailed(true)} />;
}

function GuideLink({ to, children, secondary = false }) {
  return <Link className={`${styles.actionLink} ${secondary ? styles.secondaryLink : ''}`} to={to}>{children}<span aria-hidden="true">→</span></Link>;
}

function GuideDemo({ step, shops, shopsLoading, shopsError, images, imagesLoading, imagesError, selectedShop, onSelectShop, services, servicesLoading, servicesError, role, user, queue, queueLoading, queueError }) {
  const imageByShop = useMemo(() => new Map((images || []).map((image) => [String(image.shopId), image])), [images]);
  const exampleShop = selectedShop || shops?.[0] || null;
  const shopsWithPublishedPhotos = useMemo(() => {
    if (!shops) return [];
    const photoShopIds = new Set((images || []).map((image) => String(image.shopId)));
    return [...shops.filter((shop) => photoShopIds.has(String(shop.id))), ...shops.filter((shop) => !photoShopIds.has(String(shop.id)))];
  }, [images, shops]);

  if (step.id === 'account') {
    return (
      <div className={styles.accountDemo}>
        <div className={styles.demoIcon} aria-hidden="true">FC</div>
        <div><span className={styles.demoLabel}>CUSTOMER ACCESS</span><strong>Start wherever you are.</strong><p>Account actions use FlowCut’s existing authentication pages.</p></div>
        <div className={styles.demoActions}>
          <GuideLink to="/login">Sign in</GuideLink>
          <GuideLink to="/register" secondary>Create account</GuideLink>
          <GuideLink to="/forgot-password" secondary>Forgot password</GuideLink>
        </div>
      </div>
    );
  }

  if (step.id === 'discover' || step.id === 'choose') {
    if (shopsLoading || imagesLoading) return <div className={styles.demoState} role="status">Loading the live shop directory…</div>;
    if (shopsError) return <div className={styles.demoState} role="alert">Couldn’t load shops: {shopsError.message}</div>;
    if (imagesError) return <div className={styles.demoState} role="alert">Shop photos couldn’t be loaded: {imagesError.message}</div>;
    if (!shops?.length) return <div className={styles.demoState}>There are no public shops to show yet. <GuideLink to="/discover">Open Discover</GuideLink></div>;

    const items = step.id === 'choose' ? shopsWithPublishedPhotos.slice(0, 1) : shopsWithPublishedPhotos.slice(0, 3);
    return (
      <div className={styles.shopDemoList}>
        {items.map((shop) => {
          const image = imageByShop.get(String(shop.id));
          return (
            <Link className={styles.shopDemoCard} to={`/shops/${shop.id}`} key={shop.id}>
              <ShopPhoto image={image} shopName={shop.name} />
              <span className={styles.shopDemoCopy}>
                <span className={styles.shopDemoName}>{shop.name}</span>
                <span className={styles.shopDemoAddress}>{shop.address || 'Address unavailable'}</span>
                <span className={styles.shopDemoMeta}>
                  <span>{shop.rating == null ? 'No ratings yet' : `★ ${Number(shop.rating).toFixed(1)} · ${shop.ratingCount} ratings`}</span>
                  <span>{getWaitText(shop)}</span>
                </span>
              </span>
            </Link>
          );
        })}
        <GuideLink to={step.id === 'discover' ? '/discover' : `/shops/${items[0].id}`}>{step.id === 'discover' ? 'Explore the map and all shops' : 'View shop details'}</GuideLink>
      </div>
    );
  }

  if (step.id === 'join') {
    if (shopsLoading) return <div className={styles.demoState} role="status">Loading shops and services…</div>;
    if (shopsError) return <div className={styles.demoState} role="alert">Couldn’t load shops: {shopsError.message}</div>;
    if (!shops?.length) return <div className={styles.demoState}>There are no public shops to show yet. <GuideLink to="/discover">Open Discover</GuideLink></div>;
    return (
      <div className={styles.serviceDemo}>
        <label className={styles.shopSelectLabel} htmlFor="guide-shop-select">Preview a shop’s services</label>
        <select id="guide-shop-select" className={styles.shopSelect} value={exampleShop?.id || ''} onChange={(event) => onSelectShop(shops.find((shop) => String(shop.id) === event.target.value) || shops[0])}>
          {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
        </select>
        <p className={styles.selectedShopName}>{exampleShop?.name}</p>
        {servicesLoading ? <p className={styles.demoState} role="status">Loading published services…</p>
          : servicesError ? <p className={styles.demoState} role="alert">Couldn’t load services: {servicesError.message}</p>
            : !services?.length ? <p className={styles.demoState}>This shop has not listed a service yet.</p>
              : <ul className={styles.serviceList}>{services.slice(0, 4).map((service) => (
                <li key={service.id}><span><strong>{service.name}</strong><small>{service.estimatedDuration} min</small></span><b>{service.price == null ? 'Price unavailable' : `₱${Number(service.price).toLocaleString('en-PH')}`}</b></li>
              ))}</ul>}
        <p className={styles.readOnlyNote}>Read-only preview · no queue has been started.</p>
        {exampleShop && <GuideLink to={`/shops/${exampleShop.id}/queue`}>Review this shop’s queue</GuideLink>}
      </div>
    );
  }

  if (step.id === 'track') {
    if (role !== 'customer') {
      return <div className={styles.queueDemo}><span className={styles.statusDot} /><strong>Sign in as a customer to view your queue.</strong><p>Private queue data is only requested for an authenticated customer account.</p><GuideLink to="/login">Sign in</GuideLink></div>;
    }
    if (queueLoading) return <div className={styles.demoState} role="status">Checking your current queue…</div>;
    if (queueError) return <div className={styles.demoState} role="alert">Couldn’t load your queue: {queueError.message}<br /><GuideLink to="/my-queue">Open My Queue</GuideLink></div>;
    if (!queue) return <div className={styles.queueDemo}><span className={styles.statusDot} /><strong>You’re not in a queue right now.</strong><p>Discover shops and join when you are ready. This is your actual account state.</p><GuideLink to="/discover">Find a shop</GuideLink></div>;
    return (
      <div className={styles.queueDemo}>
        <span className={styles.livePill}><i />{queue.status.replaceAll('_', ' ')}</span>
        <strong>{queue.shopName || queue.shop?.name || 'Your shop'}</strong>
        <div className={styles.queueFacts}><span><small>Your position</small><b>{queue.status === 'IN_SERVICE' ? 'Now serving' : `#${queue.aheadCount + 1}`}</b></span><span><small>Estimated wait</small><b>{queue.status === 'CALLED' || queue.status === 'IN_SERVICE' ? 'Ready soon' : `${queue.wait.min}–${queue.wait.max} min`}</b></span></div>
        <p>Live information from your account. Manage your queue on its real page.</p>
        <GuideLink to="/my-queue">Open My Queue</GuideLink>
      </div>
    );
  }

  return (
    <div className={styles.profileDemo}>
      <div className={styles.avatar} aria-hidden="true">{role === 'customer' && user?.name ? user.name.trim().charAt(0).toUpperCase() : 'U'}</div>
      <span><small>ACCOUNT</small><strong>{role === 'customer' ? user?.name || 'Customer account' : 'Your FlowCut account'}</strong><p>{role === 'customer' ? 'Customer account signed in' : 'Sign in to view your profile, saved shops, and history.'}</p></span>
      <GuideLink to={role === 'customer' ? '/profile' : '/login'}>{role === 'customer' ? 'Open Profile' : 'Sign in'}</GuideLink>
    </div>
  );
}

export default function WebsiteGuide() {
  const { role, user } = useAuth();
  const [selectedGuide, setSelectedGuide] = useState('customer');
  const { data: shops, loading: shopsLoading, error: shopsError, refetch: refreshShops } = useAsync(fetchPublicShops);
  const { data: images, loading: imagesLoading, error: imagesError, refetch: refreshImages } = useAsync(fetchPublishedMapImages);
  const [activeStep, setActiveStep] = useState(STEPS[0].id);
  const [selectedShopId, setSelectedShopId] = useState('');
  const selectedShop = shops?.find((shop) => String(shop.id) === selectedShopId) || shops?.[0] || null;
  const selectedShopIdForServices = selectedShop?.id;
  const serviceLoader = useCallback(() => selectedShopIdForServices ? fetchPublicServices(selectedShopIdForServices) : Promise.resolve([]), [selectedShopIdForServices]);
  const { data: services, loading: servicesLoading, error: servicesError } = useAsync(serviceLoader, [selectedShopIdForServices]);
  const queueLoader = useCallback(() => role === 'customer' ? fetchMyQueue() : Promise.resolve(null), [role]);
  const { data: queue, loading: queueLoading, error: queueError } = useAsync(queueLoader, [role]);

  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') {
        void refreshShops({ quiet: true });
        void refreshImages({ quiet: true });
      }
    };
    const interval = window.setInterval(refreshOnReturn, 15000);
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [refreshImages, refreshShops]);

  useEffect(() => {
    const sections = STEPS.map(({ id }) => document.getElementById(`guide-${id}`)).filter(Boolean);
    if (!sections.length || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveStep(visible.target.id.replace('guide-', ''));
    }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, 0.2, 0.5, 0.8] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  function goToStep(id) {
    setActiveStep(id);
    document.getElementById(`guide-${id}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}><span />{selectedGuide === 'customer' ? 'THE FLOWCUT GUIDE' : ROLE_GUIDES[selectedGuide].eyebrow}</p>
          <h1>{selectedGuide === 'customer' ? <>Your next cut.<br /><em>One clear flow.</em></> : <>{ROLE_GUIDES[selectedGuide].title}</>}</h1>
          <p className={styles.heroCopy}>{selectedGuide === 'customer'
            ? 'Find a nearby shop, join its queue, and know where you stand. Get familiar with FlowCut, one screen at a time.'
            : ROLE_GUIDES[selectedGuide].intro}</p>
          <div className={styles.heroActions}>
            {selectedGuide === 'customer' ? <>
              <GuideLink to="/discover">Explore Discover</GuideLink><GuideLink to="/register-shop" secondary>Register your shop</GuideLink><GuideLink to="/login" secondary>Sign in</GuideLink>
            </> : selectedGuide === 'barber' ? <>
              <GuideLink to="/barber">Barber dashboard</GuideLink><GuideLink to="/login" secondary>Sign in</GuideLink>
            </> : <>
              <GuideLink to="/register-shop">Register your shop</GuideLink><GuideLink to="/login" secondary>Sign in</GuideLink>
            </>}
          </div>
          <div className={styles.rolePanel}>
            <span className={styles.roleLabel}>CHOOSE YOUR GUIDE</span>
            <div className={styles.roleOptions} role="group" aria-label="Available FlowCut guides">
              <button type="button" className={selectedGuide === 'customer' ? styles.roleActive : ''} aria-pressed={selectedGuide === 'customer'} onClick={() => setSelectedGuide('customer')}>Customer <span>Available</span></button>
              <button type="button" className={selectedGuide === 'barber' ? styles.roleActive : ''} aria-pressed={selectedGuide === 'barber'} onClick={() => setSelectedGuide('barber')}>Barber <span>Available</span></button>
              <button type="button" className={selectedGuide === 'owner' ? styles.roleActive : ''} aria-pressed={selectedGuide === 'owner'} onClick={() => setSelectedGuide('owner')}>Shop Owner <span>Available</span></button>
            </div>
            <p>{selectedGuide === 'customer'
              ? 'Choose a guide to see instructions for that role. Each guide links to the actual FlowCut pages and available controls.'
              : `Showing the ${ROLE_GUIDES[selectedGuide].label} guide. Role-protected destinations require the matching FlowCut account.`}</p>
          </div>
        </div>
      </section>

      {selectedGuide === 'customer' ? <>
      <section className={styles.overview}>
        <div className={styles.overviewHead}>
          <div><p className={styles.sectionEyebrow}>CUSTOMER EDITION</p><h2>A quick tour, from browse to barber chair.</h2></div>
          <span className={styles.readingTime}>6 steps · About 4 minutes</span>
        </div>
        <div className={styles.overviewGrid}>
          {[
            ['01', 'Account', 'Sign in or create your account.'],
            ['02', 'Discover', 'Explore real shops and the map.'],
            ['03', 'Choose', 'Compare shop details and ratings.'],
            ['04', 'Join', 'Review services before you join.'],
            ['05', 'Track', 'Check your real queue status.'],
            ['06', 'Profile', 'Manage your account and history.'],
          ].map(([number, title, copy]) => <button type="button" key={number} onClick={() => goToStep(STEPS[Number(number) - 1].id)}><span>{number}</span><strong>{title}</strong><small>{copy}</small></button>)}
        </div>
      </section>

      <div className={styles.guideLayout}>
        <nav className={styles.toc} aria-label="Website guide steps">
          <span className={styles.tocLabel}>YOUR JOURNEY</span>
          {STEPS.map((step, index) => (
            <button type="button" key={step.id} className={activeStep === step.id ? styles.tocActive : ''} aria-current={activeStep === step.id ? 'step' : undefined} onClick={() => goToStep(step.id)}>
              <span>{String(index + 1).padStart(2, '0')}</span>{step.title.replace('.', '')}
            </button>
          ))}
        </nav>

        <div className={styles.steps}>
          {STEPS.map((step, index) => (
            <section className={styles.step} id={`guide-${step.id}`} key={step.id} aria-labelledby={`title-${step.id}`}>
              <div className={styles.stepCopy}>
                <span className={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</span>
                <p className={styles.sectionEyebrow}>{step.category}</p>
                <h2 id={`title-${step.id}`}>{step.title}</h2>
                <p className={styles.stepDescription}>{step.copy}</p>
                <ul className={styles.checkList}>{step.points.map((point) => <li key={point}><span aria-hidden="true">✓</span>{point}</li>)}</ul>
                <p className={styles.tip}><strong>Good to know</strong>{step.tip}</p>
              </div>
              <div className={styles.demoColumn}>
                <div className={styles.demoFrame}>
                  <div className={styles.demoFrameBar}><span /><span /><span /><small>FLOWCUT · LIVE PREVIEW</small></div>
                  <GuideDemo step={step} shops={shops} shopsLoading={shopsLoading} shopsError={shopsError} images={images} imagesLoading={imagesLoading} imagesError={imagesError} selectedShop={selectedShop} onSelectShop={(shop) => setSelectedShopId(String(shop.id))} services={services} servicesLoading={servicesLoading} servicesError={servicesError} role={role} user={user} queue={queue} queueLoading={queueLoading} queueError={queueError} />
                </div>
                <p className={styles.caption}>{step.caption}</p>
              </div>
            </section>
          ))}
        </div>
      </div>

      <section className={styles.support}>
        <div className={styles.supportCard}>
          <span className={styles.supportIcon} aria-hidden="true">↗</span>
          <p className={styles.sectionEyebrow}>PLAN AHEAD</p>
          <h2>A little less guesswork.</h2>
          <p>Check a shop’s estimated wait before heading over. If you have joined a queue, My Queue shows your current position and wait estimate.</p>
          <GuideLink to="/discover">Find a shop</GuideLink>
        </div>
        <div className={styles.supportCard}>
          <span className={styles.supportIcon} aria-hidden="true">?</span>
          <p className={styles.sectionEyebrow}>ACCOUNT ACCESS</p>
          <h2>Need help signing in?</h2>
          <p>Use FlowCut’s password recovery page or return to sign in. A separate customer support contact is not configured in this project.</p>
          <div className={styles.supportLinks}><GuideLink to="/forgot-password">Recover access</GuideLink><GuideLink to="/login" secondary>Go to sign in</GuideLink></div>
        </div>
      </section>
      </> : <RoleGuide key={selectedGuide} guide={ROLE_GUIDES[selectedGuide]} />}

      <footer className={styles.footer}>
        <div className={styles.compactFooter}>
          <Link className={styles.footerBrand} to="/"><span className={styles.brandMark} aria-hidden="true" />FLOWCUT</Link>
          <span>Website guide · {selectedGuide === 'customer' ? 'Customer edition' : ROLE_GUIDES[selectedGuide].edition}</span>
          <nav aria-label="Guide shortcuts"><Link to="/discover">Discover</Link><Link to="/login">Sign in</Link><Link to="/register-shop">Register your shop</Link></nav>
        </div>
        <div className={styles.footerGrid}>
          <div className={styles.footerBrandColumn}>
            <Link className={styles.footerBrand} to="/"><span className={styles.brandMark} aria-hidden="true" />FLOWCUT</Link>
            <strong>Skip the wait. Know your place in line.</strong>
            <p>FlowCut connects customers with nearby barbers and shops, helping them discover services and manage their place in line.</p>
          </div>
          <div><h2>Solutions</h2><Link to="/discover">Customers · Discover</Link><Link to="/login">Barbers · Sign in</Link><Link to="/register-shop">Shop owners</Link><Link to="/discover">Queue app</Link></div>
          <div><h2>Company</h2><Link to="/guide">Website guide</Link><span className={styles.unavailable}>Help &amp; FAQ · not available</span><a href="#terms-summary">Terms summary</a><a href="#privacy-summary">Privacy summary</a></div>
          <div className={styles.newsletter}>
            <h2>Stay updated.</h2>
            <p>Get tips and updates from the FlowCut team, delivered to your inbox.</p>
            <form onSubmit={(event) => event.preventDefault()}>
              <label htmlFor="guide-newsletter-email">Email address</label>
              <div><input id="guide-newsletter-email" type="email" placeholder="you@example.com" disabled aria-describedby="newsletter-status" /><button type="submit" disabled>Subscribe</button></div>
              <small id="newsletter-status">Newsletter signup is not connected yet. Your email will not be collected.</small>
            </form>
          </div>
        </div>
        <div className={styles.legalSummaries}>
          <details id="terms-summary"><summary>Terms and Conditions summary</summary><ul>{TERMS_SUMMARY.map((item) => <li key={item}>{item}</li>)}</ul></details>
          <details id="privacy-summary"><summary>Privacy / Data Use summary</summary><ul>{PRIVACY_SUMMARY.map((item) => <li key={item}>{item}</li>)}</ul></details>
          <p>These are the summaries shown during registration, not complete legal policy pages.</p>
        </div>
        <div className={styles.bottomFooter}>
          <span>© {new Date().getFullYear()} FlowCut. All rights reserved.</span>
          <nav aria-label="Legal and support links"><a href="#privacy-summary">Privacy</a><a href="#terms-summary">Terms</a><span>Contact support · not configured</span></nav>
        </div>
      </footer>
    </div>
  );
}
