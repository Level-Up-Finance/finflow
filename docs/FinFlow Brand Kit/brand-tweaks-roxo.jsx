// Tweaks panel for the FinFlow Brand Book.
// Lets the user swap palette, wordmark weight, featured symbol concept,
// and toggle the symbol on the cover.

const { useEffect } = React;
const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle } = window;

const FINFLOW_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": ["#6D5EF5", "#C2F542"],
  "wordmarkWeight": 800,
  "symbolConcept": "A",
  "showCoverSymbol": true,
  "darkCover": false
}/*EDITMODE-END*/;

const PALETTES = [
  ["#6D5EF5", "#C2F542"],  // Roxo Tech + Lime (default — Mix A+D)
  ["#4F46E5", "#FF8B6B"],  // Indigo + Salmão (Warm Pro)
  ["#6D5EF5", "#FF8B6B"],  // Roxo + Salmão
  ["#0F172A", "#C2F542"],  // Ink + Lime (high contrast)
];

function applyTweaks(t) {
  const root = document.documentElement;
  const [primary, secondary] = t.palette;
  root.style.setProperty('--indigo-600', primary);
  root.style.setProperty('--salmon-400', secondary);

  // Update derived gradient stops
  root.style.setProperty('--grad-hero',
    `linear-gradient(135deg, ${primary} 0%, ${shade(primary, 0.15)} 50%, ${secondary} 100%)`);

  // Wordmark weight on cover
  document.querySelectorAll('[data-wordmark]').forEach(el => {
    el.style.fontWeight = t.wordmarkWeight;
  });

  // Featured symbol concept
  document.querySelectorAll('[data-symbol-slot]').forEach(slot => {
    slot.querySelectorAll('[data-symbol]').forEach(s => {
      s.style.display = s.dataset.symbol === t.symbolConcept ? '' : 'none';
    });
  });

  // Cover symbol toggle
  const coverMark = document.querySelector('.cover .corner-mark');
  if (coverMark) coverMark.style.display = t.showCoverSymbol ? '' : 'none';

  // Dark cover toggle
  const cover = document.querySelector('.cover');
  if (cover) {
    cover.style.background = t.darkCover ? 'var(--ink-950)' : 'var(--paper)';
    cover.style.color = t.darkCover ? 'var(--paper)' : '';
    cover.querySelectorAll('.wordmark-big, .tagline, .top-bar, .bottom-bar').forEach(el => {
      el.style.color = t.darkCover ? 'rgba(255,255,255,0.95)' : '';
    });
    cover.querySelectorAll('.wordmark-big .ink').forEach(el => {
      el.style.color = t.darkCover ? 'var(--paper)' : '';
    });
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * (1 - amt))));
  g = Math.max(0, Math.min(255, Math.round(g * (1 - amt))));
  b = Math.max(0, Math.min(255, Math.round(b * (1 - amt))));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function App() {
  const [t, setTweak] = useTweaks(FINFLOW_DEFAULTS);
  useEffect(() => { applyTweaks(t); }, [t]);

  return (
    <TweaksPanel title="Brand tweaks">
      <TweakSection label="Paleta" />
      <TweakColor
        label="Primária + acento"
        value={t.palette}
        options={PALETTES}
        onChange={(v) => setTweak('palette', v)}
      />

      <TweakSection label="Wordmark" />
      <TweakRadio
        label="Peso"
        value={t.wordmarkWeight}
        options={[{value: 700, label: 'Bold'}, {value: 800, label: 'XBold'}]}
        onChange={(v) => setTweak('wordmarkWeight', v)}
      />

      <TweakSection label="Símbolo" />
      <TweakRadio
        label="Conceito"
        value={t.symbolConcept}
        options={[{value: 'A', label: 'Track'}, {value: 'B', label: 'Step F'}, {value: 'C', label: 'Bridge'}]}
        onChange={(v) => setTweak('symbolConcept', v)}
      />

      <TweakSection label="Cover" />
      <TweakToggle
        label="Símbolo na capa"
        value={t.showCoverSymbol}
        onChange={(v) => setTweak('showCoverSymbol', v)}
      />
      <TweakToggle
        label="Capa dark"
        value={t.darkCover}
        onChange={(v) => setTweak('darkCover', v)}
      />
    </TweaksPanel>
  );
}

const root = ReactDOM.createRoot(document.getElementById('tweaks-root'));
root.render(<App />);
