import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone"
  }),
  // Disable Astro's built-in CSRF check (Railway proxy changes Origin headers)
  security: {
    checkOrigin: false
  },
  vite: {
    plugins: [tailwindcss()]
  },
  server: {
    host: true,
    port: parseInt(process.env.PORT || '4321')
  }
});
