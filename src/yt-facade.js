// Click-to-load YouTube facade for the press kit: the page carries only a
// self-hosted poster; the player iframe is created on the first click, so no
// request leaves this site before the visitor asks for it.
for (const figure of document.querySelectorAll('figure.yt[data-yt]')) {
  const button = figure.querySelector('button');
  if (!button) continue;
  button.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(figure.dataset.yt)}?autoplay=1&rel=0`;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.title = figure.dataset.title || 'Video';
    iframe.width = 720;
    iframe.height = 1280;
    button.replaceWith(iframe);
    iframe.focus();
  }, { once: true });
}

// Je suis le spectre d'une rose que tu portais hier au bal.
