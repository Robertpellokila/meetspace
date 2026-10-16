// Friendly, consensual two-player cards. No external APIs required.
import { mergeGameContent } from './gameContent.js'
export const TOD_CATEGORIES = [
  { id:'romantic', title:'Romantic', icon:'💕', description:'Sweet moments together' },
  { id:'funny', title:'Funny', icon:'😂', description:'Laugh together' },
  { id:'deep-talk', title:'Deep Talk', icon:'🌙', description:'Meaningful conversations' },
]

const cards = {
  romantic: {
    truth: [
      'Apa hal kecil dariku yang selalu membuatmu tersenyum?',
      'Kapan terakhir kali kamu merasa paling dekat denganku?',
      'Jika kita bisa berkencan sekarang, kamu ingin pergi ke mana?',
      'Lagu apa yang paling mengingatkanmu padaku?',
      'Apa kenangan favorit kita yang ingin kamu ulang?',
      'Apa bentuk perhatian yang paling berarti untukmu?',
      'Hal baru apa yang ingin kamu coba bersama?',
      'Kalimat sederhana apa yang ingin lebih sering kamu dengar?',
    ],
    dare: [
      'Berikan pujian tulus selama 20 detik.',
      'Buat pose hati menggunakan tangan di depan kamera.',
      'Ceritakan rencana kencan impian kita dalam 30 detik.',
      'Pilih lagu yang menggambarkan hubungan kita dan jelaskan alasannya.',
      'Tuliskan pesan manis lima kata di chat.',
      'Tunjukkan benda di dekatmu yang membuatmu ingat pasangan.',
      'Buat nama panggilan lucu dan manis untuk pasangan.',
      'Sebutkan tiga hal yang kamu syukuri dari hubungan ini.',
    ],
  },
  funny: {
    truth: [
      'Apa hal paling konyol yang pernah kamu lakukan saat sendirian?',
      'Jika kamu jadi karakter kartun, siapa yang paling cocok?',
      'Makanan kombinasi aneh apa yang justru kamu suka?',
      'Pernahkah kamu salah kirim chat? Ceritakan versi lucunya.',
      'Apa kebiasaan kecilmu yang paling menggelikan?',
      'Jika kita punya acara TV, apa judulnya?',
      'Kamu lebih takut cicak atau balon meletus? Kenapa?',
      'Apa nama superhero paling absurd yang bisa kamu buat?',
    ],
    dare: [
      'Tirukan suara robot selama 15 detik.',
      'Buat ekspresi wajah paling lucu selama lima detik.',
      'Jelaskan kegiatanmu hari ini dengan gaya pembawa berita.',
      'Buat iklan dramatis untuk benda terdekat.',
      'Nyanyikan satu kalimat dengan suara opera.',
      'Berbicara menggunakan aksen karakter fiksi selama 20 detik.',
      'Buat pantun spontan tentang pasangan.',
      'Lakukan tarian duduk selama 10 detik.',
    ],
  },
  'deep-talk': {
    truth: [
      'Apa hal yang sedang ingin kamu pelajari tentang dirimu?',
      'Kapan kamu merasa paling didengarkan?',
      'Apa mimpi yang belum banyak kamu ceritakan?',
      'Apa arti waktu berkualitas bagimu?',
      'Hal apa yang ingin kamu perbaiki dalam cara berkomunikasi?',
      'Apa kenangan masa kecil yang membuatmu merasa hangat?',
      'Bagaimana kamu ingin didukung saat hari terasa berat?',
      'Apa satu tujuan bersama yang menarik untuk kita rencanakan?',
    ],
    dare: [
      'Berikan satu apresiasi spesifik atas usaha pasangan minggu ini.',
      'Luangkan 30 detik untuk saling mendengarkan tanpa menyela.',
      'Ceritakan satu harapan kecil untuk bulan depan.',
      'Buat satu janji realistis tentang komunikasi yang lebih baik.',
      'Sampaikan satu hal yang ingin kamu tanyakan dengan penuh empati.',
      'Sebutkan dua kekuatan yang kamu lihat pada pasangan.',
      'Ceritakan pengalaman yang mengubah cara pandangmu.',
      'Susun rencana aktivitas sederhana yang bisa dilakukan bersama.',
    ],
  },
}

export const TOD_CARD_BANK = Object.fromEntries(
  Object.entries(cards).map(([category, modes]) => [category,
    Object.fromEntries(Object.entries(modes).map(([kind, texts]) => [kind,
      texts.map((text, i) => ({ id:`${category}-${kind}-${i + 1}`, text, category, kind }))
    ]))
  ])
)
export function getTodCard(category, kind, index) {
  const list = getTodCards(category, kind)
  return Number.isSafeInteger(index) && index >= 0 && list.length ? list[index % list.length] : null
}
export function getTodCardCount(category, kind) {
  return getTodCards(category, kind).length
}
export function getTodCards(category, kind) {
  return mergeGameContent('truth-or-dare', category, TOD_CARD_BANK[category]?.[kind] || [], kind)
}
