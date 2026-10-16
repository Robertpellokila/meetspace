// Deterministic deck: only pair IDs are stored in shared state; browser renders emojis.
export const MEMORY_DIFFICULTIES = Object.freeze([
  { id:'easy', title:'Easy', pairs:6, columns:4 },
  { id:'medium', title:'Medium', pairs:8, columns:4 },
  { id:'hard', title:'Hard', pairs:12, columns:8 },
])
export const MEMORY_SYMBOLS = Object.freeze(['💌','🌷','🌈','⭐','🍓','🧸','🎀','🎧','🪴','🍦','🎲','🦋'])
export function memoryDifficulty(id) { return MEMORY_DIFFICULTIES.find(d=>d.id===id) || null }
export function memoryDeck(difficulty='easy', seed=1) {
  const conf=memoryDifficulty(difficulty)
  if (!conf) throw new Error('Difficulty tidak valid')
  const deck=Array.from({length:conf.pairs},(_,i)=>[i,i]).flat()
  let x=(seed>>>0)||1
  // Reproducible seeded Fisher–Yates. Avoid Math.random divergence across clients.
  for (let i=deck.length-1;i>0;i--) {
    x^=x<<13; x^=x>>>17; x^=x<<5; x>>>=0
    const j=x%(i+1)
    ;[deck[i],deck[j]]=[deck[j],deck[i]]
  }
  return deck
}
