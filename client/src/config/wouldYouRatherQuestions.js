import { mergeGameContent } from './gameContent.js'
export const WYR_CATEGORIES = [
  { id: 'romantic', title: 'Romantic', icon: '💕', description: 'Pilihan tentang cinta dan kebersamaan' },
  { id: 'funny', title: 'Funny', icon: '😂', description: 'Pilihan absurd dan seru' },
  { id: 'deep', title: 'Deep Talk', icon: '🌙', description: 'Percakapan yang lebih bermakna' },
]

const BANK = {
  romantic: [
    ['Kencan impian untuk akhir pekan?', 'Piknik saat matahari terbenam', 'Movie night di rumah'],
    ['Hadiah kejutan yang paling berkesan?', 'Surat tulisan tangan', 'Album foto kenangan'],
    ['Liburan romantis pilihanmu?', 'Kabin di pegunungan', 'Vila dekat pantai'],
    ['Cara menunjukkan rasa sayang?', 'Memasak makanan favorit', 'Menyiapkan kejutan kecil'],
    ['Saat LDR lebih suka?', 'Video call panjang', 'Pesan suara manis sepanjang hari'],
    ['Momen yang ingin diulang?', 'Kencan pertama', 'Perjalanan pertama bersama'],
    ['Kegiatan hari Minggu?', 'Sarapan santai bersama', 'Jalan pagi bersama'],
    ['Merayakan ulang tahun hubungan?', 'Dinner berdua', 'Staycation santai'],
    ['Foto kenangan pilihanmu?', 'Foto candid lucu', 'Foto formal berdua'],
    ['Ketika rindu pasangan?', 'Mendengar playlist bersama', 'Menonton film yang sama'],
  ],
  funny: [
    ['Punya kekuatan konyol?', 'Bisa bicara dengan kucing', 'Bisa teleport hanya 2 meter'],
    ['Tantangan selama sehari?', 'Berbicara seperti robot', 'Berjalan seperti penguin'],
    ['Makanan unik yang harus dicoba?', 'Pizza rasa permen', 'Es krim rasa sambal'],
    ['Terjebak di situasi mana?', 'Lift dengan 20 badut', 'Bus penuh penyanyi karaoke'],
    ['Nama panggilan paling lucu?', 'Kapten Kentang', 'Raja/Ratu Kerupuk'],
    ['Liburan absurd?', 'Hotel berbentuk nanas', 'Kapal berbentuk bebek'],
    ['Hewan peliharaan imajiner?', 'Naga ukuran hamster', 'Hamster ukuran kuda'],
    ['Alarm bangun pagi?', 'Suara ayam beatbox', 'Suara kamu sendiri bernyanyi'],
    ['Hanya boleh memakai satu aksesori?', 'Topi dinosaurus', 'Kacamata berbentuk hati'],
    ['Acara TV yang kamu ikuti?', 'Kompetisi tertawa', 'Kompetisi makan mi tanpa tangan'],
  ],
  deep: [
    ['Untuk masa depan, lebih penting?', 'Kebebasan memilih', 'Rasa aman dan stabil'],
    ['Lebih ingin dikenang sebagai?', 'Orang yang berani mencoba', 'Orang yang selalu membantu'],
    ['Jika bisa mengubah satu hal?', 'Keputusan di masa lalu', 'Satu kebiasaan saat ini'],
    ['Saat menghadapi masalah?', 'Diberi waktu menyendiri', 'Ditemani untuk bercerita'],
    ['Hal yang ingin dibangun bersama?', 'Petualangan dan pengalaman', 'Rumah dan rutinitas hangat'],
    ['Kamu lebih menghargai?', 'Kejujuran yang sulit', 'Kelembutan saat berbicara'],
    ['Pencapaian impianmu?', 'Menguasai keahlian baru', 'Membantu banyak orang'],
    ['Jika punya satu tahun bebas?', 'Keliling dunia', 'Membangun proyek bermakna'],
    ['Saat ada perbedaan pendapat?', 'Diskusi sampai tuntas', 'Istirahat lalu kembali bicara'],
    ['Menentukan prioritas bersama?', 'Waktu berkualitas', 'Tujuan jangka panjang'],
  ],
}

export const WYR_QUESTION_BANK = Object.fromEntries(
  Object.entries(BANK).map(([category, questions]) => [
    category,
    questions.map(([text, optionA, optionB], index) => ({
      id: `${category}-${index + 1}`,
      category,
      text,
      options: [optionA, optionB],
    })),
  ])
)

export function getWyrQuestion(category, index) {
  const questions = getWyrQuestions(category)
  if (!questions?.length || !Number.isSafeInteger(index) || index < 0) return null
  return questions[index % questions.length]
}
export function getWyrQuestions(category) {
  return mergeGameContent('would-you-rather', category, WYR_QUESTION_BANK[category] || [])
}
