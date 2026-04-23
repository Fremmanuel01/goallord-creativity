(function() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var revealEls = document.querySelectorAll(
        '.gl-reason-item, .gl-stat, .wg-plan, .accordion-faq_item, .gl-founder-wrap, .gl-hero-social-proof'
    );
    if (!revealEls.length) return;
    var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                var el = entry.target;
                var delay = el.dataset.revealDelay || 0;
                setTimeout(function() {
                    el.classList.add('gl-revealed');
                }, delay);
                obs.unobserve(el);
            }
        });
    }, { threshold: 0.12 });
    revealEls.forEach(function(el, i) {
        el.dataset.revealDelay = (i % 4) * 80;
        obs.observe(el);
    });
})();
