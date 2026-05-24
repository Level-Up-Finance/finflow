import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-page app — uma entry por HTML.
const root = process.cwd();
const htmlPages = [
  'index',
  'aceitar-convite',
  'privacidade',
  'termos',
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
  'tarefas',
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
    port: 8004,
    strictPort: false, // se 8004 ocupada, Vite vai pra próxima livre
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
