// Shared behavior for project pages. Load after site.js.

// <video data-hover-play> stays paused until hovered or keyboard focused. On
// touch, tapping plays and pauses it (site.js handles clicks). Either way, it
// stops once it scrolls off screen. Pages that add videos later (like the
// password-protected ones) call window.addHoverPlay(root).
(() => {
    const ICON = '<svg class="state-icon" viewBox="0 0 24 24" aria-hidden="true">'
        + '<path class="pause-shape" d="M7 4h4v16H7zM13 4h4v16h-4z"/>'
        + '<path class="play-shape" d="M7 4l13 8-13 8z"/></svg>';

    const offScreen = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) entry.target.pause();
        });
    });

    window.addHoverPlay = (root = document) => {
        root.querySelectorAll('video[data-hover-play]:not([tabindex])').forEach((video) => {
            const clip = document.createElement('div');
            clip.className = 'clip';
            video.replaceWith(clip);
            clip.append(video);
            clip.insertAdjacentHTML('beforeend', ICON);
            video.tabIndex = 0;

            const play = () => video.play().catch(() => {});
            video.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') play(); });
            video.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') video.pause(); });
            video.addEventListener('focus', () => { if (video.matches(':focus-visible')) play(); });
            video.addEventListener('blur', () => video.pause());
            video.addEventListener('play', () => clip.classList.add('playing'));
            video.addEventListener('pause', () => clip.classList.remove('playing'));
            offScreen.observe(video);
        });
    };

    window.addHoverPlay();
})();
