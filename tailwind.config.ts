import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#000000',
          card: '#0A0A0A',
          sidebar: '#0A0A0A',
        },
        border: {
          default: '#1F1F1F',
          divider: '#262626',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#A3A3A3',
        },
        accent: {
          DEFAULT: '#10B981',
          hover: '#059669',
          soft: '#34D399',
        },
        error: '#EF4444',
        warning: '#F59E0B',
      },
      borderRadius: {
        btn: '8px',
        card: '12px',
        modal: '16px',
        badge: '6px',
      },
    },
  },
  plugins: [],
}

export default config
