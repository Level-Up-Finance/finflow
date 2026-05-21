#!/bin/bash
# Checa .com e .com.br (rápido)
# Uso: ./check-com.sh nome1 nome2 ...

if [ $# -lt 1 ]; then
  echo "Uso: $0 nome1 nome2 nome3 ..."
  exit 1
fi

check_com() {
  local name="$1"
  local output
  output=$(whois -h whois.verisign-grs.com "${name}.com" 2>&1)
  if echo "$output" | grep -qi "Domain Name:"; then
    echo "✗"
  elif echo "$output" | grep -qi "No match for"; then
    echo "✓"
  else
    echo "?"
  fi
}

check_combr() {
  local name="$1"
  local output
  output=$(whois -h whois.registro.br "${name}.com.br" 2>&1)
  # registro.br responde com "No match for" quando livre,
  # ou com bloco de dados (domain, ownerid, etc.) quando tomado
  if echo "$output" | grep -qiE "^domain:|^owner:|ownerid:"; then
    echo "✗"
  elif echo "$output" | grep -qiE "No match for|No match$|domain not found"; then
    echo "✓"
  else
    echo "?"
  fi
}

printf "%-15s %-8s %-8s\n" "Nome" ".com" ".com.br"
printf "%-15s %-8s %-8s\n" "---------------" "--------" "--------"

for raw in "$@"; do
  name=$(echo "$raw" | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -d ' ')
  com=$(check_com "$name")
  br=$(check_combr "$name")
  printf "%-15s %-8s %-8s\n" "$raw" "$com" "$br"
done
