import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublicShops } from '../../api/shopApi';
import ShopCard from '../../components/customer/ShopCard';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import styles from './Landing.module.css';

const STYLES = [
  { name: 'Textured Crop', tag: 'Most picked', g1: '#7c3aed', g2: '#2563eb' },
  { name: 'Low Fade Pompadour', tag: 'Popular in PH', g1: '#4c1d95', g2: '#1d4ed8' },
  { name: 'Korean Perm Fringe', tag: 'Trending', g1: '#6d28d9', g2: '#0ea5e9' },
  { name: 'Skin Fade Undercut', tag: 'Popular in PH', g1: '#312e81', g2: '#7c3aed' },
];

const FREE_FEATURES = [
  'Browse public barbershops and current wait estimates',
  'Join a queue online and track your position',
  'Get queue updates and turn reminders',
  'Save favorite shops and view visit history',
  'Join in person with a shop QR code',
];

const PLUS_FEATURES = [
  { label: 'Everything available in Free', planned: false },
  { label: 'Enhanced queue reminders', planned: true },
  { label: 'Personalized hairstyle recommendations', planned: true },
];

const FAQ = [
  ['Do I need an account to join a queue?', 'You can browse shops without signing in. You will need a customer account to confirm a queue entry and manage your place in line.'],
  ['How accurate are wait estimates?', 'Wait times are estimates based on the shop queue and service durations. They can change as customers join, leave, or move through the queue.'],
  ['How do I join a shop queue?', 'Open a shop to review its details and services, then confirm from its queue page. You can also scan the shop QR code when you arrive.'],
  ['Can I leave a queue?', 'Yes. Open My Queue to view your current entry and leave when needed.'],
  ['Is FlowCut Plus available?', 'Not yet. The 7-day trial and Plus subscription are planned. Pricing will be announced before the plan launches.'],
  ['How can I register my barbershop?', 'Create an account and submit your shop through Register your shop. The FlowCut team reviews applications before a shop is published.'],
];

const CHECK_PATH = 'M5 12l5 5 9-10';

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d={CHECK_PATH} />
    </svg>
  );
}

export default function Landing() {
  const { data: shops, loading, error, refetch } = useAsync(fetchPublicShops);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const touchStartX = useRef(null);

  const filteredShops = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const availableShops = shops || [];
    if (!normalized) return availableShops;
    return availableShops.filter((shop) => `${shop.name} ${shop.address || ''}`.toLowerCase().includes(normalized));
  }, [query, shops]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mediaQuery) return undefined;
    const updatePreference = (event) => setReducedMotion(event.matches);
    mediaQuery.addEventListener?.('change', updatePreference);
    return () => mediaQuery.removeEventListener?.('change', updatePreference);
  }, []);

  useEffect(() => {
    if (paused || hovered || reducedMotion) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % STYLES.length), 4500);
    return () => window.clearInterval(timer);
  }, [hovered, paused, reducedMotion]);

  function goTo(index) {
    setActive((index + STYLES.length) % STYLES.length);
  }

  function handleSearch(event) {
    event.preventDefault();
    setQuery((current) => current.trim());
  }

  function handleCarouselKeyDown(event) {
    if (event.key === 'ArrowLeft') goTo(active - 1);
    if (event.key === 'ArrowRight') goTo(active + 1);
  }

  const automaticSlidesPaused = paused || reducedMotion;

  return (
    <div className={styles.landing}>
      <section className={styles.hero} id="home" aria-labelledby="hero-title">
        <div className={styles.wrap}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}><span className={styles.eyebrowDot} aria-hidden="true" />Find a chair without the wait</p>
              <h1 id="hero-title">Skip the wait.<br /><span>Queue smart.</span></h1>
              <p className={styles.sub}>See estimated wait times at nearby barbershops, then join a queue online when you find the right chair.</p>
              <div className={styles.ctaRow}>
                <Link className={`${styles.button} ${styles.buttonSolid}`} to="/discover">Join a queue <span aria-hidden="true">{'\u2192'}</span></Link>
                <Link className={`${styles.button} ${styles.buttonGhost}`} to="/discover">Find shops near me</Link>
              </div>
            </div>

            <div
              className={styles.showcase}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onFocus={() => setHovered(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false);
              }}
              onKeyDown={handleCarouselKeyDown}
              aria-label="Featured haircut styles"
              aria-roledescription="carousel"
              role="region"
            >
              <div
                className={styles.stack}
                onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
                onTouchEnd={(event) => {
                  if (touchStartX.current === null) return;
                  const deltaX = event.changedTouches[0].clientX - touchStartX.current;
                  if (Math.abs(deltaX) > 40) goTo(active + (deltaX < 0 ? 1 : -1));
                  touchStartX.current = null;
                }}
              >
                {STYLES.map((style, index) => {
                  let offset = (index - active + STYLES.length) % STYLES.length;
                  if (offset > STYLES.length / 2) offset -= STYLES.length;
                  const distance = Math.abs(offset);
                  return (
                    <button
                      className={styles.styleCard}
                      key={style.name}
                      type="button"
                      tabIndex={distance > 2 ? -1 : 0}
                      aria-label={`Show ${style.name}`}
                      aria-current={index === active ? 'true' : undefined}
                      aria-hidden={distance > 2}
                      onClick={() => goTo(index === active ? active + 1 : index)}
                      style={{
                        '--card-g1': style.g1,
                        '--card-g2': style.g2,
                        '--offset': offset,
                        '--distance': distance,
                        zIndex: 10 - distance,
                        opacity: distance > 2 ? 0 : 1 - distance * 0.32,
                        pointerEvents: distance > 2 ? 'none' : 'auto',
                        filter: distance === 0 ? 'none' : `brightness(${1 - distance * 0.18})`,
                      }}
                    >
                      <span className={styles.art} aria-hidden="true">
                        <svg viewBox="0 0 340 430" preserveAspectRatio="xMidYMid slice">
                          <circle cx="250" cy="90" r="120" fill="white" fillOpacity=".08" />
                          <path d="M0 300 Q170 250 340 320 L340 430 L0 430 Z" fill="white" fillOpacity=".06" />
                        </svg>
                      </span>
                      <span className={styles.shade} aria-hidden="true" />
                      <span className={styles.cardInfo}>
                        <span className={styles.styleTag}>{style.tag}</span>
                        <span className={styles.styleName}>{style.name}</span>
                        <span className={styles.styleLocation}>FlowCut Studio {'\u00b7'} Manila</span>
                      </span>
                    </button>
                  );
                })}
                <button className={`${styles.carouselArrow} ${styles.prev}`} type="button" aria-label="Previous style" onClick={() => goTo(active - 1)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
                </button>
                <button className={`${styles.carouselArrow} ${styles.next}`} type="button" aria-label="Next style" onClick={() => goTo(active + 1)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                </button>
              </div>
              <div className={styles.carouselControls} role="group" aria-label="Carousel controls">
                {STYLES.map((style, index) => (
                  <button
                    key={style.name}
                    type="button"
                    className={`${styles.dot} ${index === active ? styles.dotActive : ''}`}
                    aria-label={`Show style ${index + 1}: ${style.name}`}
                    aria-current={index === active ? 'true' : undefined}
                    onClick={() => goTo(index)}
                  />
                ))}
                <button
                  className={styles.playPause}
                  type="button"
                  aria-pressed={automaticSlidesPaused}
                  aria-label={reducedMotion ? 'Automatic slides are disabled to respect reduced motion' : automaticSlidesPaused ? 'Play automatic slides' : 'Pause automatic slides'}
                  disabled={reducedMotion}
                  onClick={() => setPaused((value) => !value)}
                >
                  {automaticSlidesPaused
                    ? <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    : <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>}
                </button>
              </div>
              <p className={styles.swipeHint}>Swipe or tap to explore styles</p>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.howSection}`} aria-labelledby="how-title">
        <div className={styles.wrap}>
          <div className={styles.sectionIntro}>
            <p className={styles.sectionLabel}>How it works</p>
            <h2 id="how-title">Three steps to a shorter wait.</h2>
            <p>No more standing around to find out how long it will take.</p>
          </div>
          <ol className={styles.steps}>
            <li className={styles.step}><span className={styles.stepNumber} aria-hidden="true">1</span><h3>Find a shop</h3><p>Browse barbershops and check the estimated wait before you head out.</p></li>
            <li className={styles.step}><span className={styles.stepNumber} aria-hidden="true">2</span><h3>Join the queue</h3><p>Join online from anywhere, or scan the shop QR code when you arrive.</p></li>
            <li className={styles.step}><span className={styles.stepNumber} aria-hidden="true">3</span><h3>Keep your place</h3><p>Track your queue position and get updates as your turn approaches.</p></li>
          </ol>
        </div>
      </section>

      <section className={`${styles.section} ${styles.shopSection}`} id="shops" aria-labelledby="shops-title">
        <div className={styles.wrap}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionLabel}>Find your next chair</p>
              <h2 id="shops-title">Featured barbershops</h2>
            </div>
            <Link className={styles.moreLink} to="/discover">Explore all shops <span aria-hidden="true">{'\u2192'}</span></Link>
          </div>
          <form onSubmit={handleSearch} className={styles.searchForm} role="search" aria-label="Search barbershops">
            <input
              className={styles.search}
              type="search"
              placeholder="Search barbershops near you..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search barbershops"
              autoComplete="off"
            />
            <button type="submit" className={styles.searchButton}>Search <span aria-hidden="true">{'\u2192'}</span></button>
          </form>
          {query.trim() && !loading && !error && <p className={styles.resultCount} aria-live="polite">{filteredShops.length} {filteredShops.length === 1 ? 'result' : 'results'} for “{query.trim()}”</p>}
          {loading && <div className={styles.shopGrid} role="status" aria-label="Loading barbershops"><Skeleton height={182} /><Skeleton height={182} /><Skeleton height={182} /></div>}
          {error && <EmptyState skin="pixel" title="We couldn't load barbershops" body={error.message || 'Check your connection and try again.'} actionLabel="Try again" onAction={() => void refetch()} />}
          {!loading && !error && shops?.length === 0 && (
            <EmptyState skin="pixel" title="No barbershops yet" body="Approved shops will appear here as soon as they join FlowCut." />
          )}
          {!loading && !error && shops?.length > 0 && filteredShops.length === 0 && (
            <EmptyState skin="pixel" title="No shops match that search" body="Try a different shop name or area." actionLabel="Clear search" onAction={() => setQuery('')} />
          )}
          {!loading && !error && filteredShops.length > 0 && (
            <div className={styles.shopGrid}>{filteredShops.slice(0, 6).map((shop) => <ShopCard shop={shop} key={shop.id} />)}</div>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.plansSection}`} aria-labelledby="plans-title">
        <div className={styles.wrap}>
          <div className={styles.sectionIntro}>
            <span className={styles.comingSoon}>FlowCut Plus <span aria-hidden="true">{'\u00b7'}</span> Coming soon</span>
            <h2 id="plans-title">Try Plus free for 7 days.</h2>
            <p>FlowCut is free to use. Plus is planned for customers who want a little more from each visit.</p>
          </div>
          <div className={styles.planGrid}>
            <article className={styles.planCard} aria-labelledby="free-plan-title">
              <div className={styles.planTitle}><h3 id="free-plan-title">Free</h3></div>
              <p className={styles.planDescription}>Everything you need to find a shop and join its queue.</p>
              <ul className={styles.featureList}>{FREE_FEATURES.map((feature) => <li key={feature}><span className={styles.featureIcon}><CheckIcon /></span><span>{feature}</span></li>)}</ul>
              <Link className={`${styles.button} ${styles.planButton}`} to="/discover">Find a barbershop</Link>
            </article>
            <article className={`${styles.planCard} ${styles.plusPlan}`} aria-labelledby="plus-plan-title">
              <div className={styles.planTitle}><h3 id="plus-plan-title">Plus</h3><span className={styles.planPill}>Planned <span aria-hidden="true">{'\u00b7'}</span> 7-day trial</span></div>
              <p className={styles.planDescription}>More convenience and personalized features for your barbershop visits.</p>
              <p className={styles.planPrice}>Pricing coming soon</p>
              <ul className={styles.featureList}>{PLUS_FEATURES.map((feature) => (
                <li className={feature.planned ? styles.plannedFeature : ''} key={feature.label}>
                  <span className={styles.featureIcon}>{feature.planned ? <span aria-hidden="true">+</span> : <CheckIcon />}</span>
                  <span>{feature.label}{feature.planned && <span className={styles.plannedLabel}>Planned</span>}</span>
                </li>
              ))}</ul>
              <button className={`${styles.button} ${styles.planButton}`} type="button" disabled aria-disabled="true">Coming soon</button>
            </article>
          </div>
          <p className={styles.planNote}><span className={styles.noteIcon} aria-hidden="true">i</span><span>The 7-day trial and Plus subscription are planned and not available yet. After the trial, a paid subscription will be required to continue using Plus. No trial or payment starts here.</span></p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-title">
        <div className={`${styles.wrap} ${styles.faqGrid}`}>
          <div className={styles.faqIntro}>
            <p className={styles.sectionLabel}>FAQ</p>
            <h2 id="faq-title">Questions, answered.</h2>
            <p>The basics of finding a shop and joining a FlowCut queue.</p>
          </div>
          <div className={styles.questions}>
            {FAQ.map(([question, answer], index) => (
              <details className={styles.question} key={question} open={index === 0}>
                <summary>{question}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.ownerSection}`} aria-labelledby="owner-title">
        <div className={`${styles.wrap} ${styles.ownerCard}`}>
          <div>
            <p className={styles.sectionLabel}>For barbershop owners</p>
            <h2 id="owner-title">Bring your queue online.</h2>
            <p>Manage your queue, assign barbers, and give customers a shop QR code to join. Every shop is reviewed before it goes live.</p>
            <ul className={styles.ownerTags} aria-label="Shop tools"><li>Queue management</li><li>Barber assignment</li><li>Shop QR code</li><li>Reviewed listing</li></ul>
          </div>
          <Link className={`${styles.button} ${styles.buttonSolid} ${styles.ownerButton}`} to="/register-shop">Register your shop <span aria-hidden="true">{'\u2192'}</span></Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}>
              <Link className={styles.logo} to="/" aria-label="FlowCut home"><span className={styles.logoMark} aria-hidden="true" />FLOWCUT</Link>
              <p>Find your next barber, check the queue, and spend less time waiting.</p>
            </div>
            <nav className={styles.footerNav} aria-label="Explore FlowCut">
              <h3>Explore</h3>
              <ul><li><Link to="/">Home</Link></li><li><Link to="/discover">Discover</Link></li><li><Link to="/guide">Website Guide</Link></li></ul>
            </nav>
            <nav className={styles.footerNav} aria-label="Your account">
              <h3>Your account</h3>
              <ul><li><Link to="/my-queue">My Queue</Link></li><li><Link to="/profile">Profile</Link></li></ul>
            </nav>
            <nav className={styles.footerNav} aria-label="For barbershops">
              <h3>For barbershops</h3>
              <ul><li><Link to="/register-shop">Register your shop</Link></li><li><Link to="/guide">How FlowCut works</Link></li></ul>
            </nav>
          </div>
          <div className={styles.footerBottom}><span>© {new Date().getFullYear()} FlowCut. All rights reserved.</span><Link to="/guide">Website Guide</Link></div>
        </div>
      </footer>
    </div>
  );
}
