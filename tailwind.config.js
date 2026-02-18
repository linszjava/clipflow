/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // We can use default zinc/slate, but let's ensure we have a 'primary' if we want semantic naming
        primary: '#3b82f6', // blue-500
      }
    },
  },
  plugins: [],
}
