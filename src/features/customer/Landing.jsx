import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublicShops } from '../../api/shopApi';
import ShopCard from '../../components/customer/ShopCard';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import styles from './Landing.module.css';

const STYLES = [
  { name: 'Textured Crop', tag: 'Most Picked', g1: '#7c3aed', g2: '#2563eb' },
  { name: 'Low Fade Pompadour', tag: 'Popular in PH', g1: '#4c1d95', g2: '#1d4ed8' },
  { name: 'Korean Perm Fringe', tag: 'Trending', g1: '#6d28d9', g2: '#0ea5e9' },
  { name: 'Skin Fade Undercut', tag: 'Popular in PH', g1: '#312e81', g2: '#7c3aed' },
];

export default function Landing() {
  const { data: shops, loading, error } = useAsync(fetchPublicShops);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(null);

  const filteredShops = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return shops || [];
    return (shops || []).filter((shop) => `${shop.name} ${shop.address || ''}`.toLowerCase().includes(normalized));
  }, [query, shops]);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % STYLES.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [paused]);

  function goTo(index) {
    setActive((index + STYLES.length) % STYLES.length);
  }

  function handleSearch(event) {
    event.preventDefault();
    const normalized = query.trim();
    setQuery(normalized);
  }

  return (
    <div className={styles.landing}>
      <header className={styles.hero} id="home">
        <div className={styles.wrap}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}><span className={styles.eyebrowDot} />Matched to your location, in real time</p>
              <h1>Skip the wait.<br /><span>Queue smart.</span></h1>
              <p className={styles.sub}>FlowCut shows you live, estimated wait times at barbershops near you. Join a queue from wherever you are and we'll line you up with the shop that fits your location best.</p>
              <div className={styles.ctaRow}>
                <Link className={`${styles.button} ${styles.buttonSolid}`} to="/discover">Join a queue <span aria-hidden="true">→</span></Link>
                <Link className={`${styles.button} ${styles.buttonGhost}`} to="/discover">Find shops near me</Link>
              </div>
              <div className={styles.stats}>
                <div className={styles.stat}><b>~12min</b><span>Avg. wait estimate</span></div>
                <div className={styles.stat}><b>4.9★</b><span>App rating</span></div>
                <div className={styles.stat}><b>50+</b><span>Partner barbershops</span></div>
              </div>
            </div>

            <div className={styles.stackWrap}>
              <div
                className={styles.stack}
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
                onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
                onTouchEnd={(event) => {
                  if (touchStartX.current === null) return;
                  const deltaX = event.changedTouches[0].clientX - touchStartX.current;
                  if (Math.abs(deltaX) > 40) goTo(active + (deltaX < 0 ? 1 : -1));
                  touchStartX.current = null;
                }}
                aria-label="Featured hairstyle styles"
              >
                {STYLES.map((style, index) => {
                  let offset = (index - active + STYLES.length) % STYLES.length;
                  if (offset > STYLES.length / 2) offset -= STYLES.length;
                  const distance = Math.abs(offset);
                  return (
                    <button
                      className={styles.card}
                      key={style.name}
                      type="button"
                      aria-label={`${style.name}, ${style.tag}`}
                      aria-current={index === active ? 'true' : undefined}
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
                        <span className={styles.badge}>{style.tag}</span>
                        <span className={styles.hname}>{style.name}</span>
                        <span className={styles.hTagline}>FlowCut Studio · Manila</span>
                      </span>
                    </button>
                  );
                })}
                <button className={`${styles.arrow} ${styles.prev}`} type="button" aria-label="Previous style" onClick={() => goTo(active - 1)}>‹</button>
                <button className={`${styles.arrow} ${styles.next}`} type="button" aria-label="Next style" onClick={() => goTo(active + 1)}>›</button>
              </div>
              <div className={styles.dots} aria-label="Choose a hairstyle">
                {STYLES.map((style, index) => (
                  <button
                    key={style.name}
                    type="button"
                    className={`${styles.dot} ${index === active ? styles.dotActive : ''}`}
                    aria-label={`Show ${style.name}`}
                    aria-current={index === active ? 'true' : undefined}
                    onClick={() => goTo(index)}
                  />
                ))}
              </div>
              <p className={styles.swipeHint}>Swipe or tap to explore styles</p>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.shopSection}>
        <div className={styles.wrap}>
          <div className={styles.shopHeading}>
            <div>
              <p className={styles.sectionLabel}>FIND YOUR NEXT CHAIR</p>
              <h2>Featured barbershops</h2>
            </div>
            <Link to="/discover">Explore all shops <span aria-hidden="true">→</span></Link>
          </div>
          <form onSubmit={handleSearch} className={styles.searchForm}>
            <input
              className={styles.search}
              placeholder="Search barbershops near you..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search barbershops"
            />
            <button type="submit" className={styles.searchButton}>Search <span aria-hidden="true">→</span></button>
          </form>
          {loading && <div className={styles.shopList}><Skeleton height={110} /><Skeleton height={110} /><Skeleton height={110} /></div>}
          {error && <EmptyState skin="pixel" title="Couldn't load shops" body={error.message} />}
          {!loading && !error && filteredShops.length === 0 && (
            <EmptyState skin="pixel" title="No barbershops available yet." body="New approved shops will appear here as soon as they are live." />
          )}
          {!loading && !error && filteredShops.length > 0 && <div className={styles.shopList}>{filteredShops.slice(0, 3).map((shop) => <ShopCard shop={shop} key={shop.id} />)}</div>}
        </div>
      </section>
    </div>
  );
}
