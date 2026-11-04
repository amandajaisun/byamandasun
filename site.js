// Shared behavior for every page.

// Number keys jump between pages (1 = home, 2 = canvas, ...)
document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const item = document.querySelector(`.nav-item[data-key="${e.key}"]`);
    if (item && !item.hasAttribute('aria-current')) window.location.href = item.href;
});

// Looping videos get a pause/play button (WCAG 2.2.2), and don't autoplay
// when the system asks for reduced motion. Pages that add videos later
// (like the password-protected ones) call window.addPauseButtons(root).
// <video data-no-pause-button> skips the visible button; clicking the
// video still pauses it.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

window.addPauseButtons = (root = document) => {
    root.querySelectorAll('video[loop]:not([data-pausable])').forEach(video => {
        video.dataset.pausable = '';
        if (reduceMotion) {
            video.autoplay = false;
            video.removeAttribute('autoplay');
            video.pause();
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'motion-toggle video-toggle';
        const sync = () => {
            button.textContent = video.paused ? 'play' : 'pause';
            button.setAttribute('aria-label', (video.paused ? 'play' : 'pause') + ' video');
        };
        button.addEventListener('click', () => {
            video.paused ? video.play().catch(() => {}) : video.pause();
        });
        video.addEventListener('click', () => button.click());
        video.addEventListener('play', sync);
        video.addEventListener('pause', sync);
        sync();
        if (video.hasAttribute('data-no-pause-button')) return;

        // Sit after the video's frame if it has one (e.g. a phone bezel)
        const frame = video.closest('[data-video-frame]') || video;
        frame.insertAdjacentElement('afterend', button);
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.addPauseButtons());
} else {
    window.addPauseButtons();
}

// Anticipate hover intention: start loading a page while the pointer rests on
// its link, so it's ready by the time the click lands.
(() => {
    const isInternal = a => a.origin === location.origin && a.pathname !== location.pathname
        && !a.hasAttribute('download') && a.target !== '_blank';

    // Chromium: let the browser prerender on hover (~200ms) and on pointer down
    if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
        const rules = document.createElement('script');
        rules.type = 'speculationrules';
        rules.textContent = JSON.stringify({
            prerender: [{
                where: { and: [
                    { href_matches: '/*' },
                    { not: { selector_matches: '[target=_blank], [download]' } },
                ] },
                eagerness: 'moderate',
            }],
        });
        document.head.appendChild(rules);
        return;
    }

    // Other browsers: prefetch after a short hover, or right away on touch/focus
    const HOVER_DELAY = 65;
    const done = new Set();
    let timer;

    const prefetch = (a) => {
        if (done.has(a.href) || !isInternal(a)) return;
        done.add(a.href);
        const link = document.createElement('link');
        if (link.relList.supports && link.relList.supports('prefetch')) {
            link.rel = 'prefetch';
            link.href = a.href;
            document.head.appendChild(link);
        } else {
            fetch(a.href, { credentials: 'same-origin', priority: 'low' }).catch(() => {});
        }
    };

    document.addEventListener('pointerover', (e) => {
        const a = e.target.closest('a[href]');
        if (!a || e.pointerType === 'touch') return;
        clearTimeout(timer);
        timer = setTimeout(() => prefetch(a), HOVER_DELAY);
    });
    document.addEventListener('pointerout', (e) => {
        if (e.target.closest('a[href]')) clearTimeout(timer);
    });
    document.addEventListener('touchstart', (e) => {
        const a = e.target.closest('a[href]');
        if (a) prefetch(a);
    }, { passive: true });
    document.addEventListener('focusin', (e) => {
        const a = e.target.closest('a[href]');
        if (a) prefetch(a);
    });
})();
