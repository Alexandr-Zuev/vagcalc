import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages отдаёт проект по адресу https://<user>.github.io/<repo>/,
  // поэтому абсолютные пути вида /assets/... не сработают — нужен путь
  // относительно документа. Так же собранная папка переносится на любой
  // хостинг и в любую поддиректорию без правки конфига.
  base: './',
  plugins: [react()],
});