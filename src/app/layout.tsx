import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
import { TOUCH_ICON } from './touch-icon';

export const metadata: Metadata = {
  title: 'Notizen by Jorge',
  description: 'Notizen schreiben, ordnen und wiederfinden – gespeichert lokal in deinem Browser.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8f6' },
    { media: '(prefers-color-scheme: dark)', color: '#121614' },
  ],
};

// Notbremse: Startet die App nicht (Skriptfehler, sehr alter Browser), nach 15 s statt
// „Wird geladen“ eine Erklärung samt Fehlermeldung zeigen.
const startupGuard = `window.__nzErrors=[];addEventListener('error',function(e){__nzErrors.push(e.message||String(e))});addEventListener('unhandledrejection',function(e){__nzErrors.push(String(e.reason&&e.reason.message||e.reason))});setTimeout(function(){var el=document.querySelector('[data-loading]');if(!el)return;el.innerHTML='<div style="max-width:28rem;padding:1.5rem;text-align:center;line-height:1.5"><p style="font-weight:600;font-size:1rem;margin-bottom:.5rem">Die App startet nicht</p><p>Bitte alle anderen Fenster dieser App schließen und die Seite neu laden. Hilft das nicht, Safari bzw. iOS aktualisieren.</p>'+(__nzErrors.length?'<p style="margin-top:.75rem;font-size:.75rem;opacity:.7">Fehler: '+__nzErrors.slice(0,3).join(' | ').replace(/</g,'&lt;')+'</p>':'')+'<button onclick="location.reload()" style="margin-top:1rem;padding:.5rem 1rem;border-radius:.5rem;background:#0f7a4a;color:#fff">Neu laden</button></div>'},15000)`;

// Setzt das Farbschema vor dem ersten Zeichnen, damit der Dark Mode nicht aufblitzt.
const themeScript = `try{var t=localStorage.getItem('notizen.theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: startupGuard }} />
        <link rel="apple-touch-icon" href={TOUCH_ICON} sizes="180x180" type="image/png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Notizen by Jorge" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="icon" href="/icon-32.png" sizes="32x32" type="image/png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
