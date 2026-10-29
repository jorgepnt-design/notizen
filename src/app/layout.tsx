import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
import { TOUCH_ICON } from './touch-icon';

export const metadata: Metadata = {
  title: 'Notizen',
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

// Setzt das Farbschema vor dem ersten Zeichnen, damit der Dark Mode nicht aufblitzt.
const themeScript = `try{var t=localStorage.getItem('notizen.theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="apple-touch-icon" href={TOUCH_ICON} sizes="180x180" type="image/png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Notizen" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="icon" href="/icon-32.png" sizes="32x32" type="image/png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
