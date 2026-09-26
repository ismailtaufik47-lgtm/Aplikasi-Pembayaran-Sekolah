const v = (nama) => `rgb(var(--${nama}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      // Warna yang berubah di mode gelap diambil dari variabel CSS
      // (lihat :root dan .dark di src/index.css). Format "r g b" supaya
      // tetap bisa dipakai dengan transparansi, mis. bg-brand-soft/50.
      colors: {
        canvas: v('canvas'),
        kartu: v('kartu'),
        isi: v('isi'),
        ink: v('ink'),
        muted: v('muted'),
        line: v('line'),
        brand: { DEFAULT: '#3B6EF6', soft: v('brand-soft'), deep: '#2A55CC' },
        ok: { DEFAULT: '#22C55E', soft: v('ok-soft'), deep: v('ok-deep') },
        warn: { DEFAULT: '#F5A524', soft: v('warn-soft'), deep: v('warn-deep') },
        danger: { DEFAULT: '#EF4444', soft: v('danger-soft') },
        grape: { DEFAULT: '#8B5CF6', soft: v('grape-soft') },
        rose: { DEFAULT: '#EC4899', soft: v('rose-soft') },
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