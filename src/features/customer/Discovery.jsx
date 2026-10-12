import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { API_BASE } from '../../api/httpClient';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublishedMapImages, fetchPublicShops } from '../../api/shopApi';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import styles from './Discovery.module.css';

const SHOP_COLORS = [
  ['#7c3aed', '#2563eb'],
  ['#4c1d95', '#1d4ed8'],
  ['#6d28d9', '#0ea5e9'],
  ['#312e81', '#7c3aed'],
  ['#5b21b6', '#2563eb'],
  ['#3730a3', '#8b5cf6'],
];

const MAP_POINTS = [
  { x: 23, y: 54 },
  { x: 70, y: 37 },
  { x: 51, y: 25 },
  { x: 35, y: 76 },
  { x: 82, y: 66 },
  { x: 59, y: 55 },
];

function parseClock(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'AM' && hour === 12) hour = 0;
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

function getShopOpenState(shop) {
  const openingTime = shop.openingTime || shop.operatingHours?.openingTime;
  const closingTime = shop.closingTime || shop.operatingHours?.closingTime;
  const hourParts = String(shop.hours || '').match(/\d{1,2}:\d{2}\s*(?:AM|PM)?/gi) || [];
  const open = parseClock(openingTime || hourParts[0]);
  const close = parseClock(closingTime || hourParts[1]);
  if (open === null || close === null) return null;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes >= open && currentMinutes < close;
}

function getWait(shop) {
  return Number.isFinite(shop.waitMin) ? shop.waitMin : null;
}

function DiscoverMapImage({ image, className, fallbackClassName, alt = '' }) {
  const [failed, setFailed] = useState(false);
  if (failed || !image.imageUrl) {
    return <span className={fallbackClassName} aria-label={`${image.title} image unavailable`}>{image.title.slice(0, 1).toUpperCase()}</span>;
  }
  const version = image.updatedAt || image.uploadedAt;
  const imageSource = `${API_BASE}${image.imageUrl}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
  return (
    <img
      className={className}
      src={imageSource}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function Discovery() {
  const { data: allShops, loading, error } = useAsync(fetchPublicShops);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [openNow, setOpenNow] = useState(false);
  const [waitFilter, setWaitFilter] = useState('any');
  const [ratingFilter, setRatingFilter] = useState('any');
  const [sortBy, setSortBy] = useState('name');
  const [visibleCount, setVisibleCount] = useState(6);
  const [view, setView] = useState('list');
  const [selectedShopId, setSelectedShopId] = useState(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [mapImages, setMapImages] = useState([]);
  const [mapImagesLoading, setMapImagesLoading] = useState(true);
  const [selectedMapImageId, setSelectedMapImageId] = useState(null);
  const [mapImagesError, setMapImagesError] = useState('');
  const mapRef = useRef(null);
  const dragRef = useRef(null);
  const mapImagesRequestRef = useRef(0);

  const refreshMapImages = useCallback(async () => {
    const requestId = ++mapImagesRequestRef.current;
    try {
      const images = await fetchPublishedMapImages();
      if (requestId === mapImagesRequestRef.current) {
        setMapImages(images || []);
        setMapImagesError('');
      }
    } catch (error) {
      if (requestId === mapImagesRequestRef.current) {
        setMapImagesError(error.message || 'Published map images could not be loaded.');
      }
    } finally {
      if (requestId === mapImagesRequestRef.current) setMapImagesLoading(false);
    }
  }, []);

  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') refreshMapImages();
    };
    const initialRefresh = window.setTimeout(refreshMapImages, 0);
    const interval = window.setInterval(refreshMapImages, 15000);
    window.addEventListener('focus', refreshMapImages);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      mapImagesRequestRef.current += 1;
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshMapImages);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [refreshMapImages]);

  const shops = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = (allShops || []).filter((shop) => {
      const searchable = `${shop.name} ${shop.address || ''}`.toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (openNow && getShopOpenState(shop) !== true) return false;
      if (ratingFilter !== 'any' && (!Number.isFinite(shop.rating) || shop.rating < Number(ratingFilter))) return false;

      const wait = getWait(shop);
      if (waitFilter === 'none' && wait !== 0) return false;
      if (waitFilter === '15' && (wait === null || wait > 15)) return false;
      if (waitFilter === '30' && (wait === null || wait > 30)) return false;
      return true;
    });

    if (sortBy === 'wait') {
      filtered.sort((a, b) => (getWait(a) ?? Number.MAX_SAFE_INTEGER) - (getWait(b) ?? Number.MAX_SAFE_INTEGER));
    } else if (sortBy === 'barbers') {
      filtered.sort((a, b) => (b.activeBarbers ?? 0) - (a.activeBarbers ?? 0));
    } else if (sortBy === 'rating') {
      filtered.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
    return filtered;
  }, [allShops, openNow, ratingFilter, search, sortBy, waitFilter]);

  const visibleShops = shops.slice(0, visibleCount);
  const selectedShop = shops.find((shop) => shop.id === selectedShopId) || shops[0];
  const selectedMapImage = mapImages.find((image) => image.id === selectedMapImageId);
  const shopImages = useMemo(() => {
    const byShop = new Map();
    mapImages.forEach((image) => {
      if (image.shopId && image.imageUrl && !byShop.has(image.shopId)) byShop.set(image.shopId, image);
    });
    return byShop;
  }, [mapImages]);

  function handleSearch(event) {
    event.preventDefault();
    const value = search.trim();
    setSearchParams(value ? { q: value } : {}, { replace: true });
  }

  function selectShop(shop) {
    setSelectedShopId(shop.id);
    setSelectedMapImageId(shopImages.get(shop.id)?.id || null);
  }

  function clampMapPan(pan, zoom) {
    const map = mapRef.current;
    if (!map) return pan;
    const maxX = map.clientWidth * Math.max(0.2, (zoom - 1) / 2);
    const maxY = map.clientHeight * Math.max(0.2, (zoom - 1) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, pan.x)),
      y: Math.max(-maxY, Math.min(maxY, pan.y)),
    };
  }

  function changeMapZoom(nextZoom) {
    const zoom = Math.max(1, Math.min(2.5, nextZoom));
    setMapZoom(zoom);
    setMapPan((pan) => clampMapPan(pan, zoom));
  }

  function handleMapPointerDown(event) {
    if (event.target.closest('button, a')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pan: mapPan,
    };
    setIsDraggingMap(true);
  }

  function handleMapPointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setMapPan(clampMapPan({
      x: drag.pan.x + event.clientX - drag.startX,
      y: drag.pan.y + event.clientY - drag.startY,
    }, mapZoom));
  }

  function stopMapDrag(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDraggingMap(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function selectMapImage(image) {
    setSelectedMapImageId(image.id);
  }

  function retryMapImages() {
    setMapImagesLoading(true);
    refreshMapImages();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.greeting}>YOUR NEXT CHAIR IS OUT THERE</div>
      <h1 className={styles.title}>Find your next fresh cut.</h1>

      <form className={styles.search} role="search" onSubmit={handleSearch}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m16 16 5 5" />
        </svg>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search shops or addresses..."
          aria-label="Search shops or addresses"
        />
        <button type="submit" className={styles.searchSubmit}>Search</button>
      </form>

      <div className={styles.locationRow}>
        <div className={styles.location}><span aria-hidden="true">⌖</span><b>Barbershops near you</b></div>
        <div className={styles.resultCount}><b>{shops.length}</b> {shops.length === 1 ? 'shop' : 'shops'} found</div>
      </div>
      {mapImagesLoading && <p className={styles.shopPhotosStatus} role="status">Loading shop photos...</p>}
      {mapImagesError && (
        <p className={styles.shopPhotosStatus} role="status">
          Shop photos couldn’t be loaded. <button type="button" onClick={retryMapImages}>Try again</button>
        </p>
      )}

      <div className={styles.controls}>
        <div className={styles.chips}>
          <button
            className={`${styles.chip} ${openNow ? styles.chipActive : ''}`}
            type="button"
            aria-pressed={openNow}
            onClick={() => setOpenNow((value) => !value)}
          >
            <span className={styles.statusDot} /> Open Now
          </button>
          <button className={`${styles.chip} ${styles.unavailableChip}`} type="button" disabled title="Shop coordinates are not provided yet">
            Distance: Any
          </button>
          <label className={styles.selectChip}>
            <span className={styles.srOnly}>Filter by wait</span>
            <select value={waitFilter} onChange={(event) => setWaitFilter(event.target.value)}>
              <option value="any">Wait: Any</option>
              <option value="none">No wait</option>
              <option value="15">Under 15 min</option>
              <option value="30">Under 30 min</option>
            </select>
          </label>
          <label className={styles.selectChip}>
            <span className={styles.srOnly}>Filter by rating</span>
            <select aria-label="Filter by rating" value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)}>
              <option value="any">Rating: Any</option>
              <option value="3">3+ stars</option>
              <option value="4">4+ stars</option>
              <option value="4.5">4.5+ stars</option>
            </select>
          </label>
        </div>
        <label className={styles.sortWrap}>
          Sort by
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="name">Shop name</option>
            <option value="wait">Shortest wait</option>
            <option value="barbers">Most active barbers</option>
            <option value="rating">Highest rated</option>
          </select>
        </label>
      </div>

      <div className={styles.viewToggle} role="group" aria-label="Shop view">
        <button className={view === 'list' ? styles.viewActive : ''} type="button" onClick={() => setView('list')}>List</button>
        <button className={view === 'map' ? styles.viewActive : ''} type="button" onClick={() => setView('map')}>Map</button>
      </div>

      <div className={styles.layout}>
        <section className={`${styles.gridWrap} ${view === 'map' ? styles.hiddenMobile : ''}`} aria-label="Barbershop results">
          {loading && <div className={styles.grid}>{[0, 1, 2, 3, 4, 5].map((item) => <Skeleton height={250} key={item} />)}</div>}
          {error && <EmptyState skin="pixel" title="Couldn't load shops" body={error.message} />}
          {!loading && !error && shops.length === 0 && (
            <EmptyState skin="pixel" title="No shops found" body="Try a different search or filter." />
          )}
          {!loading && !error && shops.length > 0 && (
            <>
              <div className={styles.grid}>
                {visibleShops.map((shop, index) => {
                  const openState = getShopOpenState(shop);
                  const wait = getWait(shop);
                  const [colorOne, colorTwo] = SHOP_COLORS[index % SHOP_COLORS.length];
                  const shopImage = shopImages.get(shop.id);
                  return (
                    <Link
                      className={`${styles.card} ${selectedShop?.id === shop.id ? styles.cardSelected : ''}`}
                      id={`shop-${shop.id}`}
                      key={shop.id}
                      to={`/shops/${shop.id}`}
                      onMouseEnter={() => selectShop(shop)}
                    >
                      <div className={styles.thumb} style={{ '--shop-color-one': colorOne, '--shop-color-two': colorTwo }}>
                        {shopImage
                          ? <DiscoverMapImage key={`${shopImage.id}:${shopImage.imageUrl}:${shopImage.updatedAt}`} image={shopImage} className={styles.shopThumbImage} fallbackClassName={styles.shopThumbFallback} alt={`${shop.name}: ${shopImage.title}`} />
                          : <svg viewBox="0 0 240 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                            <circle cx="190" cy="20" r="70" fill="white" fillOpacity=".1" />
                            <path d="M0 112 Q90 72 240 113 L240 130 L0 130Z" fill="white" fillOpacity=".08" />
                          </svg>}
                        <span className={`${styles.openBadge} ${openState === true ? styles.isOpen : ''}`}>
                          {openState === null ? 'Hours unavailable' : openState ? 'Open now' : 'Closed'}
                        </span>
                      </div>
                      <div className={styles.cardBody}>
                        <div className={styles.cardTop}>
                          <span className={styles.shopName}>{shop.name}</span>
                          <span className={styles.cardIndex}>0{index + 1}</span>
                        </div>
                        <p className={styles.meta}>{shop.address || 'Address unavailable'}</p>
                        <p className={styles.shopRating}>
                          <span aria-hidden="true">★</span> {shop.rating == null ? 'No ratings yet' : `${Number(shop.rating).toFixed(1)} (${shop.ratingCount})`}
                        </p>
                        <p className={`${styles.wait} ${wait === 0 ? styles.waitNone : ''}`}>
                          {wait === null ? 'Wait estimate unavailable' : wait === 0 ? 'No wait' : `${wait} min wait`}
                        </p>
                        <div className={styles.cardFooter}>
                          <span>{Number.isFinite(shop.activeBarbers) ? `${shop.activeBarbers} active ${shop.activeBarbers === 1 ? 'barber' : 'barbers'}` : 'See shop details'}</span>
                          <span className={styles.viewShop}>View shop <span aria-hidden="true">↗</span></span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {visibleCount < shops.length && (
                <div className={styles.loadMoreWrap}>
                  <button className={styles.loadMore} type="button" onClick={() => setVisibleCount((count) => count + 6)}>
                    Load more shops
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <aside
          ref={mapRef}
          className={`${styles.mapPanel} ${isDraggingMap ? styles.mapDragging : ''} ${view === 'list' ? styles.hiddenMobile : ''}`}
          aria-label="Interactive shop map"
          onPointerDown={handleMapPointerDown}
          onPointerMove={handleMapPointerMove}
          onPointerUp={stopMapDrag}
          onPointerCancel={stopMapDrag}
          onWheel={(event) => {
            event.preventDefault();
            changeMapZoom(mapZoom + (event.deltaY < 0 ? 0.15 : -0.15));
          }}
        >
          <div
            className={styles.mapScene}
            style={{ transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})` }}
          >
            <svg className={styles.mapArt} viewBox="0 0 400 460" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <rect width="400" height="460" fill="#12101f" />
              <g stroke="rgba(255,255,255,.09)" strokeWidth="7">
                <path d="M-30 88 430 55" /><path d="M-10 190 410 220" /><path d="M-20 325 430 295" />
                <path d="M78-20 58 490" /><path d="M225-10 260 480" /><path d="M345-10 370 490" />
              </g>
              <g stroke="rgba(139,92,246,.2)" strokeWidth="2">
                <path d="M0 136 400 113" /><path d="M0 267 400 290" /><path d="M145 0 132 460" />
              </g>
              <path d="M0 402 Q150 350 400 420 L400 460 L0 460Z" fill="#0d2a33" opacity=".55" />
            </svg>
            {shops.slice(0, MAP_POINTS.length).map((shop, index) => {
              const point = MAP_POINTS[index];
              return (
                <button
                  key={shop.id}
                  className={`${styles.mapPin} ${selectedShop?.id === shop.id ? styles.mapPinSelected : ''}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  type="button"
                  aria-label={`Select ${shop.name}`}
                  aria-pressed={selectedShop?.id === shop.id}
                  onClick={() => selectShop(shop)}
                >
                  <span>{index + 1}</span>
                </button>
              );
            })}
            {mapImages.map((image, index) => {
              const point = MAP_POINTS[(index + shops.length) % MAP_POINTS.length];
              return (
                <button
                  key={image.id}
                  className={`${styles.mapImagePin} ${selectedMapImageId === image.id ? styles.mapImagePinSelected : ''}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  type="button"
                  aria-label={`View shop photo: ${image.title}`}
                  aria-pressed={selectedMapImageId === image.id}
                  onClick={() => {
                    selectMapImage(image);
                    if (image.shopId) setSelectedShopId(image.shopId);
                  }}
                >
                  <DiscoverMapImage
                    key={`${image.id}:${image.imageUrl}:${image.updatedAt}`}
                    image={image}
                    className={styles.mapImagePinPhoto}
                    fallbackClassName={styles.mapImagePinFallback}
                  />
                </button>
              );
            })}
          </div>
          <div className={styles.mapLabel}><span className={styles.mapPulse} /> SCHEMATIC MAP - DRAG / SCROLL TO NAVIGATE</div>
          {mapImagesError && <div className={styles.mapNotice} role="status">{mapImagesError}</div>}
          <div className={styles.mapControls} role="group" aria-label="Map zoom controls">
            <button type="button" aria-label="Zoom in" onClick={() => changeMapZoom(mapZoom + 0.25)}>+</button>
            <button type="button" aria-label="Zoom out" onClick={() => changeMapZoom(mapZoom - 0.25)}>-</button>
            <button type="button" aria-label="Reset map view" onClick={() => { setMapZoom(1); setMapPan({ x: 0, y: 0 }); }}>R</button>
          </div>
          <div className={styles.mapCaption}>
            {selectedMapImage ? (
              <>
                <span className={styles.mapCaptionLabel}>SHOP PHOTO</span>
                <DiscoverMapImage
                  key={`${selectedMapImage.id}:${selectedMapImage.imageUrl}:${selectedMapImage.updatedAt}`}
                  image={selectedMapImage}
                  className={styles.mapCaptionImage}
                  fallbackClassName={styles.mapCaptionImageFallback}
                  alt={selectedMapImage.title}
                />
                <strong>{selectedMapImage.title}</strong>
              </>
            ) : (
              <>
                <span className={styles.mapCaptionLabel}>SELECTED SHOP</span>
                <strong>{selectedShop?.name || 'Browse available shops'}</strong>
                <span>{selectedShop?.address || 'Select a pin to preview a shop'}</span>
                {selectedShop && <Link to={`/shops/${selectedShop.id}`}>View shop</Link>}
              </>
            )}
          </div>
        </aside>
      </div>

    </div>
  );
}
