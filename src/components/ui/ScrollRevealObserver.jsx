import { useEffect } from 'react';

// A single observer handles marked elements across routes, including content
// mounted later by async requests. Each target is unobserved after first view.
export default function ScrollRevealObserver() {
  useEffect(() => {
    if (!('IntersectionObserver' in window)
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const root = document.documentElement;
    let initialObservationComplete = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.dataset.scrollRevealed = 'true';
        observer.unobserve(entry.target);
      }
      if (!initialObservationComplete) {
        initialObservationComplete = true;
        root.classList.add('scroll-reveal-ready');
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });

    const observe = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches('[data-scroll-reveal]') && node.dataset.scrollRevealed !== 'true') observer.observe(node);
      node.querySelectorAll('[data-scroll-reveal]').forEach((element) => {
        if (element.dataset.scrollRevealed !== 'true') observer.observe(element);
      });
    };

    document.querySelectorAll('[data-scroll-reveal]').forEach((element) => observer.observe(element));
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(observe));
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
      root.classList.remove('scroll-reveal-ready');
    };
  }, []);

  return null;
}
