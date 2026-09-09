/**
 * Charts: dibuja un gráfico de línea simple en SVG a partir de puntos {x: Date, y: number}.
 * Sin librerías externas para que la app funcione 100% offline.
 */
const Charts = {
  lineChart(points, { width = 320, height = 190, color = "#3D5AFE" } = {}) {
    if (points.length < 2) return "";
    // Más margen alrededor para dejar sitio a las etiquetas de los ejes
    const padding = { top: 16, right: 14, bottom: 34, left: 44 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const xs = points.map(p => p.x.getTime());
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    let minY = Math.min(...ys), maxY = Math.max(...ys);
    if (minY === maxY) { minY -= 1; maxY += 1; } // evita eje Y plano si todos los valores son iguales
    const yRange = maxY - minY;

    const scaleX = (x) => padding.left + (maxX === minX ? innerW / 2 : ((x - minX) / (maxX - minX)) * innerW);
    const scaleY = (y) => padding.top + innerH - ((y - minY) / yRange) * innerH;

    const coords = points.map(p => [scaleX(p.x.getTime()), scaleY(p.y)]);
    const linePath = coords.map((c, i) => (i === 0 ? "M" : "L") + c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
    const areaPath = linePath + ` L${coords[coords.length - 1][0].toFixed(1)},${padding.top + innerH} L${coords[0][0].toFixed(1)},${padding.top + innerH} Z`;

    const dots = coords.map(c => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3.5" fill="${color}" />`).join("");

    // ---- Eje Y: 4 marcas horizontales con su valor ----
    const yTicksCount = 4;
    let yTicks = "";
    for (let i = 0; i <= yTicksCount; i++) {
      const value = minY + (yRange * i) / yTicksCount;
      const y = scaleY(value);
      yTicks += `
        <line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.08" stroke-width="1" />
        <text x="${padding.left - 8}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="currentColor" opacity="0.55">${Math.round(value)}</text>
      `;
    }

    // ---- Eje X: fecha del primer punto, uno intermedio y el último ----
    const fmtShort = (d) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const xIndexes = points.length <= 2 ? [0, points.length - 1] : [0, Math.floor((points.length - 1) / 2), points.length - 1];
    const xTicks = xIndexes.map(i => {
      const x = coords[i][0];
      return `<text x="${x.toFixed(1)}" y="${height - padding.bottom + 18}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55">${fmtShort(points[i].x)}</text>`;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" style="color: var(--text);">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${yTicks}
        <line x1="${padding.left}" y1="${padding.top + innerH}" x2="${width - padding.right}" y2="${padding.top + innerH}" stroke="currentColor" stroke-opacity="0.2" stroke-width="1" />
        <path d="${areaPath}" fill="url(#areaGrad)" />
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
        ${xTicks}
      </svg>
    `;
  }
};