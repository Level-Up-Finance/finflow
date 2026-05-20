// Lista compacta de moedas disponíveis (15) usada em:
//   /configuracoes — grid de checkboxes "Moedas utilizadas"
//   pickers de moeda — ao listar opções não habilitadas
// Para os 4 códigos suportados com formatação completa, ver lib/moedas.js.

import { STORAGE_KEYS } from './storage-keys.js';

export const CURRENCIES = [
  { code: 'BRL', label: 'Real Brasileiro'   },
  { code: 'USD', label: 'Dólar Americano'   },
  { code: 'EUR', label: 'Euro'              },
  { code: 'GBP', label: 'Libra Esterlina'   },
  { code: 'ARS', label: 'Peso Argentino'    },
  { code: 'CLP', label: 'Peso Chileno'      },
  { code: 'COP', label: 'Peso Colombiano'   },
  { code: 'MXN', label: 'Peso Mexicano'     },
  { code: 'PYG', label: 'Guarani Paraguaio' },
  { code: 'UYU', label: 'Peso Uruguaio'     },
  { code: 'JPY', label: 'Iene Japonês'      },
  { code: 'CNY', label: 'Yuan Chinês'       },
  { code: 'CAD', label: 'Dólar Canadense'   },
  { code: 'AUD', label: 'Dólar Australiano' },
  { code: 'CHF', label: 'Franco Suíço'      },
];

// Reads the user's configured currencies from localStorage (set by configuracoes).
// Falls back to BRL + USD + EUR if not configured.
export function getUserCurrencies() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MOEDAS_WIDGET);
    const list = raw ? JSON.parse(raw) : null;
    if (Array.isArray(list) && list.length) return list;
  } catch { /* ignore */ }
  return ['BRL', 'USD', 'EUR'];
}

/**
 * @deprecated v1.0.1 — Sistema usa BRL fixo como moeda padrão.
 * Mantido só pra compatibilidade com código legado que ainda referencia.
 * Não usar em código novo.
 */
export function getMoedaPadrao() {
  return localStorage.getItem(STORAGE_KEYS.MOEDA_PADRAO) || 'BRL';
}
