#!/bin/bash
# Verifica disponibilidade de domínios via WHOIS direto nos servidores authoritative
# Compatível com bash 3.2+ (default do macOS)
# Uso: ./check-domains.sh nome1 nome2 nome3

whois_server() {
  case "$1" in
    com) echo "whois.verisign-grs.com" ;;
    io)  echo "whois.nic.io" ;;
    app) echo "whois.nic.google" ;;
    co)  echo "whois.nic.co" ;;
    *)   echo "" ;;
  esac
}

check_domain() {
  local name="$1"
  local tld="$2"
  local server
  server=$(whois_server "$tld")
  local domain="${name}.${tld}"

  local output
  output=$(whois -h "$server" "$domain" 2>&1)

  if echo "$output" | grep -qi "Domain Name:"; then
    printf "tomado  "
  elif echo "$output" | grep -qiE "No match for|NOT FOUND|Domain not found|No Data Found|is available for purchase"; then
    printf "LIVRE   "
  else
    printf "incerto "
  fi
}

if [ $# -lt 1 ]; then
  echo "Uso: $0 nome1 nome2 nome3 ..."
  exit 1
fi

printf "%-15s | %-7s | %-7s | %-7s | %-7s\n" "Nome" ".com" ".io" ".app" ".co"
printf "%-15s-+-%-7s-+-%-7s-+-%-7s-+-%-7s\n" "---------------" "-------" "-------" "-------" "-------"

for raw in "$@"; do
  # Remove acentos pra ter ASCII puro
  name=$(echo "$raw" | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -d ' ')

  printf "%-15s | " "$raw"
  check_domain "$name" "com"
  printf "| "
  check_domain "$name" "io"
  printf "| "
  check_domain "$name" "app"
  printf "| "
  check_domain "$name" "co"
  printf "\n"
done
