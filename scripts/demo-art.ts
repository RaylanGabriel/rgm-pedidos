/**
 * Ilustrações vetoriais simples de comida (estilo app de delivery) para cardápios de demonstração.
 * Não são fotos: servem para ver o layout com imagens até a loja subir as fotos reais.
 */

const W = 800
const H = 600
const CX = W / 2

type Bg = [string, string]

function frame(content: string, bg: Bg, shadowY = 500, shadowW = 230) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="75%">
      <stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/>
    </radialGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="120" cy="90" r="160" fill="#fff" opacity=".07"/>
  <circle cx="700" cy="560" r="200" fill="#000" opacity=".05"/>
  <ellipse cx="${CX}" cy="${shadowY}" rx="${shadowW}" ry="26" fill="#000" opacity=".18"/>
  ${content}
</svg>`
}

// ---------- Hambúrguer ----------
export interface BurgerSpec {
  patties?: number
  cheese?: number
  bacon?: boolean
  lettuce?: boolean
  tomato?: boolean
  onion?: "caramel" | "red"
  pickles?: boolean
  chicken?: boolean
  sauce?: string
}

function wave(y: number, w: number, amp: number, n: number) {
  const x0 = CX - w / 2
  const step = w / n
  let d = `M${x0} ${y}`
  for (let i = 0; i < n; i++) d += ` q${step / 2} ${i % 2 ? amp : -amp} ${step} 0`
  return d
}

export function burgerParts(s: BurgerSpec, scale = 1, dx = 0, dy = 0) {
  const parts: string[] = []
  let y = 470 // topo da camada atual (de baixo para cima)
  const w = 340
  // pão de baixo
  parts.push(`<path d="M${CX - w / 2} ${y - 6} h${w} q0 44 -40 50 h${-(w - 80)} q-40 -6 -40 -50z" fill="#d98c3f"/>`)
  parts.push(`<rect x="${CX - w / 2}" y="${y - 14}" width="${w}" height="16" rx="8" fill="#f2c27b"/>`)
  y -= 14
  const patty = () => {
    const h = 40
    y -= h - 4
    parts.push(`<rect x="${CX - w / 2 - 12}" y="${y}" width="${w + 24}" height="${h}" rx="20" fill="${s.chicken ? "#d79a45" : "#5a3420"}"/>`)
    parts.push(`<path d="${wave(y + 6, w, 4, 10)}" stroke="${s.chicken ? "#f0bd6a" : "#7a4a30"}" stroke-width="6" fill="none" stroke-linecap="round"/>`)
    if (!s.chicken) for (let i = 0; i < 7; i++) parts.push(`<circle cx="${CX - 140 + i * 47}" cy="${y + 24 + (i % 2) * 5}" r="3.5" fill="#3b2013"/>`)
    else for (let i = 0; i < 9; i++) parts.push(`<circle cx="${CX - 150 + i * 37}" cy="${y + 20 + (i % 3) * 5}" r="4" fill="#b87a2e"/>`)
  }
  const cheese = () => {
    y -= 10
    let d = `M${CX - w / 2 - 14} ${y} h${w + 28} v12`
    const drips = [0.82, 0.62, 0.4, 0.18]
    for (const f of drips) {
      const x = CX - w / 2 + w * f
      d += ` L${x + 26} ${y + 12} q-8 40 -18 0`
    }
    d += ` L${CX - w / 2 - 14} ${y + 12}z`
    parts.push(`<path d="${d}" fill="#f6b52e"/>`)
    parts.push(`<rect x="${CX - w / 2 - 14}" y="${y}" width="${w + 28}" height="5" rx="2" fill="#ffd66b"/>`)
  }
  for (let i = 0; i < (s.patties ?? 1); i++) {
    patty()
    if (i < (s.cheese ?? 0)) cheese()
  }
  if (s.onion === "caramel") {
    y -= 12
    parts.push(`<path d="${wave(y + 6, w - 20, 7, 14)}" stroke="#a5642a" stroke-width="12" fill="none" stroke-linecap="round"/>`)
  }
  if (s.bacon) {
    y -= 16
    for (const off of [-90, 70]) {
      parts.push(`<path d="M${CX + off - 85} ${y + 8} q20 -16 40 0 t40 0 t40 0 t40 0" stroke="#9e3426" stroke-width="16" fill="none" stroke-linecap="round"/>`)
      parts.push(`<path d="M${CX + off - 85} ${y + 8} q20 -16 40 0 t40 0 t40 0 t40 0" stroke="#e9a089" stroke-width="4" fill="none" stroke-linecap="round"/>`)
    }
  }
  if (s.pickles) {
    y -= 8
    for (const x of [-110, -30, 50, 120]) parts.push(`<ellipse cx="${CX + x}" cy="${y + 4}" rx="26" ry="8" fill="#7d9a2f" stroke="#5a7420" stroke-width="3"/>`)
  }
  if (s.tomato) {
    y -= 18
    for (const x of [-95, 0, 95]) parts.push(`<rect x="${CX + x - 52}" y="${y}" width="104" height="20" rx="10" fill="#e0412f"/><rect x="${CX + x - 40}" y="${y + 5}" width="80" height="6" rx="3" fill="#f47c62"/>`)
  }
  if (s.onion === "red") {
    y -= 8
    for (const x of [-80, 20, 110]) parts.push(`<ellipse cx="${CX + x}" cy="${y + 4}" rx="40" ry="9" fill="none" stroke="#a54d8a" stroke-width="6"/>`)
  }
  if (s.lettuce) {
    y -= 16
    parts.push(`<path d="${wave(y + 10, w + 40, 12, 16)} L${CX + w / 2 + 20} ${y + 20} L${CX - w / 2 - 20} ${y + 20}z" fill="#5cb83c"/>`)
    parts.push(`<path d="${wave(y + 8, w + 40, 12, 16)}" stroke="#8fdc5f" stroke-width="5" fill="none"/>`)
  }
  if (s.sauce) {
    y -= 6
    parts.push(`<path d="${wave(y + 4, w - 40, 6, 12)}" stroke="${s.sauce}" stroke-width="10" fill="none" stroke-linecap="round"/>`)
  }
  // pão de cima
  const top = y - 150
  parts.push(`<path d="M${CX - w / 2 - 6} ${y + 4} C${CX - w / 2 - 6} ${top}, ${CX + w / 2 + 6} ${top}, ${CX + w / 2 + 6} ${y + 4} z" fill="#e0913f"/>`)
  parts.push(`<path d="M${CX - 120} ${y - 62} Q${CX - 70} ${y - 100} ${CX + 10} ${y - 104}" stroke="#f6c27a" stroke-width="14" fill="none" stroke-linecap="round" opacity=".8"/>`)
  const seeds = [
    [-110, 50], [-60, 25], [-5, 15], [55, 22], [110, 45], [-85, 80], [-25, 60], [35, 58], [90, 85], [0, 95], [-140, 100], [140, 105],
  ]
  for (const [sx, sy] of seeds) parts.push(`<ellipse cx="${CX + sx}" cy="${top + 40 + sy}" rx="9" ry="5" fill="#fbe9c2" transform="rotate(${sx / 6} ${CX + sx} ${top + 40 + sy})"/>`)

  return `<g transform="translate(${dx} ${dy}) translate(${CX} 470) scale(${scale}) translate(${-CX} -470)">${parts.join("")}</g>`
}

export const burger = (s: BurgerSpec) => {
  // Mais camadas = lanche mais alto: reduz um pouco para caber
  const layers = (s.patties ?? 1) * 1.4 + [s.bacon, s.lettuce, s.tomato, s.onion, s.pickles].filter(Boolean).length * 0.4
  const scale = Math.min(1.3, 1.55 - layers * 0.12)
  return frame(burgerParts(s, scale, 0, -45), ["#ffe2b8", "#f5a95b"], 505, 230 * scale)
}

// ---------- Batata ----------
function friesParts(opts: { cheddar?: boolean; bacon?: boolean } = {}, scale = 1, dx = 0, dy = 0) {
  const p: string[] = []
  const fries = 14
  for (let i = 0; i < fries; i++) {
    const x = CX - 120 + i * 18 + (i % 3) * 4
    const h = 170 + ((i * 37) % 60)
    const rot = (i - fries / 2) * 2.5
    p.push(`<rect x="${x}" y="${330 - h}" width="22" height="${h + 40}" rx="5" fill="${i % 2 ? "#f7c948" : "#f2b632"}" transform="rotate(${rot} ${x} 330)"/>`)
  }
  if (opts.cheddar) p.push(`<path d="M${CX - 150} 250 q40 -40 80 0 t80 0 t80 0 t60 -10 v60 h-300z" fill="#f39c12"/><path d="M${CX - 150} 250 q40 -40 80 0 t80 0 t80 0" stroke="#ffc266" stroke-width="6" fill="none"/>`)
  if (opts.bacon) for (let i = 0; i < 12; i++) p.push(`<rect x="${CX - 130 + ((i * 53) % 260)}" y="${220 + ((i * 29) % 50)}" width="20" height="12" rx="3" fill="#9e3426" transform="rotate(${i * 25} ${CX - 120 + ((i * 53) % 260)} ${226 + ((i * 29) % 50)})"/>`)
  // embalagem
  p.push(`<path d="M${CX - 170} 290 L${CX + 170} 290 L${CX + 130} 500 L${CX - 130} 500z" fill="#c62828"/>`)
  p.push(`<path d="M${CX - 170} 290 Q${CX} 350 ${CX + 170} 290 L${CX + 160} 330 Q${CX} 390 ${CX - 160} 330z" fill="#e53935"/>`)
  p.push(`<path d="M${CX - 150} 300 L${CX - 120} 490" stroke="#fff" stroke-opacity=".25" stroke-width="18"/>`)
  p.push(`<circle cx="${CX}" cy="420" r="38" fill="#fff" opacity=".9"/><path d="M${CX - 18} 420 h36 M${CX} 402 v36" stroke="#c62828" stroke-width="9" stroke-linecap="round" opacity=".0"/>`)
  p.push(`<text x="${CX}" y="433" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="#c62828" text-anchor="middle">F</text>`)
  return `<g transform="translate(${dx} ${dy}) translate(${CX} 500) scale(${scale}) translate(${-CX} -500)">${p.join("")}</g>`
}
export const fries = (o: { cheddar?: boolean; bacon?: boolean } = {}) => frame(friesParts(o), ["#fff1c9", "#f6c453"])

// ---------- Onion rings ----------
export function onionRings() {
  const rings = [
    [-150, 420, -15], [-40, 440, 10], [80, 425, -5], [180, 440, 20], [-100, 350, 25], [30, 355, -20], [140, 350, 5], [-30, 280, 15], [90, 285, -10],
  ]
  const p = rings
    .map(([x, y, r]) => `<g transform="rotate(${r} ${CX + x} ${y})"><ellipse cx="${CX + x}" cy="${y}" rx="72" ry="48" fill="none" stroke="#b86b1d" stroke-width="34"/><ellipse cx="${CX + x}" cy="${y}" rx="72" ry="48" fill="none" stroke="#e7a03e" stroke-width="24"/><ellipse cx="${CX + x - 10}" cy="${y - 12}" rx="56" ry="32" fill="none" stroke="#f7cf7d" stroke-width="6" stroke-dasharray="10 14"/></g>`)
    .join("")
  return frame(`<ellipse cx="${CX}" cy="430" rx="300" ry="90" fill="#f4e4c1"/><ellipse cx="${CX}" cy="420" rx="290" ry="80" fill="#fff6e0"/>${p}`, ["#ffe7c2", "#e9a04a"], 520, 300)
}

// ---------- Nuggets ----------
export function nuggets() {
  const blobs = [
    [-160, 420], [-60, 440], [50, 430], [160, 420], [-110, 360], [0, 365], [110, 360], [-50, 300], [60, 300],
  ]
  const p = blobs
    .map(
      ([x, y], i) =>
        `<path transform="rotate(${i * 23} ${CX + x} ${y})" d="M${CX + x - 55} ${y} q-5 -40 40 -42 q50 -6 62 30 q14 40 -30 50 q-60 12 -72 -38z" fill="#c9802c"/><path transform="rotate(${i * 23} ${CX + x} ${y})" d="M${CX + x - 40} ${y - 8} q10 -24 40 -24" stroke="#f0b75e" stroke-width="8" fill="none" stroke-linecap="round"/>` +
        Array.from({ length: 5 }, (_, k) => `<circle cx="${CX + x - 30 + k * 14}" cy="${y + 6 + (k % 2) * 8}" r="3" fill="#9a5a17"/>`).join(""),
    )
    .join("")
  const dip = `<ellipse cx="${CX + 230}" cy="300" rx="60" ry="22" fill="#fff"/><path d="M${CX + 170} 300 v40 q60 30 120 0 v-40" fill="#fafafa"/><ellipse cx="${CX + 230}" cy="302" rx="50" ry="16" fill="#e2483d"/>`
  return frame(`<ellipse cx="${CX - 20}" cy="440" rx="300" ry="90" fill="#f0e2c4"/>${p}${dip}`, ["#fff0d0", "#eba552"], 520, 300)
}

// ---------- Bebidas ----------
function canParts(body: string, band: string, label: string, scale = 1, dx = 0, dy = 0) {
  const x = CX - 90
  const p = `
    <rect x="${x}" y="130" width="180" height="350" rx="26" fill="${body}"/>
    <rect x="${x}" y="230" width="180" height="120" fill="${band}"/>
    <path d="M${x} 250 q90 -40 180 0" stroke="#fff" stroke-width="8" fill="none" opacity=".85"/>
    <text x="${CX}" y="315" font-family="Arial, sans-serif" font-size="${label.length > 5 ? 26 : 34}" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="2">${label}</text>
    <rect x="${x}" y="130" width="180" height="350" rx="26" fill="url(#gloss)"/>
    <rect x="${x + 22}" y="150" width="20" height="310" rx="10" fill="#fff" opacity=".22"/>
    <ellipse cx="${CX}" cy="132" rx="84" ry="16" fill="#cfd3d8"/><ellipse cx="${CX}" cy="128" rx="70" ry="11" fill="#e8eaed"/>
    <rect x="${CX - 22}" y="120" width="44" height="12" rx="6" fill="#aeb4ba"/>
    <ellipse cx="${CX}" cy="478" rx="88" ry="14" fill="#b9bec4"/>`
  return `<g transform="translate(${dx} ${dy}) translate(${CX} 490) scale(${scale}) translate(${-CX} -490)">${p}</g>`
}
export const can = (body: string, band: string, label: string, bg: Bg) => frame(canParts(body, band, label), bg, 490, 120)

export function juice(color: string, light: string, fruit: string) {
  const p = `
    <path d="M${CX - 110} 160 L${CX + 110} 160 L${CX + 85} 480 L${CX - 85} 480z" fill="#ffffff" opacity=".55"/>
    <path d="M${CX - 100} 210 L${CX + 100} 210 L${CX + 80} 470 L${CX - 80} 470z" fill="${color}"/>
    <path d="M${CX - 100} 210 q100 22 200 0" fill="${light}"/>
    <rect x="${CX + 20}" y="70" width="18" height="260" rx="9" fill="#ff5f8f" transform="rotate(14 ${CX + 29} 200)"/>
    <circle cx="${CX - 105}" cy="185" r="58" fill="${fruit}"/><circle cx="${CX - 105}" cy="185" r="46" fill="${light}"/>
    ${Array.from({ length: 8 }, (_, i) => `<line x1="${CX - 105}" y1="185" x2="${CX - 105 + 44 * Math.cos((i * Math.PI) / 4)}" y2="${185 + 44 * Math.sin((i * Math.PI) / 4)}" stroke="${fruit}" stroke-width="4"/>`).join("")}
    <path d="M${CX - 95} 220 L${CX - 75} 460" stroke="#fff" stroke-width="14" opacity=".35"/>
    ${[[30, 300], [-30, 360], [50, 400], [-10, 250]].map(([x, y]) => `<circle cx="${CX + x}" cy="${y}" r="7" fill="#fff" opacity=".5"/>`).join("")}`
  return frame(p, ["#fff4d6", "#f7b267"], 490, 110)
}

export function water() {
  const p = `
    <rect x="${CX - 26}" y="90" width="52" height="40" rx="8" fill="#1e88e5"/>
    <path d="M${CX - 40} 130 h80 l20 50 v290 q0 20 -20 20 h-80 q-20 0 -20 -20 v-290z" fill="#bfe3ff" opacity=".9"/>
    <path d="M${CX - 60} 260 h120 v200 q0 10 -10 10 h-100 q-10 0 -10 -10z" fill="#7cc4ff" opacity=".7"/>
    <rect x="${CX - 60}" y="250" width="120" height="90" fill="#1565c0"/>
    <text x="${CX}" y="305" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#fff" text-anchor="middle">ÁGUA</text>
    <path d="M${CX - 45} 190 v260" stroke="#fff" stroke-width="12" opacity=".5"/>`
  return frame(p, ["#e3f4ff", "#8ecdf8"], 495, 100)
}

export function milkshake(shake: string, top: string) {
  const p = `
    <rect x="${CX + 10}" y="40" width="22" height="200" rx="11" fill="#ef476f" transform="rotate(12 ${CX + 21} 140)"/>
    <path d="M${CX - 105} 200 L${CX + 105} 200 L${CX + 80} 470 L${CX - 80} 470z" fill="${shake}"/>
    <path d="M${CX - 105} 200 L${CX + 105} 200 L${CX + 80} 470 L${CX - 80} 470z" fill="url(#gloss)"/>
    <rect x="${CX - 90}" y="465" width="180" height="18" rx="9" fill="#e8e8e8"/>
    <circle cx="${CX - 60}" cy="185" r="50" fill="${top}"/><circle cx="${CX + 55}" cy="185" r="52" fill="${top}"/><circle cx="${CX}" cy="150" r="62" fill="${top}"/>
    <path d="M${CX - 50} 140 q20 -30 50 -10" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".7"/>
    <circle cx="${CX + 10}" cy="88" r="24" fill="#d62839"/><path d="M${CX + 12} 66 q10 -30 34 -36" stroke="#2d6a4f" stroke-width="5" fill="none"/>
    ${[[-40, 170], [20, 120], [50, 175], [-10, 190]].map(([x, y], i) => `<rect x="${CX + x}" y="${y}" width="14" height="5" rx="2" fill="${["#ffbe0b", "#3a86ff", "#ff006e", "#8338ec"][i]}" transform="rotate(${i * 40} ${CX + x} ${y})"/>`).join("")}`
  return frame(p, ["#ffe3ec", "#f497b6"], 495, 110)
}

export function brownie() {
  const p = `
    <ellipse cx="${CX}" cy="440" rx="250" ry="70" fill="#fff"/><ellipse cx="${CX}" cy="432" rx="230" ry="58" fill="#f3f3f3"/>
    <path d="M${CX - 150} 330 L${CX + 110} 300 L${CX + 170} 360 L${CX - 90} 400z" fill="#6b3b22"/>
    <path d="M${CX - 90} 400 L${CX + 170} 360 L${CX + 170} 420 L${CX - 90} 460z" fill="#4a2615"/>
    <path d="M${CX - 150} 330 L${CX - 90} 400 L${CX - 90} 460 L${CX - 150} 390z" fill="#3a1d10"/>
    ${[[-60, 345], [0, 335], [60, 330], [-20, 370], [40, 360]].map(([x, y]) => `<circle cx="${CX + x}" cy="${y}" r="7" fill="#2b140a"/>`).join("")}
    <circle cx="${CX + 10}" cy="270" r="70" fill="#fff8e7"/><path d="M${CX - 58} 290 q20 20 40 0 t40 0 t40 0" fill="#fff8e7"/>
    <path d="M${CX - 50} 240 q40 -30 90 -10" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M${CX - 40} 220 q30 60 0 110 M${CX + 30} 215 q-20 70 20 120" stroke="#5a2d16" stroke-width="10" fill="none" stroke-linecap="round"/>`
  return frame(p, ["#f7e1cf", "#c98b5e"], 515, 260)
}

export function combo(spec: BurgerSpec, drink: { body: string; band: string; label: string }) {
  const content = friesParts({}, 0.62, 230, -10) + canParts(drink.body, drink.band, drink.label, 0.6, -250, 0) + burgerParts(spec, 0.78, 0, 40)
  return frame(content, ["#ffe2b8", "#ef8f45"], 520, 330)
}
