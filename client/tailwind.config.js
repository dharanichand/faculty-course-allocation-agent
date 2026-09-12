/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950:'#f8fafc', 900:'#eef4fc', 800:'#e2e8f0', 700:'#cbd5e1', 600:'#94a3b8' },
        brand: { 50:'#eff6ff', 500:'#2563eb', 600:'#1d4ed8' },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 8px 28px -8px rgba(37,99,235,.45)',
        'glow-cyan': '0 8px 28px -8px rgba(56,189,248,.4)',
      },
    },
  },
  plugins: [],
};
