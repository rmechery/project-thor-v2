import type { Config } from "tailwindcss";
import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
interface ThemeConfig {
  extend: {
    colors: {
      background: string;
      foreground: string;
    };
  };
  typography: (theme: (path: string) => string) => {
    DEFAULT: {
      css: {
        color: string;
        h1: { color: string };
        h2: { color: string };
        h3: { color: string };
        h4: { color: string };
        h5: { color: string };
        h6: { color: string };
        strong: { color: string };
        a: { color: string };
      };
    };
  };
}

interface TailwindConfig extends Config {
  content: string[];
  theme: ThemeConfig;
}

const config: TailwindConfig = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
    typography: (theme) => ({
      DEFAULT: {
        css: {
          color: theme('colors.white'),
          h1: { color: theme('colors.gray.100') }, // Bright white
          h2: { color: theme('colors.gray.200') },
          h3: { color: theme('colors.gray.300') },
          h4: { color: theme('colors.gray.400') },
          h5: { color: theme('colors.gray.500') },
          h6: { color: theme('colors.gray.600') }, // Subtle white
          strong: { color: theme('colors.white') },
          a: {
            color: theme('colors.blue.400'), // Bright and visible link color
            textDecoration: 'underline', // Underline links
            fontWeight: 'bold', // Make links bold
            '&:hover': {
              color: theme('colors.blue.300'), // Lighter blue on hover
            },
            '&:focus': {
              outline: `2px solid ${theme('colors.blue.200')}`, // Focus ring for accessibility
            },
          },
        },
      },
    }),
  },
  plugins: [
    typography,
  ],
};

export default config satisfies Config;
