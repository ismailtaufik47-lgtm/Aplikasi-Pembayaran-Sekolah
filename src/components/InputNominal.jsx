/**
 * Input angka yang menampilkan titik ribuan saat diketik (100.000),
 * tapi nilainya tetap angka murni untuk dipakai kode lain (100000).
 *
 * Dipakai di semua tempat yang minta nominal rupiah: form biaya, form
 * SPP, form catat pembayaran — supaya guru bisa langsung membaca angka
 * besar tanpa menghitung nolnya satu-satu.
 */
const formatRibuan = (angka) => {
  const bersih = String(angka).replace(/\D/g, '')
  if (!bersih) return ''
  return Number(bersih).toLocaleString('id-ID')
}

export default function InputNominal({ value, onChange, placeholder, className = '', ...props }) {
  const tampil = formatRibuan(value)

  const ubah = (e) => {
    const angka = e.target.value.replace(/\D/g, '')
    onChange(angka ? Number(angka) : '')
  }

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] font-bold text-muted">
        Rp
      </span>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        value={tampil}
        onChange={ubah}
        placeholder={placeholder}
        className="field-input pl-9"
      />
    </div>
  )
}
