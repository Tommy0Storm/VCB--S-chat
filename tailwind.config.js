/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // VCB Cleaner Theme colors per §5.1
      colors: {
        'vcb-black': '#000000',
        'vcb-dark-grey': '#1a1a1a',
        'vcb-mid-grey': '#666666',
        'vcb-light-grey': '#cccccc',
        'vcb-white': '#ffffff',
      },
      // VCB Cleaner Theme typography per §5.2
      fontFamily: {
        'quicksand': ['Quicksand', 'sans-serif'],
      },
      fontWeight: {
        'light': 300,   // Body text
        'medium': 500,  // Headings (all caps)
        'bold': 700,    // Main headings (all caps)
      },
    },
  },
  plugins: [],
}
