#!/bin/bash
# Inicia o dev server do Vite em background.
cd "$(dirname "$0")"

# Para qualquer servidor anterior na porta 8000
lsof -ti :8000 | xargs kill -9 2>/dev/null

# Garante node_modules instalado
if [ ! -d "node_modules" ]; then
  echo "Instalando dependências (primeira vez)…"
  npm install
fi

# Inicia o Vite em background
nohup npm run dev > /tmp/finflow-server.log 2>&1 &
echo $! > /tmp/finflow-server.pid
echo "FinFlow iniciado em http://localhost:8000"

# Aguarda servidor subir e abre no browser
sleep 2
open http://localhost:8000
