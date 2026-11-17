/* =========================================================================
   baccarat/roadmap.js — bead plate, big road and the three derived roads
   (big eye boy, small road, cockroach pig) with the classic column rules.
   ========================================================================= */

export const ROWS = 6;

/** Big road: columns of same-result runs, 6 rows, dragon-tail overflow. */
export function buildBigRoad(history) {
  const cols = []; // [{ result, cells:[{row,result,tie,tieCount}] }]
  for (const r of history) {
    const last = cols[cols.length - 1];
    if (r.result === 'T') {
      // a tie rides on the previous cell
      if (last && last.cells.length) last.cells[last.cells.length - 1].tie = true;
      continue;
    }
    if (!last || last.result !== r.result) {
      cols.push({ result: r.result, cells: [{ row: 0, result: r.result, tie: r.playerPair || r.bankerPair }] });
    } else {
      let target = last.cells[last.cells.length - 1].row + 1;
      if (target > ROWS - 1) {
        // dragon tail: pile into the next column on the bottom row
        cols.push({ result: r.result, cells: [{ row: ROWS - 1, result: r.result, tie: false }] });
      } else {
        last.cells.push({ row: target, result: r.result, tie: r.playerPair || r.bankerPair });
      }
    }
  }
  return cols;
}

/** Flatten big road into a lookup: column -> row -> result */
function columnAt(cols, c) {
  return cols[c] ? cols[c].cells : null;
}

/**
 * Derived roads.
 * offset 1 = Big Eye Boy, 2 = Small Road, 3 = Cockroach Pig.
 * A dot is RED when the compared column reaches that row (the pattern
 * repeated), BLUE when it does not. Classic layout: from the 2nd row on,
 * starting at the column `offset`.
 */
export function buildDerivedRoad(cols, offset) {
  const cells = []; // { c, r, red }
  for (let c = offset; c < cols.length; c++) {
    const cellsHere = cols[c].cells;
    const prev = columnAt(cols, c - offset);
    for (const cell of cellsHere) {
      if (cell.row < 1) continue;
      const red = prev ? prev.some((p) => p.row === cell.row) : false;
      cells.push({ c, r: cell.row, red });
    }
  }
  return cells;
}

export function statsFor(history) {
  const s = { B: 0, P: 0, T: 0 };
  history.forEach((h) => { s[h.result] += 1; });
  const total = s.B + s.P + s.T;
  return { ...s, total, pct: (k) => (total ? Math.round((s[k] / total) * 100) : 0) };
}

/** Next-hand prediction chip, driven by the last few hands (visual only). */
export function predict(history) {
  const last = history.slice(-6).filter((h) => h.result !== 'T');
  if (!last.length) return null;
  const b = last.filter((h) => h.result === 'B').length;
  const p = last.length - b;
  if (b === p) return null;
  return b > p ? 'B' : 'P';
}

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/** Bead plate: big coloured circles, 6 per column, newest on the right. */
export function renderBead(host, history, { maxCols = 12 } = {}) {
  host.innerHTML = '';
  const start = Math.max(0, Math.ceil(history.length / ROWS) - maxCols);
  const slice = history.slice(start * ROWS);
  const grid = el('div', 'bead-grid');
  grid.style.gridTemplateColumns = `repeat(${Math.max(1, Math.ceil(slice.length / ROWS))}, var(--cell))`;
  slice.forEach((h, i) => {
    const cell = el('div', `bead bead-${h.result}${h.result === 'T' ? ' tie' : ''}`);
    cell.textContent = h.result;
    if (h.result !== 'T' && (h.playerPair || h.bankerPair)) cell.classList.add('pair');
    cell.style.gridColumn = Math.floor(i / ROWS) + 1;
    cell.style.gridRow = (i % ROWS) + 1;
    cell.title = `${h.result} · P${h.playerTotal} / B${h.bankerTotal}`;
    grid.appendChild(cell);
  });
  host.appendChild(grid);
}

/** Big road grid with tie slashes and pair dots. */
export function renderBigRoad(host, history, { maxCols = 30 } = {}) {
  host.innerHTML = '';
  const cols = buildBigRoad(history);
  const start = Math.max(0, cols.length - maxCols);
  const visible = cols.slice(start);
  const grid = el('div', 'bigroad-grid');
  grid.style.gridTemplateColumns = `repeat(${Math.max(1, visible.length)}, var(--cell))`;
  visible.forEach((col, ci) => {
    col.cells.forEach((cell) => {
      const node = el('div', `br-cell ${cell.result === 'B' ? 'banker' : 'player'}`);
      node.textContent = cell.result === 'B' ? 'B' : 'P';
      if (cell.tie) node.classList.add('tie-mark');
      node.style.gridColumn = ci + 1;
      node.style.gridRow = cell.row + 1;
      grid.appendChild(node);
    });
  });
  host.appendChild(grid);
}

export function renderDerived(host, cols, offset, { maxCols = 30 } = {}) {
  host.innerHTML = '';
  const cells = buildDerivedRoad(cols, offset);
  if (!cells.length) {
    host.appendChild(el('div', 'road-empty', '—'));
    return;
  }
  const maxC = Math.max(...cells.map((c) => c.c));
  const minC = Math.max(offset, maxC - maxCols + 1);
  const grid = el('div', 'derived-grid');
  grid.style.gridTemplateColumns = `repeat(${maxC - minC + 1}, var(--cell))`;
  cells.forEach((c) => {
    if (c.c < minC) return;
    const node = el('div', `dr-dot ${c.red ? 'red' : 'blue'}`);
    node.style.gridColumn = c.c - minC + 1;
    node.style.gridRow = c.r;
    grid.appendChild(node);
  });
  host.appendChild(grid);
}

/** Everything at once — called after each settled round. */
export function renderAll(hosts, history) {
  const cols = buildBigRoad(history);
  renderBead(hosts.bead, history);
  renderBigRoad(hosts.big, history);
  renderDerived(hosts.beb, cols, 1);
  renderDerived(hosts.sr, cols, 2);
  renderDerived(hosts.cp, cols, 3);
  const st = statsFor(history);
  if (hosts.stats) {
    hosts.stats.innerHTML = `
      <div class="stat-row"><span class="s-b">BANKER</span><b>${st.B}</b><i>${st.pct('B')}%</i></div>
      <div class="stat-row"><span class="s-p">PLAYER</span><b>${st.P}</b><i>${st.pct('P')}%</i></div>
      <div class="stat-row"><span class="s-t">TIE</span><b>${st.T}</b><i>${st.pct('T')}%</i></div>`;
  }
  if (hosts.predict) {
    const p = predict(history);
    hosts.predict.className = 'predict ' + (p === 'B' ? 'banker' : p === 'P' ? 'player' : 'none');
    hosts.predict.innerHTML = p ? `<span>NEXT</span><b>${p === 'B' ? 'BANKER' : 'PLAYER'}?</b>` : `<span>NEXT</span><b>—</b>`;
  }
}
