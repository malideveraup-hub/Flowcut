import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './RoleGuide.module.css';

export default function RoleGuide({ guide }) {
  const [activeStep, setActiveStep] = useState(guide.steps[0]?.id);

  useEffect(() => {
    const sections = guide.steps.map(({ id }) => document.getElementById(`role-guide-${id}`)).filter(Boolean);
    if (!sections.length || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveStep(visible.target.id.replace('role-guide-', ''));
    }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, 0.2, 0.5, 0.8] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [guide]);

  function goToStep(id) {
    setActiveStep(id);
    document.getElementById(`role-guide-${id}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  return (
    <>
      <section className={styles.overview} aria-label={`${guide.label} guide overview`}>
        <div className={styles.overviewHead}>
          <div><p className={styles.eyebrow}>{guide.eyebrow}</p><h2>{guide.label}: the practical tour.</h2></div>
          <span className={styles.readingTime}>{guide.readingTime}</span>
        </div>
        <div className={styles.overviewGrid}>
          {guide.overview.map(([number, title, copy], index) => (
            <button type="button" key={number} onClick={() => goToStep(guide.steps[index]?.id || guide.steps[guide.steps.length - 1].id)}>
              <span>{number}</span><strong>{title}</strong><small>{copy}</small>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.layout}>
        <nav className={styles.toc} aria-label={`${guide.label} guide sections`}>
          <span className={styles.tocLabel}>IN THIS GUIDE</span>
          {guide.steps.map((step, index) => (
            <button type="button" key={step.id} className={activeStep === step.id ? styles.active : ''} aria-current={activeStep === step.id ? 'step' : undefined} onClick={() => goToStep(step.id)}>
              <span>{String(index + 1).padStart(2, '0')}</span>{step.title}
            </button>
          ))}
        </nav>

        <div className={styles.steps}>
          {guide.steps.map((step, index) => (
            <section className={styles.step} id={`role-guide-${step.id}`} key={step.id} aria-labelledby={`role-guide-title-${step.id}`}>
              <div className={styles.copy}>
                <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
                <p className={styles.eyebrow}>{step.category}</p>
                <h2 id={`role-guide-title-${step.id}`}>{step.title}</h2>
                <p className={styles.description}>{step.copy}</p>
                <ol className={styles.instructions}>
                  {step.points.map((point) => (
                    <li key={point.text}>
                      <span aria-hidden="true">✓</span>
                      <span>{point.text}{point.to && <> <Link to={point.to}>{point.link}</Link></>}</span>
                    </li>
                  ))}
                </ol>
                <aside className={styles.tip}><strong>Important</strong><p>{step.tip}</p></aside>
              </div>
              <div className={styles.destination}>
                <div className={styles.destinationHead}><span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" /><small>FLOWCUT · {guide.label.toUpperCase()} WORKSPACE</small></div>
                <div className={styles.destinationBody}>
                  <p className={styles.destinationLabel}>CONTINUE IN THE APP</p>
                  <h3>{step.category.toLowerCase().replaceAll(/\b\w/g, (letter) => letter.toUpperCase())}</h3>
                  <p>Open the real {guide.label} workspace to view current account data and available actions.</p>
                  <div className={styles.links}>
                    {step.links.map((link, linkIndex) => (
                      <Link className={linkIndex === 0 ? styles.primaryLink : styles.secondaryLink} to={link.to} key={link.to}>{link.label}<span aria-hidden="true">→</span></Link>
                    ))}
                  </div>
                </div>
                <p className={styles.caption}>This guide links to the live role-protected FlowCut page; it does not perform shop or queue actions.</p>
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
