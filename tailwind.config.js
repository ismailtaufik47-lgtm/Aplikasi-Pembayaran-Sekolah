/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: '#F5F6FA',
        ink: '#151A26',
        muted: '#8A93A6',
        line: '#EEF0F5',
        brand: { DEFAULT: '#3B6EF6', soft: '#EAF0FE', deep: '#2A55CC' },
        ok: { DEFAULT: '#22C55E', soft: '#E8F8EE', deep: '#177C40' },
        warn: { DEFAULT: '#F5A524', soft: '#FEF4E4', deep: '#8A5A08' },
        danger: { DEFAULT: '#EF4444', soft: '#FDECEC' },
        grape: { DEFAULT: '#8B5CF6', soft: '#F1ECFE' },
        rose: { DEFAULT: '#EC4899', soft: '#FDECF4' },
      },
      borderRadius: { card: '20px', pill: '999px' },
      boxShadow: {
        soft: '0 2px 12px rgba(21,26,38,.05)',
        brand: '0 8px 18px rgba(59,110,246,.3)',
        hero: '0 12px 26px rgba(59,110,246,.3)',
        phone: '0 24px 60px rgba(21,26,38,.18)',
      },
      keyframes: {
        fade: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        up: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        pop: { from: { transform: 'scale(.4)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
      },
      animation: {
        fade: 'fade .22s ease',
        up: 'up .26s cubic-bezier(.2,.9,.3,1)',
        pop: 'pop .34s cubic-bezier(.2,1.5,.4,1)',
      },
    },
  },
  plugins: [],
}