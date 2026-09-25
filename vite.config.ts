import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.VITE_FLUTTERWAVE_PUBLIC_KEY': JSON.stringify(env.VITE_FLUTTERWAVE_PUBLIC_KEY || process.env.VITE_FLUTTERWAVE_PUBLIC_KEY || ""),
        'import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY': JSON.stringify(env.VITE_FLUTTERWAVE_PUBLIC_KEY || process.env.VITE_FLUTTERWAVE_PUBLIC_KEY || "")
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('pdf-lib')) return 'pdf-lib';
                if (id.includes('mammoth')) return 'mammoth';
                if (id.includes('recharts')) return 'recharts';
                if (id.includes('@supabase')) return 'supabase';
                if (id.includes('lucide-react')) return 'lucide';
                if (id.includes('react/') || id.includes('react-dom/') || id.includes('scheduler')) return 'vendor-react';
              }
            }
          }
        }
      }
    };
});
