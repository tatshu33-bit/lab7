// Мінімальні SVG-графіки без зовнішніх бібліотек (працюють офлайн).
const Charts = (() => {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLORS = ["#3498db", "#27ae60", "#f39c12", "#e74c3c", "#9b59b6", "#16a085", "#7f8c8d"];
  const W = 520;
  const empty = () => '<p class="muted">Немає даних</p>';
  // горизонтальні стовпці: [[назва, значення], ...]
  function hbar(rows) {
    if (!rows.length) return empty();
    const max = Math.max(...rows.map(r => r[1])) || 1, rh = 26, lw = 150, h = rows.length * rh + 6;
    return `<svg viewBox="0 0 ${W} ${h}" role="img">${rows.map((r, i) => { const w = (W - lw - 50) * r[1] / max, y = i * rh + 3;
      return `<text x="${lw - 6}" y="${y + 17}" text-anchor="end" font-size="12" fill="#555">${esc(r[0])}</text><rect x="${lw}" y="${y + 3}" width="${Math.max(w, 1)}" height="18" rx="3" fill="${COLORS[0]}"><title>${esc(r[0])}: ${r[1]}</title></rect><text x="${lw + w + 5}" y="${y + 17}" font-size="12" fill="#333">${r[1]}</text>`; }).join("")}</svg>`;
  }
  // вертикальні стовпці
  function bars(rows) {
    if (!rows.length) return empty();
    const max = Math.max(...rows.map(r => r[1])) || 1, h = 220, pb = 28, bw = (W - 20) / rows.length;
    return `<svg viewBox="0 0 ${W} ${h}" role="img">${rows.map((r, i) => { const bh = (h - pb - 18) * r[1] / max, x = 10 + i * bw;
      return `<rect x="${x + 4}" y="${h - pb - bh}" width="${bw - 8}" height="${bh}" rx="3" fill="${COLORS[1]}"><title>${esc(r[0])}: ${r[1]}</title></rect><text x="${x + bw / 2}" y="${h - pb - bh - 4}" text-anchor="middle" font-size="11" fill="#333">${r[1]}</text><text x="${x + bw / 2}" y="${h - 10}" text-anchor="middle" font-size="10" fill="#555">${esc(r[0])}</text>`; }).join("")}</svg>`;
  }
  // лінія з точками
  function line(rows) {
    if (rows.length < 2) return rows.length ? bars(rows) : empty();
    const max = Math.max(...rows.map(r => r[1])) || 1, h = 220, pl = 40, pb = 28, pt = 12;
    const pts = rows.map((r, i) => [pl + (W - pl - 30) * i / (rows.length - 1), pt + (h - pb - pt) * (1 - r[1] / max)]);
    const step = Math.ceil(rows.length / 8);
    return `<svg viewBox="0 0 ${W} ${h}" role="img"><line x1="${pl}" y1="${h - pb}" x2="${W - 30}" y2="${h - pb}" stroke="#ccc"/><line x1="${pl}" y1="${pt}" x2="${pl}" y2="${h - pb}" stroke="#ccc"/>
      <text x="${pl - 4}" y="${pt + 8}" text-anchor="end" font-size="10" fill="#555">${max}</text><text x="${pl - 4}" y="${h - pb}" text-anchor="end" font-size="10" fill="#555">0</text>
      <polyline fill="none" stroke="${COLORS[0]}" stroke-width="2" points="${pts.map(p => p.join(",")).join(" ")}"/>
      ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${COLORS[0]}"><title>${esc(rows[i][0])}: ${rows[i][1]}</title></circle>${i % step === 0 ? `<text x="${p[0]}" y="${h - 10}" text-anchor="middle" font-size="10" fill="#555">${esc(rows[i][0])}</text>` : ""}`).join("")}</svg>`;
  }
  // кільцева діаграма з легендою
  function donut(rows) {
    const tot = rows.reduce((s, r) => s + r[1], 0); if (!tot) return empty();
    const cx = 110, cy = 110, R = 90, r = 52; let a = -Math.PI / 2;
    const arcs = rows.map((row, i) => { const da = 2 * Math.PI * row[1] / tot, a2 = a + (da >= 2 * Math.PI ? 2 * Math.PI - 1e-4 : da);
      const p = (rad, ang) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)], large = da > Math.PI ? 1 : 0;
      const [x1, y1] = p(R, a), [x2, y2] = p(R, a2), [x3, y3] = p(r, a2), [x4, y4] = p(r, a); a += da;
      return `<path d="M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${large} 0 ${x4},${y4}Z" fill="${COLORS[i % COLORS.length]}"><title>${esc(row[0])}: ${row[1]}</title></path>`; }).join("");
    const legend = rows.map((row, i) => `<rect x="240" y="${60 + i * 26}" width="14" height="14" rx="2" fill="${COLORS[i % COLORS.length]}"/><text x="262" y="${72 + i * 26}" font-size="13" fill="#333">${esc(row[0])}: ${row[1]} (${Math.round(row[1] / tot * 100)}%)</text>`).join("");
    return `<svg viewBox="0 0 ${W} 220" role="img">${arcs}<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="20" font-weight="600" fill="#2c3e50">${tot}</text>${legend}</svg>`;
  }
  return { hbar, bars, line, donut };
})();
