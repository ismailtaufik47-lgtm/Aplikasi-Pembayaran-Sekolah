/**
 * Ilustrasi layar masuk, aktivasi, dan cek kuitansi — semua SVG buatan
 * sendiri (bukan gambar dari internet), jadi tajam di semua ukuran layar
 * dan ringan dimuat. Warna yang berubah di mode gelap memakai kelas
 * `dark:` Tailwind atau aturan di index.css (bagian "layar masuk").
 */

const KULIT = '#FAD3AE'
const KULIT_GELAP = '#EDB48A'

/* ---------------- langit ---------------- */

export function Matahari({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <rect key={i} x="47" y="3" width="6" height="15" rx="3" fill="#FFC93C" transform={`rotate(${i * 30} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="29" fill="#FFD84D" stroke="#FFC93C" strokeWidth="3" />
      <path d="M38 47 q4.5 -5 9 0 M53 47 q4.5 -5 9 0" stroke="#8A5211" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <ellipse cx="35" cy="57" rx="5" ry="3.2" fill="#FF9E7A" opacity=".7" />
      <ellipse cx="65" cy="57" rx="5" ry="3.2" fill="#FF9E7A" opacity=".7" />
      <path d="M42 58 q8 8 16 0" stroke="#8A5211" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function Bulan({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="40" fill="#FFE9A8" opacity=".12" />
      <path d="M58 18 a32 32 0 1 0 22 52 a26 26 0 1 1 -22 -52 z" fill="#FFE9A8" />
      <circle cx="44" cy="46" r="3.2" fill="#F2D27A" />
      <circle cx="38" cy="62" r="2.2" fill="#F2D27A" />
    </svg>
  )
}

const bintang = (x, y, s) =>
  `M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} ` +
  `Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z`

/** Taburan bintang kecil untuk langit malam (mode gelap). */
export function Bintang({ className = '' }) {
  const titik = [[250, 40, 5, 0.9], [300, 70, 3.5, 0.7], [340, 30, 4, 0.8], [210, 90, 3, 0.6], [360, 110, 3, 0.7],
    [120, 60, 3, 0.6], [60, 150, 2.5, 0.5], [330, 160, 2.5, 0.5], [150, 20, 2.5, 0.6], [30, 90, 2, 0.5]]
  return (
    <svg className={className} viewBox="0 0 390 200" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      {titik.map(([x, y, s, o], i) => <path key={i} d={bintang(x, y, s)} fill="#FFF3C4" opacity={o} />)}
    </svg>
  )
}

export function Pelangi({ className = '', awanKiri = false }) {
  const warna = ['#FF8F8F', '#FFB86B', '#FFE27A', '#9FDC8E', '#8FD0FF', '#B9A2FF']
  return (
    <svg className={className} viewBox="0 0 200 112" aria-hidden="true" style={{ overflow: 'visible' }}>
      {warna.map((c, i) => {
        const r = 94 - i * 9
        return <path key={c} d={`M${100 - r} 106 A${r} ${r} 0 0 1 ${100 + r} 106`} stroke={c} strokeWidth="9.5" fill="none" />
      })}
      <g fill="#FFFFFF">
        {awanKiri && (
          <>
            <ellipse cx="14" cy="104" rx="20" ry="10" /><circle cx="26" cy="96" r="12" /><circle cx="6" cy="98" r="9" />
          </>
        )}
        <ellipse cx="186" cy="104" rx="20" ry="10" /><circle cx="176" cy="95" r="12" /><circle cx="195" cy="98" r="9" />
      </g>
    </svg>
  )
}

export function Awan({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 120 56" aria-hidden="true">
      <g fill="#FFFFFF">
        <circle cx="36" cy="32" r="18" /><circle cx="62" cy="22" r="22" /><circle cx="88" cy="32" r="16" />
        <rect x="18" y="30" width="86" height="22" rx="11" />
      </g>
    </svg>
  )
}

/* ---------------- tanah ---------------- */

/** Dua lapis bukit hijau; direntangkan penuh (preserveAspectRatio none). */
export function Bukit({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 390 150" preserveAspectRatio="none" aria-hidden="true">
      <path className="fill-[#B9E6A0] dark:fill-[#1E4B3C]" d="M0 60 C80 18 160 30 220 50 C280 69 340 39 390 30 L390 150 L0 150 Z" />
      <path className="fill-[#8ED373] dark:fill-[#27604A]" d="M0 99 C90 69 170 78 240 93 C300 107 350 87 390 78 L390 150 L0 150 Z" />
    </svg>
  )
}

export function BukitLebar({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden="true">
      <path className="fill-[#B9E6A0] dark:fill-[#1E4B3C]" d="M0 130 C200 40 420 60 620 110 C820 160 1000 70 1200 80 C1320 86 1400 110 1440 120 L1440 300 L0 300 Z" />
      <path className="fill-[#8ED373] dark:fill-[#27604A]" d="M0 200 C220 150 420 160 640 190 C860 220 1060 170 1260 175 C1360 178 1420 190 1440 196 L1440 300 L0 300 Z" />
    </svg>
  )
}

export function Pohon({ className = '', varian = 0 }) {
  const [a, b, c] = varian ? ['#67BF6B', '#5AB25E', '#78CB7B'] : ['#6CC070', '#58B25E', '#86D07F']
  return (
    <svg className={className} viewBox="0 0 60 80" aria-hidden="true">
      <rect x="27" y="46" width="7" height="32" rx="3" fill="#9A6B45" />
      <circle cx="30" cy="30" r="22" fill={a} /><circle cx="15" cy="42" r="13" fill={b} />
      <circle cx="45" cy="42" r="13" fill={c} /><circle cx="30" cy="16" r="12" fill={c} />
    </svg>
  )
}

export function Bunga({ className = '', warna = '#FF9CC2' }) {
  return (
    <svg className={className} viewBox="0 0 20 26" aria-hidden="true">
      <path d="M10 12 V25" stroke="#4FA85A" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 20 q-5 -1 -6 -5 q5 0 6 5" fill="#6CC070" />
      {Array.from({ length: 5 }).map((_, i) => (
        <circle key={i} cx="10" cy="5" r="3.6" fill={warna} transform={`rotate(${i * 72} 10 9.5)`} />
      ))}
      <circle cx="10" cy="9.5" r="3" fill="#FFD84D" />
    </svg>
  )
}

/* ---------------- hiasan pojok ---------------- */

export function BukuPensil({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 84 60" aria-hidden="true" style={{ overflow: 'visible' }}>
      <g transform="rotate(-3 30 48)">
        <rect x="2" y="42" width="54" height="12" rx="3" fill="#3B82F6" /><rect x="6" y="45" width="46" height="2.4" rx="1.2" fill="#DCEBFF" />
      </g>
      <rect x="7" y="31" width="46" height="12" rx="3" fill="#EF6B6B" /><rect x="11" y="34" width="38" height="2.4" rx="1.2" fill="#FFE1E1" />
      <g transform="rotate(4 30 26)">
        <rect x="4" y="20" width="48" height="11" rx="3" fill="#45C07A" /><rect x="8" y="23" width="40" height="2.2" rx="1.1" fill="#DFF7E8" />
      </g>
      <g transform="rotate(-8 64 30)">
        <rect x="62" y="8" width="5" height="30" rx="1.5" fill="#3B6EF6" /><path d="M60.6 8.4 l2.8 -6 l2.2 6.3 z" fill="#F7D4A5" />
      </g>
      <rect x="69" y="4" width="5" height="32" rx="1.5" fill="#EC4899" /><path d="M69 4 l2.5 -5.5 l2.5 5.5 z" fill="#F7D4A5" />
      <g transform="rotate(9 77 30)">
        <rect x="75" y="10" width="5" height="28" rx="1.5" fill="#F5A524" /><path d="M75 10 l2.5 -5.5 l2.5 5.5 z" fill="#F7D4A5" />
      </g>
      <rect x="58" y="28" width="26" height="28" rx="6" fill="#FFB547" /><rect x="58" y="28" width="26" height="6" rx="3" fill="#F09A1E" />
    </svg>
  )
}

const TITIK_BINTANG = (() => {
  const t = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? 26 : 13.5
    t.push(`${(30 + r * Math.cos(a)).toFixed(1)},${(33 + r * Math.sin(a)).toFixed(1)}`)
  }
  return t.join(' ')
})()

export function BintangWajah({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 60 60" aria-hidden="true">
      <polygon points={TITIK_BINTANG} fill="#FFD84A" stroke="#F6B81C" strokeWidth="4.5" strokeLinejoin="round" />
      <circle cx="25" cy="32" r="2.4" fill="#3A2A12" /><circle cx="35" cy="32" r="2.4" fill="#3A2A12" />
      <circle cx="25.8" cy="31.2" r=".8" fill="#fff" /><circle cx="35.8" cy="31.2" r=".8" fill="#fff" />
      <ellipse cx="20.5" cy="37" rx="3" ry="2" fill="#FF9E7A" opacity=".75" />
      <ellipse cx="39.5" cy="37" rx="3" ry="2" fill="#FF9E7A" opacity=".75" />
      <path d="M26.5 37.5 q3.5 3.6 7 0" stroke="#3A2A12" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/* ---------------- gedung TK ---------------- */

export function GedungTK({ className = '', style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 240 170" aria-hidden="true">
      <ellipse cx="120" cy="150" rx="118" ry="17" fill="#A8DE8C" />
      <ellipse cx="124" cy="156" rx="100" ry="12" fill="#8ED373" />
      <rect x="27" y="112" width="6" height="32" rx="2" fill="#9A6B45" />
      <circle cx="30" cy="100" r="20" fill="#67BF6B" /><circle cx="18" cy="112" r="13" fill="#5AB25E" /><circle cx="42" cy="110" r="13" fill="#78CB7B" />
      <rect x="207" y="108" width="6" height="36" rx="2" fill="#9A6B45" />
      <circle cx="210" cy="95" r="21" fill="#67BF6B" /><circle cx="223" cy="108" r="13" fill="#5AB25E" /><circle cx="197" cy="106" r="12" fill="#78CB7B" />
      <rect x="58" y="92" width="124" height="54" rx="3" fill="#FFF3DE" />
      <path d="M50 95 L120 66 L190 95 Z" fill="#F2825A" />
      <rect x="50" y="93" width="140" height="5" rx="2" fill="#E0663F" />
      {[66, 84, 146, 164].map((x) => (
        <g key={x}>
          <rect x={x} y="106" width="12" height="14" rx="2" fill="#7CC4F0" stroke="#fff" strokeWidth="2" />
          <path d={`M${x + 6} 106 v14 M${x} 113 h12`} stroke="#fff" strokeWidth="1.2" />
        </g>
      ))}
      <rect x="102" y="58" width="36" height="88" rx="2" fill="#FFE7C0" />
      <path d="M96 61 L120 38 L144 61 Z" fill="#E8683F" />
      <rect x="106" y="66" width="28" height="17" rx="4" fill="#fff" stroke="#E8683F" strokeWidth="2" />
      <text x="120" y="79" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="12" fill="#E8683F">TK</text>
      <line x1="120" y1="38" x2="120" y2="14" stroke="#8D95A5" strokeWidth="1.6" />
      <rect x="120" y="14" width="15" height="5" fill="#E53935" />
      <rect x="120" y="19" width="15" height="5" fill="#fff" stroke="#E6E6E6" strokeWidth=".5" />
      <path d="M110 146 V122 a10 10 0 0 1 20 0 V146 Z" fill="#4C8FDB" />
      <path d="M120 112 V146" stroke="#3A77BF" strokeWidth="1.4" />
      <rect x="104" y="144" width="32" height="4" rx="1.5" fill="#E9D6B8" />
      <circle cx="66" cy="146" r="8" fill="#6FC572" /><circle cx="78" cy="148" r="7" fill="#5AB25E" />
      <circle cx="162" cy="148" r="7" fill="#5AB25E" /><circle cx="174" cy="146" r="8" fill="#6FC572" />
      <path d="M112 148 L128 148 L136 166 Q120 169 104 166 Z" fill="#F1E3C8" />
    </svg>
  )
}

/* ---------------- anak-anak melambai ---------------- */

function Wajah({ cx = 60, alis = '#5B3A24', buluMata = false }) {
  return (
    <>
      <path d={`M${cx - 16} 56.5 q5 -3.2 10 0 M${cx + 6} 56.5 q5 -3.2 10 0`} stroke={alis} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx={cx - 11} cy="66" rx="4.3" ry="5.3" fill="#2B2340" /><circle cx={cx - 9.4} cy="63.9" r="1.7" fill="#fff" />
      <ellipse cx={cx + 11} cy="66" rx="4.3" ry="5.3" fill="#2B2340" /><circle cx={cx + 12.6} cy="63.9" r="1.7" fill="#fff" />
      <ellipse cx={cx - 18} cy="76" rx="5.4" ry="3.3" fill="#FF8E8E" opacity=".5" />
      <ellipse cx={cx + 18} cy="76" rx="5.4" ry="3.3" fill="#FF8E8E" opacity=".5" />
      <path d={`M${cx - 1.6} 71 q1.6 1.7 3.2 0`} stroke="#D99670" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d={`M${cx - 8} 75.5 Q${cx} 87 ${cx + 8} 75.5 Z`} fill="#A8392B" />
      <path d={`M${cx - 4.6} 80.6 Q${cx} 86 ${cx + 4.6} 80.6 Q${cx} 78.8 ${cx - 4.6} 80.6 Z`} fill="#FF8C7A" />
      {buluMata && (
        <path d={`M${cx - 15.2} 62.6 l-2.6 -1.8 M${cx + 15.2} 62.6 l2.6 -1.8`} stroke="#2B2340" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </>
  )
}

function TanganLambai({ sisi, lengan, garis }) {
  const kiri = sisi === 'kiri'
  const g = (d) => d // koordinat sudah disiapkan untuk tiap sisi
  return kiri ? (
    <>
      <path d={g('M37 113 C29 103 23 95 19 85')} stroke={garis} strokeWidth="17" strokeLinecap="round" fill="none" />
      <path d={g('M37 113 C29 103 23 95 19 85')} stroke={lengan} strokeWidth="14" strokeLinecap="round" fill="none" />
      <path d="M19 85 L13.5 71" stroke={KULIT} strokeWidth="10" strokeLinecap="round" />
      <circle cx="12.5" cy="64" r="8.6" fill={KULIT} />
      <path d="M8 58 l-1.4 -4.4 M12.4 56 l-.2 -5 M16.6 57.2 l1.4 -4.3" stroke={KULIT} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M1 54 q-4.5 6.5 -.4 13.4 M24.5 49 q4.2 5 1.4 11" stroke="#FFFFFF" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </>
  ) : (
    <>
      <path d="M83 113 C91 103 97 95 101 85" stroke={garis} strokeWidth="17" strokeLinecap="round" fill="none" />
      <path d="M83 113 C91 103 97 95 101 85" stroke={lengan} strokeWidth="14" strokeLinecap="round" fill="none" />
      <path d="M101 85 L106.5 71" stroke={KULIT} strokeWidth="10" strokeLinecap="round" />
      <circle cx="107.5" cy="64" r="8.6" fill={KULIT} />
      <path d="M112 58 l1.4 -4.4 M107.6 56 l.2 -5 M103.4 57.2 l-1.4 -4.3" stroke={KULIT} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M119 54 q4.5 6.5 .4 13.4 M95.5 49 q-4.2 5 -1.4 11" stroke="#FFFFFF" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </>
  )
}

export function AnakLaki({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 120 140" aria-hidden="true" style={{ overflow: 'visible' }}>
      <TanganLambai sisi="kiri" lengan="#FFFFFF" garis="#D3DDF0" />
      <path d="M25 140 C25 115 38 102 60 102 C82 102 95 115 95 140 Z" fill="#FFFFFF" stroke="#D3DDF0" strokeWidth="1.6" />
      <path d="M41 106 C38 118 38 130 40 140 M79 106 C82 118 82 130 80 140" stroke="#3B6EF6" strokeWidth="7.5" fill="none" strokeLinecap="round" />
      <path d="M50 103.5 L60 113 L70 103.5" fill="#E6EEFB" stroke="#C9D6EE" strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="53" y="90" width="14" height="15" rx="6" fill={KULIT_GELAP} />
      <circle cx="30.5" cy="66" r="7" fill={KULIT} /><circle cx="89.5" cy="66" r="7" fill={KULIT} />
      <circle cx="30.5" cy="66" r="3.4" fill={KULIT_GELAP} /><circle cx="89.5" cy="66" r="3.4" fill={KULIT_GELAP} />
      <circle cx="60" cy="62" r="30" fill={KULIT} />
      <path d="M29.5 63 C26 38 42 25.5 60 25.5 C80 25.5 95 38 90.5 63 C88 54 84 48.5 78 45.5 C73.5 51.5 63 53.5 53.5 50 C47.5 53.5 40 55.5 34 54.5 C32 57 30.5 60 29.5 63 Z" fill="#5B3A24" />
      <path d="M55 28.5 C56.5 20 64 16.5 70.5 20.5 C66 21.8 63 25 62 29.5 Z" fill="#5B3A24" />
      <Wajah />
    </svg>
  )
}

export function AnakPerempuan({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 120 140" aria-hidden="true" style={{ overflow: 'visible' }}>
      <TanganLambai sisi="kanan" lengan="#FF9CC2" garis="#F07AA8" />
      <path d="M25 140 C25 115 38 102 60 102 C82 102 95 115 95 140 Z" fill="#FF9CC2" />
      <path d="M41 112 C38 122 38 132 40 140 M79 112 C82 122 82 132 80 140" stroke="#8B5CF6" strokeWidth="7.5" fill="none" strokeLinecap="round" />
      <path d="M60 21 C86 21 98 42 97 66 C96 86 95 100 101 115 C89 122 74 125 60 125 C46 125 31 122 19 115 C25 100 24 86 23 66 C22 42 34 21 60 21 Z" fill="#FFCD3C" />
      <path d="M34 101 C43 112 51 116.5 60 116.5 C69 116.5 77 112 86 101" stroke="#F2B21F" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M28 60 C30 40 44 30 60 30" stroke="#FFE08A" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".8" />
      <ellipse cx="60" cy="67" rx="24.5" ry="27.5" fill="#FFF3CC" />
      <ellipse cx="60" cy="68.5" rx="22" ry="24.5" fill={KULIT} />
      <circle cx="60" cy="113" r="3.2" fill="#FF7AA8" />
      <Wajah alis="#6B4A2E" buluMata />
    </svg>
  )
}
