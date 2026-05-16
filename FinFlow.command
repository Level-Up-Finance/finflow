#!/bin/bash
# Inicia o dev server do Vite em background e abre o browser.
# Duplo-clique para usar — o terminal fecha sozinho após abrir.
cd "$(dirname "$0")"

# Para qualquer servidor anterior na porta 8765
lsof -ti :8765 | xargs kill -9 2>/dev/null
sleep 0.5

# Garante node_modules instalado
if [ ! -d "node_modules" ]; then
  echo "Instalando dependências (primeira vez)…"
  npm install
fi

# Inicia o Vite em background (log em /tmp/finflow-server.log)
nohup npm run dev -- --port 8765 --host > /tmp/finflow-server.log 2>&1 &
echo $! > /tmp/finflow-server.pid

# Aguarda servidor subir e abre no browser
sleep 2
open http://localhost:8765

# Fecha o terminal automaticamente
osascript -e 'tell application "Terminal" to close front window' &
