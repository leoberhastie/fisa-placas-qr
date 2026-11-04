/** @type {import('tailwindcss').Config} */
const hsl = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: hsl('background'),
        foreground: hsl('foreground'),
        card: {
          DEFAULT: hsl('card'),
          foreground: hsl('card-foreground'),
        },
        popover: {
          DEFAULT: hsl('popover'),
          foreground: hsl('popover-foreground'),
        },
        primary: {
          DEFAULT: hsl('primary'),
          foreground: hsl('primary-foreground'),
        },
        secondary: {
          DEFAULT: hsl('secondary'),
          foreground: hsl('secondary-foreground'),
        },
        muted: {
          DEFAULT: hsl('muted'),
          foreground: hsl('muted-foreground'),
        },
        accent: {
          DEFAULT: hsl('accent'),
          foreground: hsl('accent-foreground'),
        },
        destructive: {
          DEFAULT: hsl('destructive'),
          foreground: hsl('destructive-foreground'),
        },
        success: {
          DEFAULT: hsl('success'),
          foreground: hsl('success-foreground'),
        },
        warning: {
          DEFAULT: hsl('warning'),
          foreground: hsl('warning-foreground'),
        },
        border: hsl('border'),
        input: hsl('input'),
        ring: hsl('ring'),
        chart: {
          1: hsl('chart-1'),
          2: hsl('chart-2'),
          3: hsl('chart-3'),
          4: hsl('chart-4'),
          5: hsl('chart-5'),
        },
        sidebar: {
          DEFAULT: hsl('sidebar-background'),
          foreground: hsl('sidebar-foreground'),
          primary: hsl('sidebar-primary'),
          accent: hsl('sidebar-accent'),
          border: hsl('sidebar-border'),
        },
        navy: {
          50: '#eef3f9',
          100: '#d5e1ef',
          600: '#2a4f7f',
          700: '#1d3b63',
          800: '#132b4d',
          900: '#0b1f3a',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        heading: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
