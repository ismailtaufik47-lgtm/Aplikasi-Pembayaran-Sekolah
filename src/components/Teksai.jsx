/**
 * Menampilkan jawaban AI yang berformat markdown sederhana:
 * paragraf, **tebal**, *miring*, daftar (- / 1.), dan tabel (| a | b |).
 *
 * Sengaja ditulis sendiri (bukan pustaka markdown) supaya ringan dan
 * AMAN: semua teks dirender sebagai teks biasa oleh React, tidak ada
 * HTML dari AI yang ikut dijalankan.
 */

/** **tebal** dan *miring* di dalam satu baris. */
function Inline({ teks }) {
  const bagian = []
  const pola = /(\*\*[^*]+\*\*|(?<![\w*])\*[^*\s][^*]*\*(?![\w*]))/g
  let akhir = 0
  let m
  while ((m = pola.exec(teks))) {
    if (m.index > akhir) bagian.push(teks.slice(akhir, m.index))
    const t = m[0]
    bagian.push(
      t.startsWith('**')
        ? <b key={m.index} className="font-extrabold">{t.slice(2, -2)}</b>
        : <i key={m.index}>{t.slice(1, -1)}</i>
    )
    akhir = m.index + t.length
  }
  if (akhir < teks.length) bagian.push(teks.slice(akhir))
  return bagian
}

const selTabel = (baris) =>
  baris.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

const barisPemisah = (baris) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(baris)

/** Kolom angka/rupiah rata kanan supaya mudah dibandingkan. */
const angka = (c) => /^(Rp\s?)?-?[\d.,]+(\s?(bulan|siswa|%))?$/i.test(c.replace(/\*\*/g, ''))

function Tabel({ baris }) {
  const isi = baris.filter((b) => !barisPemisah(b)).map(selTabel)
  const [kepala, ...badan] = isi
  const kanan = kepala.map((_, j) => badan.length > 0 && badan.every((r) => !r[j] || angka(r[j])))
  return (
    <div className="my-2 overflow-x-auto rounded-[14px] border border-line">
      <table className="w-full border-collapse text-[12.5px] sm:text-[13px]">
        <thead>
          <tr className="bg-[#F5F6FA]">
            {kepala.map((c, j) => (
              <th key={j} className={`px-2 py-2 font-extrabold sm:px-3 ${kanan[j] ? 'text-right' : 'text-left'}`}>
                <Inline teks={c} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {badan.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {kepala.map((_, j) => (
                <td key={j} className={`px-2 py-2 align-top font-semibold sm:px-3 ${kanan[j] ? 'whitespace-nowrap text-right tabular-nums' : 'min-w-[56px]'}`}>
                  <Inline teks={r[j] || ''} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function TeksAI({ teks }) {
  const baris = String(teks || '').replace(/\r/g, '').split('\n')
  const blok = []
  let i = 0
  while (i < baris.length) {
    const b = baris[i]
    if (!b.trim()) { i++; continue }

    if (b.trim().startsWith('|')) {
      const kumpul = []
      while (i < baris.length && baris[i].trim().startsWith('|')) kumpul.push(baris[i++])
      blok.push(<Tabel key={blok.length} baris={kumpul} />)
      continue
    }

    const butir = /^\s*[-*•]\s+/
    const nomor = /^\s*\d+[.)]\s+/
    if (butir.test(b) || nomor.test(b)) {
      const urut = nomor.test(b)
      const pola = urut ? nomor : butir
      const kumpul = []
      while (i < baris.length && pola.test(baris[i])) kumpul.push(baris[i++].replace(pola, ''))
      const Tag = urut ? 'ol' : 'ul'
      blok.push(
        <Tag key={blok.length} className={`my-1.5 space-y-1 pl-5 ${urut ? 'list-decimal' : 'list-disc'}`}>
          {kumpul.map((k, j) => <li key={j}><Inline teks={k} /></li>)}
        </Tag>
      )
      continue
    }

    // paragraf: kumpulkan baris biasa berturut-turut
    const kumpul = []
    while (i < baris.length && baris[i].trim() && !baris[i].trim().startsWith('|') && !butir.test(baris[i]) && !nomor.test(baris[i])) {
      // judul markdown (### ...) cukup ditampilkan tebal
      kumpul.push(baris[i++].replace(/^#{1,6}\s+(.*)$/, '**$1**'))
    }
    blok.push(
      <p key={blok.length} className="my-1.5">
        {kumpul.map((k, j) => <span key={j}>{j > 0 && <br />}<Inline teks={k} /></span>)}
      </p>
    )
  }
  return <div className="text-[14px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{blok}</div>
}