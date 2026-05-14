import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-page app — uma entry por HTML.
const root = process.cwd();
const htmlPages = [
  'index',
  'dashboard',
  'pagamentos',
  'transacoes',
  'contas',
  'compromissos',
  'orcamento',
  'dividas',
  'investimentos',
  'relatorios',
  'contatos',
  'importar',
  'academia',
  'novidades',
  'feedback',
  'feedback-publico',
  'perfil',
  'configuracoes',
  'admin',
  'admin-feedback',
  'admin-i18n',
  'admin-usuarios',
  'desenvolvimento',
];

export default defineConfig({
  server: {
    port: 8000,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        htmlPages.map((name) => [name, resolve(root, `${name}.html`)])
      ),
    },
  },
});
