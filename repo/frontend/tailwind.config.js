/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,svelte}'],
  theme: {
    extend: {
      colors: {
        slate900: '#0f172a',
      },
    },
  },
  plugins: [],
};
