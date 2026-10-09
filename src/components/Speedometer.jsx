/**
 * Speedometer "Kesehatan keuangan" bergaya timbul (3D lembut): tiga zona
 * (Perlu perhatian · Waspada · Sehat) dengan ikon di tiap zona — jadi tidak
 * hanya mengandalkan warna — dan jarum yang berayun ke skor saat muncul.
 * skor null → jarum di tengah, abu-abu (belum bisa dinilai).
 */
const CX = 150
const CY = 150
const R = 112

const titik = (f, r = R) => {
  const a = ((180 - f * 180) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}
const busur = (a, b) => {
  const [x1, y1] = titik(a)
  const [x2, y2] = titik(b)
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
}
const ZONA = [
  { a: 0, b: 0.395, isi: '#FF7A6B', sisi: '#D2493C' },
  { a: 0.405, b: 0.695, isi: '#FFC94D', sisi: '#D99A1E' },
  { a: 0.705, b: 1, isi: '#3DD07F', sisi: '#1E9A57' },
]

export default function Speedometer({ skor, className = '' }) {
  const ada = skor != null
  const sudut = ada ? (Math.max(0, Math.min(100, skor)) / 100) * 180 - 90 : 0
  const [xm, ym] = titik(0.2)
  const [xk, yk] = titik(0.55)
  const [xh, yh] = titik(0.85)
  return (
    <svg viewBox="0 0 300 180" className={className} role="img" aria-label={ada ? `Skor kesehatan ${skor} dari 100` : 'Skor belum bisa dihitung'}>
      <defs>
        <radialGradient id="meter-hub" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#5A6BA8" />
          <stop offset="1" stopColor="#1B2559" />
        </radialGradient>
      </defs>
      <ellipse cx="150" cy="171" rx="124" ry="7" className="fill-[rgba(30,64,140,.10)] dark:fill-[rgba(0,0,0,.35)]" />
      <g transform="translate(0 7)" fill="none" strokeWidth="34">
        {ZONA.map((z) => <path key={z.a} d={busur(z.a, z.b)} stroke={ada ? z.sisi : '#AEB6C8'} />)}
      </g>
      <g fill="none" strokeWidth="34">
        {ZONA.map((z) => <path key={z.a} d={busur(z.a, z.b)} stroke={ada ? z.isi : '#D5DBE7'} />)}
      </g>
      <path d="M 26 150 A 124 124 0 0 1 274 150" fill="none" stroke="#FFFFFF" strokeWidth="3" opacity=".45" />
      {/* ikon zona: ✕ · ! · ✓ */}
      <g transform={`translate(${xm.toFixed(1)} ${ym.toFixed(1)})`}>
        <circle r="11.5" fill="#FFFFFF" />
        <path d="M -4 -4 L 4 4 M 4 -4 L -4 4" stroke="#B42318" strokeWidth="2.8" strokeLinecap="round" />
      </g>
      <g transform={`translate(${xk.toFixed(1)} ${yk.toFixed(1)})`}>
        <circle r="11.5" fill="#FFFFFF" />
        <path d="M 0 -5 V 1 M 0 5 V 5.1" stroke="#8A5A08" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform={`translate(${xh.toFixed(1)} ${yh.toFixed(1)})`}>
        <circle r="11.5" fill="#FFFFFF" />
        <path d="M -5 0.5 L -1.5 4 L 5 -3.5" fill="none" stroke="#166C3A" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M 72 150 A 78 78 0 0 1 228 150 Z" className="fill-[#F2F6FC] stroke-[#E1E8F4] dark:fill-[#1E2A47] dark:stroke-white/10" strokeWidth="2" />
      <g className="jarum-meter" style={{ '--sudut': `${sudut}deg` }}>
        <path d="M 143.5 150 L 150 64 L 156.5 150 Z" fill={ada ? '#1B2559' : '#8A93A6'} className={ada ? 'dark:fill-[#E7ECF8]' : ''} />
      </g>
      <circle cx="150" cy="150" r="17" fill="url(#meter-hub)" />
      <circle cx="145" cy="145" r="5" fill="#FFFFFF" opacity=".5" />
    </svg>
  )
}
