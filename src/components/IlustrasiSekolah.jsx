/**
 * Ilustrasi gedung TK dengan pepohonan — SVG buatan sendiri (tanpa
 * gambar dari internet), jadi tetap tajam di semua ukuran layar dan
 * ringan dimuat. Warnanya sedikit diredupkan di mode gelap (index.css).
 * Dipakai di beranda portal orang tua & beranda panel sekolah.
 */
export default function IlustrasiSekolah({ className = '' }) {
  return (
    <svg className={`ilustrasi-sekolah pointer-events-none select-none ${className}`} viewBox="0 0 240 170" aria-hidden="true">
      {/* awan */}
      <g className="awan" fill="#fff">
        <ellipse cx="46" cy="34" rx="20" ry="8" />
        <ellipse cx="58" cy="28" rx="13" ry="10" />
        <ellipse cx="190" cy="22" rx="16" ry="6.5" />
        <ellipse cx="200" cy="17" rx="10" ry="8" />
      </g>
      {/* tanah (elips — ujungnya membulat, tidak terpotong kotak) */}
      <ellipse cx="120" cy="150" rx="118" ry="17" fill="#CDEBB5" />
      <ellipse cx="124" cy="156" rx="100" ry="12" fill="#B3E09A" />
      {/* pohon belakang */}
      <rect x="27" y="112" width="6" height="32" rx="2" fill="#9A6B45" />
      <circle cx="30" cy="100" r="20" fill="#67BF6B" />
      <circle cx="18" cy="112" r="13" fill="#5AB25E" />
      <circle cx="42" cy="110" r="13" fill="#78CB7B" />
      <rect x="207" y="108" width="6" height="36" rx="2" fill="#9A6B45" />
      <circle cx="210" cy="95" r="21" fill="#67BF6B" />
      <circle cx="223" cy="108" r="13" fill="#5AB25E" />
      <circle cx="197" cy="106" r="12" fill="#78CB7B" />
      {/* gedung sayap */}
      <rect x="58" y="92" width="124" height="54" rx="3" fill="#FFF3DE" />
      <path d="M50 95 L120 66 L190 95 Z" fill="#F2825A" />
      <rect x="50" y="93" width="140" height="5" rx="2" fill="#E0663F" />
      {/* jendela sayap */}
      {[66, 84, 146, 164].map((x) => (
        <g key={x}>
          <rect x={x} y="106" width="12" height="14" rx="2" fill="#7CC4F0" stroke="#fff" strokeWidth="2" />
          <path d={`M${x + 6} 106 v14 M${x} 113 h12`} stroke="#fff" strokeWidth="1.2" />
        </g>
      ))}
      {/* menara tengah */}
      <rect x="102" y="58" width="36" height="88" rx="2" fill="#FFE7C0" />
      <path d="M96 61 L120 38 L144 61 Z" fill="#E8683F" />
      <circle cx="120" cy="74" r="8" fill="#fff" stroke="#E8683F" strokeWidth="2.2" />
      <path d="M120 70 v4.5 l3 2" stroke="#E8683F" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* bendera */}
      <line x1="120" y1="38" x2="120" y2="14" stroke="#8D95A5" strokeWidth="1.6" />
      <rect x="120" y="14" width="15" height="5" fill="#E53935" />
      <rect x="120" y="19" width="15" height="5" fill="#fff" stroke="#E6E6E6" strokeWidth=".5" />
      {/* pintu */}
      <path d="M110 146 V122 a10 10 0 0 1 20 0 V146 Z" fill="#4C8FDB" />
      <path d="M120 112 V146" stroke="#3A77BF" strokeWidth="1.4" />
      <rect x="104" y="144" width="32" height="4" rx="1.5" fill="#E9D6B8" />
      {/* semak */}
      <circle cx="66" cy="146" r="8" fill="#6FC572" />
      <circle cx="78" cy="148" r="7" fill="#5AB25E" />
      <circle cx="162" cy="148" r="7" fill="#5AB25E" />
      <circle cx="174" cy="146" r="8" fill="#6FC572" />
      {/* jalan */}
      <path d="M112 148 L128 148 L136 166 Q120 169 104 166 Z" fill="#F1E3C8" />
    </svg>
  )
}
