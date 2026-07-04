/** @type {import('tailwindcss').Config} */
const CAT_COLORS = ['coral', 'teal', 'purple', 'pink', 'amber', 'green', 'red', 'blue', 'gray'];

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  // The calendar chips build class names dynamically (e.g. `border-cat-${color}`)
  // based on the category assigned to each transaction, so the JIT scanner can't
  // see them. Safelist every combo we use for chips + backgrounds + text.
  //
  // `/15` variants power the dark-mode chip fill: instead of the pale light-mode
  // *-bg color (which reads as a solid white block on dark bg), we use the base
  // hue at 15% opacity for an atmospheric tint.
  safelist: [
    ...CAT_COLORS.flatMap((c) => [
      `border-cat-${c}`,
      `bg-cat-${c}`,
      `bg-cat-${c}/15`,
      `bg-cat-${c}-bg`,
      `text-cat-${c}`,
      `text-cat-${c}-fg`,
    ]),
  ],
  theme: {
    extend: {
      colors: {
        // Amber = primary brand accent (échoes "apricot").
        brand: {
          50:  '#FEF7E5',
          100: '#FAEEDA',
          200: '#FAC775',
          300: '#EF9F27',
          400: '#D18720',
          500: '#BA7517',
          600: '#854F0B',
          700: '#633806',
          800: '#412402',
        },
        // Category palette used throughout budget/calendar UIs.
        cat: {
          coral: '#F0997B', 'coral-bg': '#FAECE7', 'coral-fg': '#712B13',
          teal:  '#5DCAA5', 'teal-bg':  '#E1F5EE', 'teal-fg':  '#085041',
          purple:'#7F77DD', 'purple-bg':'#EEEDFE', 'purple-fg':'#3C3489',
          pink:  '#D4537E', 'pink-bg':  '#FBEAF0', 'pink-fg':  '#72243E',
          amber: '#EF9F27', 'amber-bg': '#FAEEDA', 'amber-fg': '#633806',
          green: '#97C459', 'green-bg': '#EAF3DE', 'green-fg': '#27500A',
          red:   '#E24B4A', 'red-bg':   '#FCEBEB', 'red-fg':   '#791F1F',
          blue:  '#378ADD', 'blue-bg':  '#E6F1FB', 'blue-fg':  '#0C447C',
          gray:  '#888780', 'gray-bg':  '#F1EFE8', 'gray-fg':  '#444441',
        },
      },
    },
  },
  plugins: [],
};
