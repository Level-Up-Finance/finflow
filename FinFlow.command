#!/bin/bash
# Para qualquer servidor anterior na porta 8000
lsof -ti :8000 | xargs kill -9 2>/dev/null

# Inicia o servidor em background (sem janela de terminal)
nohup python3 -m http.server 8000 \
  --directory "$(dirname "$0")" \
  > /tmp/finflow-server.log 2>&1 &

echo $! > /tmp/finflow-server.pid
echo "FinFlow iniciado em http://localhost:8000"

# Aguarda 1 segundo e abre no browser
sleep 1
open http://localhost:8000
