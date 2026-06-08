import { useEffect, useRef, useState } from 'react';

export function useTurnstileToken(siteKey?: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      return;
    }
    const scriptId = 'cf-turnstile-script';
    const render = () => {
      if (!window.turnstile || !containerRef.current) {
        setError(true);
        return;
      }
      window.turnstile.render(containerRef.current, {
        callback: setToken,
        'error-callback': () => setError(true),
        sitekey: siteKey
      });
    };
    if (window.turnstile) {
      render();
      return;
    }
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.defer = true;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      document.head.appendChild(script);
    }
    script.addEventListener('load', render, { once: true });
    script.addEventListener('error', () => setError(true), { once: true });
  }, [siteKey]);

  return { containerRef, error, token };
}
