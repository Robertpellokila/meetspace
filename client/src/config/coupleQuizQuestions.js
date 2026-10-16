// Couple Quiz question bank — each question is answered by the subject and guessed by their partner.
import { mergeGameContent } from './gameContent.js'
export const COUPLE_QUIZ_CATEGORIES = [
  { id: 'romantic', title: 'Romantic', icon: '💕', description: 'Sweet moments and thoughtful gestures' },
  { id: 'funny', title: 'Funny', icon: '😂', description: 'Silly choices and fun surprises' },
  { id: 'deep-talk', title: 'Deep Talk', icon: '🌙', description: 'Values, hopes, and meaningful conversations' },
  { id: 'know-me', title: 'How Well Do You Know Me?', icon: '🧠', description: 'Discover what your partner really likes' },
]
export const COUPLE_QUIZ_QUESTIONS = {
  romantic: [
    ['r1','Which date would make you happiest?',['Sunset picnic','Cozy movie night','Exploring a new city','Cooking together']],
    ['r2','Which surprise would you enjoy most?',['Handwritten letter','Unexpected flowers','Favorite snack delivery','A planned weekend']],
    ['r3','What feels most romantic?',['Watching stars','Dancing at home','Long evening walks','Breakfast together']],
    ['r4','Which anniversary plan sounds best?',['Fancy dinner','Quiet staycation','Nature getaway','Recreating our first date']],
    ['r5','How do you best receive affection?',['Kind words','Quality time','Small gifts','Helpful actions']],
    ['r6','What shared memory would you most like to create?',['Road trip','Concert together','Beach sunrise','Learning a hobby']],
    ['r7','Which love note would you most appreciate?',['A funny poem','A sincere thank-you','A list of memories','A future promise']],
    ['r8','What couple tradition would you love?',['Weekly date night','Annual photo album','Monthly adventures','Daily goodnight call']],
  ],
  funny: [
    ['f1','Which silly challenge would you choose?',['Sing karaoke','Dance battle','Imitate a celebrity','Invent a funny accent']],
    ['f2','Which ridiculous pet would you want?',['Tiny dragon','Talking cat','Dancing penguin','Flying turtle']],
    ['f3','Which fictional power would be funniest?',['Instant costume changes','Summon pizza','Talk to plants','Teleport 1 meter']],
    ['f4','Which snack combo would you dare to try?',['Fries with ice cream','Chili chocolate','Pickle popcorn','Cheese with jam']],
    ['f5','What kind of comedy makes you laugh most?',['Puns','Physical comedy','Awkward stories','Funny animal videos']],
    ['f6','Choose a ridiculous date theme.',['Dress like spies','Act like tourists','Wear matching pajamas','Make up superhero names']],
    ['f7','Which game-show challenge would you win?',['Guess the song','Speed drawing','Trivia','Taste test']],
    ['f8','What would be your funny couple nickname?',['Team Waffles','The Chaos Duo','Moon & Noodles','Captain & Cookie']],
  ],
  'deep-talk': [
    ['d1','Which quality matters most in a partnership?',['Trust','Patience','Communication','Shared curiosity']],
    ['d2','Which personal goal would you prioritize?',['Learning something new','Traveling more','Building stability','Helping others']],
    ['d3','Which conversation would you rather have tonight?',['Dreams for the future','Childhood memories','Life lessons','Things we appreciate']],
    ['d4','What helps you feel understood?',['Being listened to','Gentle questions','Space to reflect','Practical support']],
    ['d5','Which value do you want to practice more?',['Kindness','Courage','Honesty','Gratitude']],
    ['d6','How do you recharge after a hard day?',['Quiet alone time','Talking it through','A fun activity','Rest and sleep']],
    ['d7','Which future milestone excites you most?',['A shared home','A big trip','A new skill','A community project']],
    ['d8','How do you prefer resolving disagreements?',['Talk immediately','Take a short break','Write thoughts first','Agree on next steps']],
  ],
  'know-me': [
    ['k1','Which weekend sounds most like you?',['Outdoor adventure','Staying home','Cafe hopping','Visiting friends']],
    ['k2','Which gift fits you best?',['A book','A handmade item','An experience','Something practical']],
    ['k3','Pick your dream vacation.',['Mountains','Beach','Big city','Countryside']],
    ['k4','Which drink would you order first?',['Coffee','Tea','Fruit juice','Hot chocolate']],
    ['k5','Which movie genre do you prefer?',['Comedy','Romance','Mystery','Fantasy']],
    ['k6','Which activity would you start together?',['Painting','Hiking','Cooking','Gaming']],
    ['k7','Which music vibe matches you today?',['Chill acoustic','Upbeat pop','Classic hits','Lo-fi']],
    ['k8','What matters most when choosing a restaurant?',['Taste','Atmosphere','Price','Trying new foods']],
  ],
}
export function getCoupleQuestions(category) {
  const defaults = (COUPLE_QUIZ_QUESTIONS[category] || []).map(([id,text,options]) => ({id,text,options,category}))
  return mergeGameContent('couple-quiz', category, defaults)
}
export function getCoupleQuestion(category,index) {
  const list = getCoupleQuestions(category)
  return list.length ? list[index % list.length] : null
}
