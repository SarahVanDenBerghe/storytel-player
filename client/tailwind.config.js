/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      // Short, quiet motion (Apple-like). Individual `translate`/`scale` properties
      // compose with Tailwind's transform classes instead of replacing them.
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'page-in': { from: { opacity: '0', translate: '0 6px' }, to: { opacity: '1', translate: '0 0' } },
        'pop-in': { from: { opacity: '0', scale: '0.96' }, to: { opacity: '1', scale: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'page-in': 'page-in 180ms cubic-bezier(0.2, 0, 0, 1)',
        'pop-in': 'pop-in 150ms cubic-bezier(0.2, 0, 0, 1)',
      },
      colors: {
        primary: {
          50: '#f0f9ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        }
      }
    },
  },
  plugins: [],
}