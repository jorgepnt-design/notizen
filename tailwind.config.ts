import type { Config } from 'tailwindcss';

// Farben kommen aus CSS-Variablen (globals.css), damit Hell/Dunkel an einer Stelle gepflegt wird.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        canvas: v('canvas'),
        surface: v('surface'),
        sunken: v('sunken'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        accent: v('accent'),
        'accent-strong': v('accent-strong'),
        'accent-soft': v('accent-soft'),
        'on-accent': v('on-accent'),
        danger: v('danger'),
        'danger-soft': v('danger-soft'),
        star: v('star'),
      },
    },
  },
  plugins: [],
} satisfies Config;
