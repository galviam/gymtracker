/**
 * Charts: dibuja un gráfico de línea simple en SVG a partir de puntos {x: Date, y: number}.
 * Sin librerías externas para que la app funcione 100% offline.
 */
const Charts = {
  lineChart(points, { width = 320, height = 160, color = "#3D5AFE" } = {}) {
    if (points.length < 2) return "";
    const padding = { top: 16, right: 12, bottom: 20, left: 12 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const xs = points.map(p => p.x.getTime());
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const yRange = maxY - minY || 1;

    const scaleX = (x) => padding.left + (maxX === minX ? innerW / 2 : ((x - minX) / (maxX - minX)) * innerW);
    const scaleY = (y) => padding.top + innerH - ((y - minY) / yRange) * innerH;

    const coords = points.map(p => [scaleX(p.x.getTime()), scaleY(p.y)]);
    const linePath = coords.map((c, i) => (i === 0 ? "M" : "L") + c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
    const areaPath = linePath + ` L${coords[coords.length - 1][0].toFixed(1)},${height - padding.bottom} L${coords[0][0].toFixed(1)},${height - padding.bottom} Z`;

    const dots = coords.map(c => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3.5" fill="${color}" />`).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#areaGrad)" />
        <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
      </svg>
    `;
  }
};
