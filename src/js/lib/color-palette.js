// Paleta unificada de cores para todo o sistema (avatar de contas, categorias,
// projetos de investimento). Organizada em 7 colunas × 3 linhas pelo círculo
// cromático, partindo dos quentes para os frios.
export const COLOR_PALETTE = [
  // Linha 1 — vermelhos / laranjas / marrom
  '#DC2626', '#B91C1C', '#F43F5E', '#EA580C', '#F97316', '#FB923C', '#92400E',
  // Linha 2 — café / amarelos / verdes
  '#78350F', '#CA8A04', '#FBBF24', '#84CC16', '#22C55E', '#047857', '#14B8A6',
  // Linha 3 — cyan / azuis / roxos / cinza
  '#0891B2', '#3B82F6', '#1E40AF', '#6D5EF5', '#8B5CF6', '#C026D3', '#64748B',
];

export const DEFAULT_COLOR = '#6D5EF5';

// Renderiza um grid de swatches dentro do container informado e devolve a cor
// inicialmente selecionada. Se `selected` não estiver na paleta, ativa a
// primeira cor que combine ou cai no DEFAULT_COLOR.
export function renderColorPicker(container, selected = DEFAULT_COLOR) {
  const active = COLOR_PALETTE.includes(selected) ? selected : DEFAULT_COLOR;
  container.innerHTML = COLOR_PALETTE.map((color) => `
    <button type="button" class="color-swatch ${color === active ? 'active' : ''}" data-color="${color}" style="background-color: ${color};" aria-label="Cor ${color}"></button>
  `).join('');
  return active;
}

// Marca o swatch correspondente como ativo dentro do container informado.
export function setActiveColor(container, color) {
  container.querySelectorAll('.color-swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.color === color);
  });
}
