// Shared currency list used across contas, transações, and configurações.
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
    const raw = localStorage.getItem('finflow.moedas_widget');
    const list = raw ? JSON.parse(raw) : null;
    if (Array.isArray(list) && list.length) return list;
  } catch { }
  return ['BRL', 'USD', 'EUR'];
}

export function getMoedaPadrao() {
  return localStorage.getItem('finflow.moeda_padrao') || 'BRL';
}
