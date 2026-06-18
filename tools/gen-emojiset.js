/* Generates src/webparts/discussionFeed/components/emojiSet.ts from assets/emoji.
   Run: node tools/gen-emojiset.js [limit]   (default 500)
   - de-dupes skin-tone variants to the default tone
   - ranks by usefulness category, keeps the top N */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'emoji');
const OUT = path.join(ROOT, 'src', 'webparts', 'discussionFeed', 'components', 'emojiSet.ts');
const LIMIT = parseInt(process.argv[2], 10) || 500;

const TONE = /_(default|light|medium-light|medium|medium-dark|dark)\.png$/;
const files = fs.readdirSync(DIR).filter(f => /\.png$/i.test(f));
const set = new Set(files);

function baseKey(f) {
  return TONE.test(f) ? f.replace(TONE, '') : f.replace(/\.png$/, '');
}
function label(key) {
  const n = key.replace(/_3d$/, '').replace(/[_-]+/g, ' ').trim();
  return n.replace(/\b\w/g, c => c.toUpperCase());
}

// one canonical file per emoji (prefer no-skin-tone, else default tone)
const groups = {};
for (const f of files) { const k = baseKey(f); (groups[k] = groups[k] || []).push(f); }
let canonical = Object.keys(groups).map(k => {
  const g = groups[k];
  const plain = k + '.png';
  const file = set.has(plain) ? plain : (g.indexOf(k + '_default.png') > -1 ? k + '_default.png' : g[0]);
  return { key: k, file: file, name: k.replace(/_3d$/, '') };
});

// drop flags
canonical = canonical.filter(e => e.name.indexOf('flag') === -1);

const CATS = [
  ['_face', 'grinning', 'smiling', 'grin', 'laughing', 'tears_of_joy', 'rofl', 'rolling_on', 'wink', 'kissing', 'savoring', 'star-struck', 'hugging', 'thinking', 'zipper', 'neutral', 'expressionless', 'rolling_eyes', 'smirk', 'unamused', 'sweat', 'pensive', 'confused', 'worried', 'frowning', 'anguished', 'fearful', 'weary', 'crying', 'loudly_crying', 'sob', 'triumph', 'angry', 'pouting', 'rage', 'exploding_head', 'flushed', 'hot_face', 'cold_face', 'woozy', 'dizzy', 'sleeping', 'sleepy', 'drooling', 'mask', 'thermometer', 'bandage', 'nauseated', 'vomiting', 'sneezing', 'partying', 'disguised', 'sunglasses', 'nerd', 'monocle', 'shushing', 'yawning', 'pleading', 'upside', 'squinting', 'melting', 'saluting', 'clown', 'cowboy', 'money_mouth', 'astonished', 'hushed', 'grimacing', 'lying', 'zany', 'shaking', 'wink'],
  ['heart', 'kiss_mark', 'love_letter', 'sparkles', 'sparkle', 'glowing_star', 'collision', 'anger_symbol', 'hundred', 'fire', 'speech_balloon', 'thought_balloon', 'zzz', 'musical_note'],
  ['thumbs', 'folded_hands', 'clapping', 'raising_hands', 'raised_hand', 'raised_fist', 'oncoming_fist', 'facing_fist', 'waving_hand', 'ok_hand', 'victory_hand', 'crossed_fingers', 'love-you', 'call_me', 'pinching', 'pinched', 'vulcan', 'sign_of_the_horns', 'backhand', 'index_pointing', 'pointing', 'middle_finger', 'hand_with_fingers', 'open_hands', 'palms_up', 'handshake', 'nail_polish', 'flexed_biceps', 'writing_hand', 'selfie'],
  ['dog', 'puppy', 'cat', 'mouse', 'hamster', 'rabbit', 'fox', 'bear', 'panda', 'koala', 'tiger', 'lion', 'cow', 'pig', 'frog', 'monkey', 'gorilla', 'chicken', 'rooster', 'penguin', 'bird', 'chick', 'duck', 'eagle', 'owl', 'bat', 'wolf', 'horse', 'unicorn', 'zebra', 'deer', 'boar', 'sheep', 'goat', 'camel', 'giraffe', 'elephant', 'rhino', 'hippo', 'hedgehog', 'fish', 'dolphin', 'whale', 'shark', 'octopus', 'squid', 'crab', 'lobster', 'shrimp', 'turtle', 'snake', 'lizard', 'dragon', 'dinosaur', 'crocodile', 'butterfly', 'bug', 'ant', 'honeybee', 'beetle', 'cricket', 'spider', 'snail', 'flower', 'rose', 'tulip', 'sunflower', 'blossom', 'hibiscus', 'bouquet', 'herb', 'clover', 'shamrock', 'maple', 'leaf', 'tree', 'palm_tree', 'cactus', 'mushroom', 'seedling', 'globe', 'sun', 'moon', 'star', 'cloud', 'rain', 'snow', 'rainbow', 'lightning', 'tornado', 'water_wave', 'droplet'],
  ['apple', 'pear', 'orange', 'tangerine', 'lemon', 'banana', 'watermelon', 'grapes', 'strawberry', 'blueberr', 'melon', 'cherries', 'peach', 'mango', 'pineapple', 'coconut', 'kiwi', 'tomato', 'eggplant', 'avocado', 'leafy', 'cucumber', 'pepper', 'corn', 'carrot', 'potato', 'garlic', 'onion', 'peanut', 'bread', 'croissant', 'baguette', 'pretzel', 'bagel', 'pancakes', 'waffle', 'cheese', 'meat', 'poultry', 'bacon', 'hamburger', 'fries', 'pizza', 'hot_dog', 'sandwich', 'taco', 'burrito', 'falafel', 'egg', 'pot_of_food', 'bowl', 'green_salad', 'popcorn', 'spaghetti', 'ramen', 'curry', 'sushi', 'bento', 'dumpling', 'rice', 'ice_cream', 'doughnut', 'cookie', 'birthday_cake', 'shortcake', 'cupcake', 'pie', 'chocolate', 'candy', 'lollipop', 'honey', 'milk', 'coffee', 'teacup', 'sake', 'champagne', 'wine', 'cocktail', 'tropical_drink', 'beer', 'clinking', 'tumbler', 'cup_with_straw', 'bubble_tea', 'mate', 'spoon', 'fork_and_knife', 'chopsticks'],
  ['soccer', 'basketball', 'american_football', 'baseball', 'softball', 'tennis', 'volleyball', 'rugby', 'flying_disc', 'bowling', 'cricket_game', 'field_hockey', 'ice_hockey', 'lacrosse', 'ping_pong', 'badminton', 'boxing', 'martial_arts', 'goal_net', 'flag_in_hole', 'ice_skate', 'fishing', 'diving', 'running_shirt', 'skis', 'sled', 'curling', 'bullseye', 'yo-yo', 'kite', 'pool_8', 'crystal_ball', 'magic_wand', 'video_game', 'joystick', 'slot_machine', 'game_die', 'puzzle', 'chess', 'jigsaw', 'teddy', 'spade', 'mahjong', 'art', 'thread', 'yarn', 'sewing', 'ballet', 'musical', 'microphone', 'headphone', 'saxophone', 'accordion', 'guitar', 'banjo', 'trumpet', 'violin', 'drum', 'piano', 'maracas', 'flute', 'clapper', 'trophy', 'medal', 'place_medal', 'military_medal', 'reminder_ribbon', 'rosette', 'ticket', 'party_popper', 'confetti', 'balloon', 'gift', 'fireworks', 'sparkler', 'firecracker', 'ribbon', 'pinata', 'mirror_ball'],
  ['automobile', 'taxi', 'bus', 'trolleybus', 'minibus', 'ambulance', 'fire_engine', 'police_car', 'truck', 'tractor', 'racing_car', 'motorcycle', 'scooter', 'bicycle', 'wheelchair', 'train', 'locomotive', 'railway', 'metro', 'tram', 'monorail', 'bullet_train', 'airplane', 'helicopter', 'rocket', 'flying_saucer', 'ship', 'ferry', 'motor_boat', 'speedboat', 'sailboat', 'canoe', 'anchor', 'fuel_pump', 'wheel', 'traffic', 'construction', 'stop_sign', 'house', 'home', 'building', 'office', 'post_office', 'hospital', 'bank', 'hotel', 'convenience', 'school', 'department', 'factory', 'castle', 'stadium', 'church', 'mosque', 'synagogue', 'hindu_temple', 'kaaba', 'shinto', 'tent', 'national_park', 'mountain', 'mount_fuji', 'volcano', 'camping', 'beach', 'desert', 'island', 'sunrise', 'cityscape', 'night_with', 'bridge', 'fountain', 'ferris', 'roller_coaster', 'carousel', 'statue_of_liberty', 'world_map', 'compass'],
  ['mobile_phone', 'telephone', 'battery', 'electric_plug', 'laptop', 'computer', 'keyboard', 'printer', 'computer_mouse', 'floppy', 'optical_disc', 'dvd', 'camera', 'movie_camera', 'projector', 'television', 'radio', 'studio_microphone', 'stopwatch', 'timer', 'alarm_clock', 'mantelpiece_clock', 'hourglass', 'satellite', 'flashlight', 'light_bulb', 'candle', 'book', 'notebook', 'page', 'scroll', 'newspaper', 'bookmark', 'money', 'dollar', 'coin', 'credit_card', 'receipt', 'gem', 'balance_scale', 'toolbox', 'wrench', 'screwdriver', 'hammer', 'axe', 'nut_and_bolt', 'gear', 'magnet', 'link', 'magnifying', 'telescope', 'microscope', 'satellite_antenna', 'syringe', 'pill', 'stethoscope', 'door', 'mirror', 'bed', 'couch', 'chair', 'toilet', 'shower', 'bathtub', 'soap', 'broom', 'basket', 'bell', 'key', 'locked', 'unlocked', 'envelope', 'package', 'pencil', 'pen', 'fountain_pen', 'paintbrush', 'crayon', 'memo', 'briefcase', 'folder', 'file_folder', 'calendar', 'clipboard', 'pushpin', 'paperclip', 'straight_ruler', 'scissors', 'bar_chart', 'wastebasket', 'umbrella', 'eyeglasses', 'goggles', 'necktie', 'shirt', 'jeans', 'scarf', 'gloves', 'coat', 'socks', 'dress', 'kimono', 'shorts', 'bikini', 'handbag', 'purse', 'backpack', 'shopping', 'crown', 'top_hat', 'graduation_cap', 'lipstick', 'ring', 'gem_stone'],
  ['check_mark', 'cross_mark', 'multiplication', 'plus', 'minus', 'division', 'question_mark', 'exclamation', 'warning', 'no_entry', 'prohibited', 'recycling', 'infinity', 'medical_symbol', 'currency', 'trade_mark', 'copyright', 'registered', 'hundred_points', 'back_arrow', 'soon_arrow', 'sos_button', 'new_button', 'free_button', 'up_button', 'cool_button', 'star_of', 'peace_symbol', 'om_symbol', 'wheel_of_dharma', 'yin_yang', 'star_and_crescent', 'menorah', 'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces', 'ophiuchus', 'atom_symbol', 'bell', 'red_circle', 'orange_circle', 'yellow_circle', 'green_circle', 'blue_circle', 'purple_circle', 'red_square', 'green_square', 'blue_square', 'eye', 'red_heart'],
  ['person', 'man', 'woman', 'boy', 'girl', 'baby', 'older', 'child', 'adult', 'blond', 'bearded', 'pregnant', 'health_worker', 'student', 'teacher', 'judge', 'farmer', 'cook', 'mechanic', 'factory_worker', 'office_worker', 'scientist', 'technologist', 'singer', 'artist', 'pilot', 'astronaut', 'firefighter', 'police_officer', 'detective', 'guard', 'ninja', 'construction_worker', 'prince', 'superhero', 'supervillain', 'mage', 'fairy', 'vampire', 'merperson', 'elf', 'genie', 'zombie', 'troll', 'santa', 'claus', 'angel', 'tipping_hand', 'bowing', 'facepalming', 'shrugging', 'gesturing', 'deaf', 'massage', 'haircut', 'walking', 'standing', 'kneeling', 'running', 'dancer', 'people', 'couple', 'family', 'speaking_head', 'footprints', 'ear', 'nose', 'tongue', 'tooth', 'brain', 'leg', 'foot']
];

// per-category caps so the set spreads across categories (faces..people)
const CAPS = [95, 30, 32, 70, 62, 52, 46, 66, 30, 45];

function rank(name) {
  for (let i = 0; i < CATS.length; i++) {
    for (const kw of CATS[i]) { if (name.indexOf(kw) > -1) { return i; } }
  }
  return 999;
}

canonical.forEach(e => { e.rank = rank(e.name); });

const chosen = [];
const used = {};
for (let i = 0; i < CATS.length && chosen.length < LIMIT; i++) {
  const inCat = canonical
    .filter(e => e.rank === i && !used[e.file])
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const e of inCat.slice(0, CAPS[i])) {
    if (chosen.length >= LIMIT) { break; }
    chosen.push(e); used[e.file] = true;
  }
}
// fill any remainder from the rest, by rank then name
if (chosen.length < LIMIT) {
  const rest = canonical
    .filter(e => !used[e.file])
    .sort((a, b) => (a.rank - b.rank) || a.name.localeCompare(b.name));
  for (const e of rest) { if (chosen.length >= LIMIT) { break; } chosen.push(e); }
}

const lines = chosen.map(e => `  { file: '${e.file}', label: '${label(e.key).replace(/'/g, "\\'")}' }`);
const ts =
`export interface IEmoji {
  file: string;   // image filename under the emoji base url
  label: string;  // used as title + search term
  char?: string;  // optional Unicode fallback
}

// AUTO-GENERATED by tools/gen-emojiset.js from assets/emoji (top ${LIMIT} by usefulness).
// Re-run: node tools/gen-emojiset.js [limit]
export const EMOJI_SET: IEmoji[] = [
${lines.join(',\n')}
];
`;
fs.writeFileSync(OUT, ts);
const dist = {};
chosen.forEach(e => { dist[e.rank] = (dist[e.rank] || 0) + 1; });
console.log(`Wrote ${chosen.length} emojis to emojiSet.ts`);
console.log('per-category counts:', JSON.stringify(dist));
console.log('unmatched (rank 999) included:', dist[999] || 0);
