// Al-Furaih Villa structural 4D viewer, v5. English or Arabic (right to left).
// Model: exported from the Revit structural model (model.json). More layers (MEP) can be added later, see LAYERS.
// Programme: the AHB dashboard (furah.html). The page reads the dashboard live when it can reach it. If it cannot,
// or the dashboard's data cannot be read, it shows the last good copy (kept on this device) or the snapshot saved
// beside it (snapshot.json), and says so.
// Site updates: site-updates.csv (or the older site-updates.json), progress seen on site after the
// dashboard's data date. One line per activity: date, activity, percent, by, note.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DASHBOARD_PAGE = 'https://engahmedkhodier-hash.github.io/ahb-dashboard/furah.html';
const LIVE_SOURCES = ['../furah.html', DASHBOARD_PAGE];
const LIVE_HOME = 'https://engahmedkhodier-hash.github.io/ahb-dashboard/furah-4d/';
const SITE_FILES = ['./site-updates.csv', './site-updates.json'];
// Model layers. Only the structure exists today. An MEP layer (drainage, HVAC, water supply, electrical) can be added
// later as another file in the same format, exported from its Revit model with its own work items; loadModel reads
// every layer that is switched on and keeps each element's layer.
const LAYERS = [
  { k: 'STR', name: 'Structure', ar: 'الهيكل الإنشائي', file: './model.json', bytes: 1065108, on: true }, // bytes: for the loading bar
  // { k: 'MEP', name: 'MEP services', file: './model-mep.json', bytes: 0, on: false },
];
const LAST_GOOD_KEY = 'fur4d.lastGood'; // the last dashboard data read successfully on this device
const PREV_KEY = 'fur4d.prev';          // the dashboard of the week before, for "Last week"
const REPO = 'engahmedkhodier-hash/ahb-dashboard'; // where the dashboard's weekly history lives
const REFRESH_MINUTES = 15;
const DAY = 86400000;
const VERSION = 'v5';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uniq = arr => [...new Set(arr)];
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const listJoin = a => a.length < 2 ? (a[0] || '') : LANG === 'ar' ? a.slice(0, -1).join('، ') + (/^[\u0600-\u06ff]/.test(a[a.length - 1]) ? ' و' : ' و ') + a[a.length - 1] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
// Resolve a CSS colour variable (including light-dark()) to an rgb() string via a probe element.
let _probe = null;
const css = name => {
  if (!_probe) { _probe = document.createElement('i'); _probe.style.display = 'none'; document.body.appendChild(_probe); }
  _probe.style.color = ''; _probe.style.color = `var(${name})`;
  return getComputedStyle(_probe).color || '#999';
};
let topLevel = true;
try { topLevel = window.self === window.top; } catch (e) { topLevel = false; }

/* ---------- Language: English or Arabic (right to left; numbers stay Western) ---------- */
// The choice is kept on this device. A link can carry #lang=ar to open in Arabic without changing that choice.
const LANG_KEY = 'fur4d.lang';
let LANG = (() => {
  try { const h = new URLSearchParams(location.hash.replace(/^#/, '')).get('lang'); if (h === 'ar' || h === 'en') return h; } catch (e) { /* no hash */ }
  try { const v = localStorage.getItem(LANG_KEY); if (v === 'ar' || v === 'en') return v; } catch (e) { /* storage blocked */ }
  return 'en';
})();
const AR = () => LANG === 'ar';
const L = (en, ar) => LANG === 'ar' && ar != null ? ar : en;
function inEn(f) { const k = LANG; LANG = 'en'; try { return f(); } finally { LANG = k; } } // the A4 sheet stays in English
const LOC = () => AR() ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB';
// Counted nouns. Arabic forms: one, two (nominative), two (after a preposition or as an object), 3 to 10, 11 to 99, 100 and over.
const NOUNS = {
  day: ['day', 'days', 'يوم واحد', 'يومان', 'يومين', 'أيام', 'يوماً', 'يوم'],
  activity: ['activity', 'activities', 'نشاط واحد', 'نشاطان', 'نشاطين', 'أنشطة', 'نشاطاً', 'نشاط'],
  element: ['element', 'elements', 'عنصر واحد', 'عنصران', 'عنصرين', 'عناصر', 'عنصراً', 'عنصر'],
  item: ['work item', 'work items', 'بند واحد', 'بندان', 'بندين', 'بنود', 'بنداً', 'بند'],
  update: ['site update', 'site updates', 'تحديث واحد', 'تحديثان', 'تحديثين', 'تحديثات', 'تحديثاً', 'تحديث'],
  line: ['line', 'lines', 'سطر واحد', 'سطران', 'سطرين', 'أسطر', 'سطراً', 'سطر'],
  pour: ['pour', 'pours', 'صبة واحدة', 'صبتان', 'صبتين', 'صبات', 'صبة', 'صبة'],
  note: ['note', 'notes', 'ملاحظة واحدة', 'ملاحظتان', 'ملاحظتين', 'ملاحظات', 'ملاحظة', 'ملاحظة'],
  link: ['link', 'links', 'رابط واحد', 'رابطان', 'رابطين', 'روابط', 'رابطاً', 'رابط'],
  beam: ['beam', 'beams', 'كمرة واحدة', 'كمرتان', 'كمرتين', 'كمرات', 'كمرة', 'كمرة'],
  clash: ['sequence clash', 'sequence clashes', 'تعارض واحد في التسلسل', 'تعارضان في التسلسل', 'تعارضين في التسلسل', 'تعارضات في التسلسل', 'تعارضاً في التسلسل', 'تعارض في التسلسل'],
  thing: ['thing', 'things', 'أمر واحد', 'أمران', 'أمرين', 'أمور', 'أمراً', 'أمر'],
  draft: ['draft line', 'draft lines', 'سطر مسودة واحد', 'سطرا مسودة', 'سطري مسودة', 'أسطر مسودة', 'سطر مسودة', 'سطر مسودة'],
};
const PR_AR = new Intl.PluralRules('ar');
function cnt(n, k, after) { // after: the Arabic dual comes after a preposition or as an object ("قبل يومين")
  const f = NOUNS[k];
  if (!AR()) return plural(n, f[0], f[1]);
  const c = PR_AR.select(n);
  return c === 'one' ? f[2] : c === 'two' ? f[after ? 4 : 3] : c === 'few' || c === 'zero' ? `${n} ${f[5]}` : c === 'many' ? `${n} ${f[6]}` : `${n} ${f[7]}`;
}

/* ---------- Floors and work items ---------- */
const A = id => 'FUR.M.C.' + id;
const two = n => String(n).padStart(2, '0');
const SB = n => A('SB.CW.' + two(n));
const SP = (p, n) => A(`SP.${p}.${two(n)}`);
const range = (p, a, b) => Array.from({ length: b - a + 1 }, (_, i) => SP(p, a + i));

const PKGS = [
  { k: 'SB', name: 'Foundations', long: 'Foundations', note: 'Blinding, raft, grade beams, basement retaining walls, slab on grade, water tank, manhole',
    ar: 'الأساسات', longAr: 'الأساسات', noteAr: 'خرسانة النظافة، اللبشة، الميدات، الجدران الاستنادية للقبو، البلاطة الأرضية، خزان المياه، غرفة التفتيش' },
  { k: 'B1', name: 'Basement', long: 'Basement', note: 'Basement columns and walls from B00 up to L00, ramp, basement stair',
    ar: 'القبو', longAr: 'القبو', noteAr: 'أعمدة وجدران القبو من B00 حتى L00، المنحدر، درج القبو' },
  { k: 'GF', name: 'Ground', long: 'Ground floor', note: 'The L00 slab and beams, plus the columns and walls standing on it up to L01',
    ar: 'الأرضي', longAr: 'الدور الأرضي', noteAr: 'بلاطة وكمرات منسوب L00، والأعمدة والجدران القائمة عليها حتى L01' },
  { k: '1ST', name: 'First', long: 'First floor', note: 'The L01 slab and beams, plus the columns and walls up to L02',
    ar: 'الأول', longAr: 'الدور الأول', noteAr: 'بلاطة وكمرات منسوب L01، والأعمدة والجدران حتى L02' },
  { k: '2ND', name: 'Second', long: 'Second floor', note: 'The L02 slab and beams, plus the columns up to the roof (TRL)',
    ar: 'الثاني', longAr: 'الدور الثاني', noteAr: 'بلاطة وكمرات منسوب L02، والأعمدة حتى السطح (TRL)' },
  { k: 'RF', name: 'Roof', long: 'Roof', note: 'The roof slab at TRL, the parapet and the lift walls above the roof',
    ar: 'السطح', longAr: 'السطح', noteAr: 'بلاطة السطح عند TRL، والدروة، وجدران المصعد فوق السطح' },
];
const pName = p => L(p.name, p.ar), pLong = p => L(p.long, p.longAr), pNote = p => L(p.note, p.noteAr);
const PKG = Object.fromEntries(PKGS.map((p, i) => [p.k, { ...p, i }]));
const FLOORLV = { GF: ['L00', 'L01'], '1ST': ['L01', 'L02'], '2ND': ['L02', 'roof'] };
const LEVEL_NAMES = { B00: 'Basement', L00: 'Ground', L01: 'First', L02: 'Second', TRL: 'Roof' };
const LEVEL_AR = { B00: 'القبو', L00: 'الأرضي', L01: 'الأول', L02: 'الثاني', TRL: 'السطح' };
const levelName = c => L(LEVEL_NAMES[c], LEVEL_AR[c]);
const levelTag = l => `${levelName(l.name) ? levelName(l.name) + ' ' : ''}${l.name}  ${l.elev >= 0 ? '+' : '−'}${Math.abs(l.elev).toFixed(2)}`;

function floorItems(p) {
  const [a, b] = FLOORLV[p]; const bAr = b === 'roof' ? 'السطح' : b;
  return {
    [`${p}/COL`]: { name: `Columns and walls ${a} to ${b}`, ar: `الأعمدة والجدران من ${a} إلى ${bAr}`, acts: range(p, 1, 4) },
    [`${p}/BEAM`]: { name: `Beams at ${a}`, ar: `كمرات منسوب ${a}`, acts: range(p, 5, 8) },
    [`${p}/UB`]: { name: `Beams between ${a} and ${b}`, ar: `كمرات بين ${a} و ${bAr}`, acts: range(p, 1, 4), upper: true },
    [`${p}/SLAB`]: { name: `Solid slabs at ${a}`, ar: `بلاطات مصمتة منسوب ${a}`, acts: range(p, 9, 12) },
    [`${p}/HRD`]: { name: `Hordi slab at ${a}`, ar: `بلاطة هوردي منسوب ${a}`, acts: [SP(p, 13), SP(p, 15), SP(p, 16), SP(p, 17)] },
    [`${p}/BLK`]: { name: `Siporex blocks in the ${a} hordi slab`, ar: `بلوك سيبوركس في بلاطة هوردي ${a}`, acts: [SP(p, 14)] },
    [`${p}/STR`]: { name: `Stairs ${a} to ${b}`, ar: `الدرج من ${a} إلى ${bAr}`, acts: [SP(p, 18)] },
  };
}
const WORK = {
  'SB/PCC': { name: 'Blinding (PCC) under the foundations', acts: [SB(1), SB(2), A('SB.THE.01')] },
  'SB/FND': { name: 'Raft foundation', acts: [SB(5), SB(6), SB(7), SB(8)] },
  'SB/BLKF': { name: 'Raft edge protection and screed', acts: [SB(4), SB(3)] },
  'SB/GB': { name: 'Grade beams', acts: [SB(9), SB(10), SB(11), SB(12)] },
  'SB/SWALL': { name: 'Basement retaining walls', acts: [SB(13), SB(14), SB(15), SB(16)] },
  'SB/BLKW': { name: 'Protection blockwork to basement walls', acts: [SB(17), A('SB.THE.05')] },
  'SB/SOG': { name: 'Slab on grade', acts: [SB(18), SB(19), SB(20), SB(21)] },
  'SB/RAMP': { name: 'Ramp (substructure)', acts: [SB(22), SB(23), SB(24), SB(25)] },
  'SB/WTF': { name: 'Water tank and pump room raft', acts: [SB(26), SB(27), SB(28), SB(29)] },
  'SB/WTW': { name: 'Water tank and pump room walls', acts: [SB(30), SB(31), SB(32), SB(33)] },
  'SB/WTS': { name: 'Water tank and pump room slabs', acts: [SB(34), SB(35), SB(36), SB(37)] },
  'SB/MH': { name: 'Manhole', acts: [SB(38), SB(39), SB(40), SB(41)] },
  'SB/WP': { name: 'Basement waterproofing membrane', acts: [A('SB.THE.02')], wp: true },
  'SB/WPPL': { name: 'Manhole and planter waterproofing', acts: [A('SB.THE.04')], wp: true },
  'B1/COL': { name: 'Basement columns B00 to L00', acts: range('B1', 1, 4) },
  'B1/RBM': { name: 'Ramp beams', acts: range('B1', 5, 8) },
  'B1/WALL': { name: 'Basement walls and lift core B00 to L00', acts: range('B1', 9, 12) },
  'B1/RSLB': { name: 'Ramp slab', acts: range('B1', 13, 16) },
  'B1/STR': { name: 'Basement stair', acts: [SP('B1', 17)] },
  ...floorItems('GF'), ...floorItems('1ST'), ...floorItems('2ND'),
  'RF/COL': { name: 'Lift walls above the roof', acts: range('RF', 1, 4) },
  'RF/BEAM': { name: 'Beams at roof level', acts: range('RF', 5, 8) },
  'RF/SLAB': { name: 'Solid slabs at roof level', acts: range('RF', 9, 12) },
  'RF/HRD': { name: 'Hordi slab at roof level', acts: range('RF', 13, 16) },
  'RF/BLK': { name: 'Siporex blocks in the roof hordi slab', acts: range('RF', 13, 16) },
  'RF/PAR': { name: 'Roof parapet', acts: range('RF', 17, 20) },
  'RF/WP': { name: 'Roof waterproofing', acts: [], wp: true },
};
const WORK_AR = {
  'SB/PCC': 'خرسانة النظافة تحت الأساسات', 'SB/FND': 'أساس اللبشة', 'SB/BLKF': 'حماية أطراف اللبشة وطبقة التسوية', 'SB/GB': 'الميدات',
  'SB/SWALL': 'الجدران الاستنادية للقبو', 'SB/BLKW': 'بلوك حماية جدران القبو', 'SB/SOG': 'البلاطة الأرضية', 'SB/RAMP': 'المنحدر',
  'SB/WTF': 'لبشة خزان المياه وغرفة المضخات', 'SB/WTW': 'جدران خزان المياه وغرفة المضخات', 'SB/WTS': 'بلاطات خزان المياه وغرفة المضخات',
  'SB/MH': 'غرفة التفتيش', 'SB/WP': 'غشاء العزل المائي للقبو', 'SB/WPPL': 'عزل غرفة التفتيش وأحواض الزراعة',
  'B1/COL': 'أعمدة القبو من B00 إلى L00', 'B1/RBM': 'كمرات المنحدر', 'B1/WALL': 'جدران القبو وبئر المصعد من B00 إلى L00', 'B1/RSLB': 'بلاطة المنحدر', 'B1/STR': 'درج القبو',
  'RF/COL': 'جدران المصعد فوق السطح', 'RF/BEAM': 'كمرات منسوب السطح', 'RF/SLAB': 'بلاطات مصمتة منسوب السطح', 'RF/HRD': 'بلاطة هوردي منسوب السطح',
  'RF/BLK': 'بلوك سيبوركس في بلاطة هوردي السطح', 'RF/PAR': 'دروة السطح', 'RF/WP': 'العزل المائي للسطح',
};
for (const [k, w] of Object.entries(WORK)) { w.key = k; w.pkg = k.split('/')[0]; w.els = []; w.m3 = 0; if (WORK_AR[k]) w.ar = WORK_AR[k]; }
const wName = w => L(w.name, w.ar);
const wLow = w => AR() ? wName(w) : w.name.replace(/^./, c => c.toLowerCase()); // inside a sentence
const itemLabel = w => `${pName(PKG[w.pkg])} · ${wName(w)}`;

// "X stands on Y": X can only start once Y is cast. Used for the programme checks.
const RESTS_ON = [
  { x: 'GF/COL', y: ['GF/BEAM', 'GF/SLAB', 'GF/HRD'], fl: 'GF', title: 'Ground floor columns are planned before their slab', on: 'the L00 slab and beams they stand on', be: 'are',
    titleAr: 'أعمدة الدور الأرضي مخططة قبل بلاطتها', onAr: 'بلاطة وكمرات منسوب L00 التي تقوم عليها', onShortAr: 'بلاطة وكمرات منسوب L00' },
  { x: '1ST/COL', y: ['1ST/BEAM', '1ST/SLAB', '1ST/HRD'], fl: '1ST', title: 'First floor columns are planned before their slab', on: 'the L01 slab and beams they stand on', be: 'are',
    titleAr: 'أعمدة الدور الأول مخططة قبل بلاطتها', onAr: 'بلاطة وكمرات منسوب L01 التي تقوم عليها', onShortAr: 'بلاطة وكمرات منسوب L01' },
  { x: '2ND/COL', y: ['2ND/BEAM', '2ND/SLAB', '2ND/HRD'], fl: '2ND', title: 'Second floor columns are planned before their slab', on: 'the L02 slab and beams they stand on', be: 'are',
    titleAr: 'أعمدة الدور الثاني مخططة قبل بلاطتها', onAr: 'بلاطة وكمرات منسوب L02 التي تقوم عليها', onShortAr: 'بلاطة وكمرات منسوب L02' },
  { x: 'RF/COL', y: ['RF/BEAM', 'RF/SLAB', 'RF/HRD'], fl: 'RF', title: 'Lift walls above the roof are planned before the roof slab', on: 'the roof slab they stand on', be: 'is',
    titleAr: 'جدران المصعد فوق السطح مخططة قبل بلاطة السطح', onAr: 'بلاطة السطح التي تقوم عليها', onShortAr: 'بلاطة السطح' },
  { x: 'RF/PAR', y: ['RF/BEAM', 'RF/SLAB', 'RF/HRD'], fl: 'RF', title: 'The roof parapet is planned before the roof slab', on: 'the roof slab it stands on', be: 'is',
    titleAr: 'دروة السطح مخططة قبل بلاطة السطح', onAr: 'بلاطة السطح التي تقوم عليها', onShortAr: 'بلاطة السطح' },
  { x: 'GF/BEAM', y: ['B1/COL', 'B1/WALL'], fl: 'GF', title: 'L00 beams are planned before the basement columns', on: 'the basement columns and walls they sit on', be: 'are',
    titleAr: 'كمرات منسوب L00 مخططة قبل أعمدة القبو', onAr: 'أعمدة وجدران القبو التي ترتكز عليها', onShortAr: 'أعمدة وجدران القبو' },
  { x: '1ST/BEAM', y: ['GF/COL'], fl: '1ST', title: 'L01 beams are planned before the ground floor columns', on: 'the ground floor columns they sit on', be: 'are',
    titleAr: 'كمرات منسوب L01 مخططة قبل أعمدة الدور الأرضي', onAr: 'أعمدة الدور الأرضي التي ترتكز عليها', onShortAr: 'أعمدة الدور الأرضي' },
  { x: '2ND/BEAM', y: ['1ST/COL'], fl: '2ND', title: 'L02 beams are planned before the first floor columns', on: 'the first floor columns they sit on', be: 'are',
    titleAr: 'كمرات منسوب L02 مخططة قبل أعمدة الدور الأول', onAr: 'أعمدة الدور الأول التي ترتكز عليها', onShortAr: 'أعمدة الدور الأول' },
  { x: 'RF/BEAM', y: ['2ND/COL'], fl: 'RF', title: 'Roof beams are planned before the second floor columns', on: 'the second floor columns they sit on', be: 'are',
    titleAr: 'كمرات السطح مخططة قبل أعمدة الدور الثاني', onAr: 'أعمدة الدور الثاني التي ترتكز عليها', onShortAr: 'أعمدة الدور الثاني' },
];

/* ---------- Stages ---------- */
const STAGES = {
  form: { label: 'Formwork', ar: 'الشدات', order: 1, color: '--form' },
  block: { label: 'Siporex blocks', ar: 'بلوك سيبوركس', order: 2, color: '--form' },
  blockwork: { label: 'Blockwork', ar: 'أعمال البلوك', order: 2, color: '--form' },
  wp: { label: 'Waterproofing', ar: 'العزل المائي', order: 2, color: '--form' },
  rebar: { label: 'Steel fixing', ar: 'تركيب الحديد', order: 3, color: '--rebar' },
  cast: { label: 'Concrete casting', ar: 'صب الخرسانة', order: 4, color: '--cast' },
  strip: { label: 'Formwork removal', ar: 'فك الشدات', order: 5, color: '--built' },
};
const sLabel = k => L(STAGES[k].label, STAGES[k].ar);
const sLow = k => AR() ? STAGES[k].ar : STAGES[k].label.toLowerCase();
// Arabic names for the dashboard's activities, which are written in English. Unknown names stay in English.
const ACT_AR_FIXED = [
  [/^excavation work/i, 'أعمال الحفر'], [/^soil treatment/i, 'معالجة التربة ضد النمل الأبيض'], [/^backfilling/i, 'أعمال الردم'],
  [/polythene sheet/i, 'فرش نايلون بولي إيثيلين 250 ميكرون تحت الأساسات والميدات والبلاطة الأرضية'],
  [/waterproofing membrane of basement/i, 'غشاء عزل مائي بطبقتين للقبو'], [/waterproofing membrane of water tank/i, 'غشاء عزل مائي بطبقتين لخزانات المياه'],
  [/waterproofing membrane of manhole/i, 'غشاء عزل مائي بطبقتين للوجه الخارجي لجدران غرفة التفتيش وأحواض الزراعة'],
  [/protection board over vertical/i, 'لوح حماية 6 مم فوق أسطح العزل الرأسية'], [/waterstop for basement/i, 'مانع تسرب PVC لجدران القبو'],
  [/waterstop for water tank/i, 'مانع تسرب PVC لجدران خزان المياه'], [/epoxy painting/i, 'دهان إيبوكسي آمن لمياه الشرب للأسطح الداخلية للخزانات'],
  [/^casting concrete 50mm protection screed/i, 'صب طبقة حماية 50 مم فوق غشاء العزل المائي'],
  [/^block work .* for foundation/i, 'بلوك 200 مم مع العزل ولوح الحماية للأساسات'], [/^block work .* for walls/i, 'بلوك 200 مم مع العزل ولوح الحماية للجدران'],
  [/^reinforced concrete for stairs/i, 'خرسانة مسلحة للدرج'], [/siporex blocks for hordi/i, 'تركيب بلوك سيبوركس 250 مم لبلاطة الهوردي'],
];
const ACT_AR_STAGE = [[/^carpent[e]?ry work for /i, 'شدات '], [/^steel fixing for /i, 'تركيب حديد '], [/^casting concrete for /i, 'صب خرسانة '], [/^removal of carpentry work of /i, 'فك شدات ']];
const ACT_AR_OBJ = [
  [/^100mm thick under foundation/i, 'خرسانة النظافة 100 مم تحت الأساسات والميدات وخزان المياه'], [/^columns & walls$/i, 'الأعمدة والجدران'], [/^columns$/i, 'الأعمدة'],
  [/^ramp beams$/i, 'كمرات المنحدر'], [/^beams$/i, 'الكمرات'], [/^walls$/i, 'الجدران'], [/^ramp slab$/i, 'بلاطة المنحدر'], [/^ramp$/i, 'المنحدر'],
  [/^slabs with different thickness/i, 'البلاطات بسماكات وأنواع مختلفة'], [/^hordi slab 320/i, 'بلاطة الهوردي 320 مم'], [/^parapet$/i, 'الدروة'],
  [/^foundation of water tank/i, 'لبشة خزان المياه وغرف المضخات'], [/^foundation$/i, 'الأساسات (اللبشة)'], [/^grade beams$/i, 'الميدات'], [/^slab on grade$/i, 'البلاطة الأرضية'],
  [/^concrete walls of water tank/i, 'جدران خزان المياه وغرف المضخات'], [/^tank slabs of water tank/i, 'بلاطات خزان المياه وغرف المضخات'],
  [/^slab manhole$/i, 'غرفة التفتيش'], [/^manhole$/i, 'غرفة التفتيش'],
];
const actArCache = new Map();
function actNameAr(name) {
  if (actArCache.has(name)) return actArCache.get(name);
  const n = String(name).replace(/\s+/g, ' ').replace(/\.$/, '').trim(); let out = null;
  for (const [re, ar] of ACT_AR_FIXED) if (re.test(n)) { out = ar; break; }
  if (!out) for (const [re, pre] of ACT_AR_STAGE) {
    const m = re.exec(n); if (!m) continue;
    const obj = n.slice(m[0].length).trim(); const hit = ACT_AR_OBJ.find(([r]) => r.test(obj));
    if (hit) out = pre + hit[1];
    break;
  }
  actArCache.set(name, out); return out;
}
const aName = a => AR() ? (actNameAr(a.name) || a.name) : a.name;
function stageOf(name) {
  const n = name.toLowerCase();
  if (n.startsWith('removal')) return 'strip';
  if (n.includes('siporex')) return 'block';
  if (n.includes('carpent')) return 'form';
  if (n.startsWith('steel fixing')) return 'rebar';
  if (n.startsWith('casting') || n.startsWith('reinforced concrete')) return 'cast';
  if (n.includes('block work')) return 'blockwork';
  return 'wp';
}
const NOT_CONCRETE = /SIPOREX|BLOCK|WATER ?PROOF|MEMBRANE|COVER|LEAN CONCRETE/i;

/* ---------- Dates ---------- */
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseDash(s) { // "19-Nov-26" or "07-Jun-2026"
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
  return Date.UTC(y, MON[m[2].toLowerCase()], +m[1]);
}
function parseIso(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
const fmtD = (t, y) => t == null || !isFinite(t) ? '—' : new Date(t).toLocaleDateString(LOC(), { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const fmtDW = t => new Date(t).toLocaleDateString(LOC(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function fmtRange(a, b, y) {
  if (a == null) return '—';
  if (b == null || a === b) return fmtD(a, y);
  const x = new Date(a), z = new Date(b);
  if (x.getUTCMonth() === z.getUTCMonth() && x.getUTCFullYear() === z.getUTCFullYear()) return `${x.getUTCDate()}–${fmtD(b, y)}`;
  return `${fmtD(a)} – ${fmtD(b, y)}`;
}
const fmtTime = t => new Date(t).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
const pct = v => (v == null || isNaN(v)) ? '—' : (Math.round(v * 10) / 10) + '%';
const fmtM3 = v => (v >= 100 ? Math.round(v) : (Math.round(v * 10) / 10)).toLocaleString('en-GB') + L(' m³', ' م³');
const fmtFloat = v => { const n = +v; if (isNaN(n)) return String(v); const t = `${n < 0 ? '−' : ''}${Math.abs(n)}`; return AR() ? `\u2066${t}\u2069 يوم` : `${t} d`; }; // Arabic: keep the minus on the left of the number
function localToday() { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');

/* ---------- State ---------- */
const S = {
  mode: 'status', floor: 'ALL', only: false, ghost: true, wp: false, win: 'next', useSite: true,
  focus: null, focusLabel: '', focusAct: null, focusItem: null, focusSite: null, focusCheck: null, hl: null,
  sel: -1, legendFilter: null, t: null, playing: false, weekFocus: false, delayFocus: false, changeFocus: false, pins: null, pinMap: null,
};
let DATA = null;      // dashboard data, see prepData
let SITE = [];        // site updates from the file
let SITEINFO = { problems: [], file: null, modified: null, text: '' };
let DRAFTS = [];      // site updates typed into this page, not yet in the file
let DOCS = { docs: [], problems: [], file: null, text: '' }; // documents.csv: WIR, MIR, photos, links
let CHECKS = [];      // programme checks
let M = null;         // model
let three = null;

/* ---------- Data loading ---------- */
function extractBundle(html) {
  const a = html.indexOf('/*__DATA_START__*/'), b = html.indexOf('/*__DATA_END__*/');
  if (a < 0 || b < 0) throw new Error('Dashboard data markers not found');
  return JSON.parse(html.slice(a + '/*__DATA_START__*/'.length, b));
}
async function fetchWithTimeout(url, ms, cache = 'no-store') {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { cache, signal: ctl.signal }); } finally { clearTimeout(tm); }
}
// Is this dashboard data usable? Returns null when it is, or a short reason when it is not.
function checkBundle(D) {
  if (!D || !Array.isArray(D.activities)) return L('it has no list of activities', 'لا تحتوي على قائمة أنشطة');
  if (D.activities.length < 20) return L(`it lists only ${D.activities.length} activities`, `تحتوي على ${D.activities.length} نشاطاً فقط`);
  const wk = Array.isArray(D.weeks) && D.dataDateIndex != null ? D.weeks[D.dataDateIndex] : null;
  if (parseDash((D.meta || {}).dataDate) == null && parseDash(wk) == null) return L('its data date cannot be read', 'تعذّرت قراءة تاريخ بياناتها');
  const ids = new Set(D.activities.map(a => a && a.id));
  const want = uniq(Object.values(WORK).flatMap(w => w.acts));
  const found = want.filter(id => ids.has(id)).length;
  if (found < want.length / 2) return L(`only ${found} of the ${want.length} activities the 4D uses are in it`, `فيها ${found} فقط من ${want.length} نشاطاً يستخدمها النموذج`);
  return null;
}
// Reads the dashboard. Returns { D, source } or { fail: 'unreachable' | 'format', why, source }.
async function loadLive() {
  let bad = null;
  for (const u of LIVE_SOURCES) {
    let r, text;
    try { r = await fetchWithTimeout(u, 10000, 'no-cache'); if (!r.ok) continue; text = await r.text(); } catch (e) { continue; }
    const source = new URL(u, location.href).href.replace(/\?.*$/, '');
    let D = null, why;
    try { D = extractBundle(text); why = checkBundle(D); }
    catch (e) {
      // a page that is not the dashboard at all (for example a "not found" page) counts as not reached
      if (!/FUR\.M\.C\.|furaih|__DATA_START__/i.test(text)) continue;
      why = /markers/.test(e.message) ? L('the data block is missing from the page', 'كتلة البيانات غير موجودة في الصفحة') : L('the data block could not be read', 'تعذّرت قراءة كتلة البيانات');
    }
    if (!why) return { D, source };
    bad = bad || { fail: 'format', why, source };
  }
  return bad || { fail: 'unreachable' };
}
// The last good copy is kept slim: only what the 4D reads.
function slimBundle(D) {
  const sc = D.scurve || {};
  return {
    meta: D.meta, weeks: D.weeks, dataDateIndex: D.dataDateIndex,
    scurve: { cumPlan: sc.cumPlan, cumAct: sc.cumAct }, packages: { Overall: (D.packages || {}).Overall },
    activities: D.activities.filter(a => a && a.id).map(({ id, name, plan, act, start, finish, float, cost }) => ({ id, name, plan, act, start, finish, float, cost })),
  };
}
function saveLastGood(D, source) {
  try {
    const old = readLastGood(); // a new week: keep the one before for "Last week"
    if (old && bundleDate(old.D) < bundleDate(D)) localStorage.setItem(PREV_KEY, JSON.stringify({ D: old.D, source: 'kept on this device' }));
    localStorage.setItem(LAST_GOOD_KEY, JSON.stringify({ savedAt: Date.now(), source, D: slimBundle(D) }));
  } catch (e) { /* storage full or blocked */ }
}
function readLastGood() {
  try { const j = JSON.parse(localStorage.getItem(LAST_GOOD_KEY) || 'null'); return j && j.D && !checkBundle(j.D) ? j : null; } catch (e) { return null; }
}
const bundleDate = D => parseDash((D.meta || {}).dataDate) ?? parseDash((D.weeks || [])[D.dataDateIndex]) ?? 0;
// Live is expected on the GitHub Pages link (add ?expectLive=1 to test the fallback elsewhere).
const liveExpected = () => /\.(github\.io|pages\.dev)$/i.test(location.hostname) || new URLSearchParams(location.search).has('expectLive');
/* Last week: the dashboard as it was one weekly update earlier, to show what was done since. Taken from this device's
   own copy, else the dashboard's history on GitHub (each weekly publish is a commit), else the copy saved with the 4D. */
let PREV = null;
const prevOf = (D, source) => ({ dataDate: bundleDate(D), acts: new Map(D.activities.filter(a => a && a.id).map(a => [a.id, Math.max(0, Math.min(100, +a.act || 0))])), source });
async function prevFromGitHub(cur) {
  const r = await fetchWithTimeout(`https://api.github.com/repos/${REPO}/commits?path=furah.html&per_page=30`, 8000, 'default');
  if (!r.ok) return null;
  let tries = 0;
  for (const c of await r.json()) {
    const m = /data date (\d{1,2}-[A-Za-z]{3}-\d{2,4})/i.exec(c?.commit?.message || '');
    const md = m ? parseDash(m[1]) : null;
    if (md != null && md >= cur) continue; // the same week or later
    if (++tries > 4) break;
    try {
      const raw = await fetchWithTimeout(`https://raw.githubusercontent.com/${REPO}/${c.sha}/furah.html`, 20000, 'default');
      if (!raw.ok) continue;
      const D = extractBundle(await raw.text());
      if (!checkBundle(D) && bundleDate(D) < cur) return { D, source: 'the dashboard history on GitHub' };
    } catch (e) { /* try an older one */ }
  }
  return null;
}
async function loadPrev() {
  const cur = DATA.dataDate;
  if (PREV && PREV.forDate === cur) return PREV;
  const keep = (D, source) => (PREV = { ...prevOf(D, source), forDate: cur });
  let local = null; try { local = JSON.parse(localStorage.getItem(PREV_KEY) || 'null'); } catch (e) { /* storage blocked */ }
  const okLocal = !!(local && local.D && !checkBundle(local.D) && bundleDate(local.D) < cur);
  if (okLocal && cur - bundleDate(local.D) <= 7 * DAY) return keep(local.D, local.source || 'kept on this device');
  try {
    const g = await prevFromGitHub(cur);
    if (g) { try { localStorage.setItem(PREV_KEY, JSON.stringify({ D: slimBundle(g.D), source: g.source })); } catch (e) { /* storage full */ } return keep(g.D, g.source); }
  } catch (e) { /* GitHub not reachable from here */ }
  if (okLocal) return keep(local.D, local.source || 'kept on this device');
  try { const r = await fetch('./snapshot-prev.json', { cache: 'no-store' }); if (r.ok) { const D = await r.json(); if (!checkBundle(D) && bundleDate(D) < cur) return keep(D, 'the copy saved with the 4D'); } } catch (e) { /* none */ }
  return (PREV = { none: true, forDate: cur });
}
/* Site updates file. CSV first (easy to edit in GitHub or Excel), the older JSON as a fallback. */
function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const head = text.split(/\r?\n/, 1)[0] || '';
  const cnt = ch => head.split(ch).length - 1;
  const delim = cnt(';') > cnt(',') ? ';' : cnt('\t') > cnt(',') ? '\t' : ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.map((r, i) => Object.assign(r, { line: i + 1 })).filter(r => r.some(x => x.trim() !== ''));
}
function parseAnyDate(s) {
  s = String(s || '').trim();
  let t = parseIso(s); if (t != null) return t;
  let m = /^(\d{1,2})[\s\-\/]+([A-Za-z]{3})[A-Za-z]*\.?[\s\-\/,]+(\d{2,4})$/.exec(s);
  if (m && MON[m[2].toLowerCase()] != null) return Date.UTC(+m[3] < 100 ? 2000 + +m[3] : +m[3], MON[m[2].toLowerCase()], +m[1]);
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s); // day first, as written in Saudi Arabia
  if (m) {
    let d = +m[1], mo = +m[2]; const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return Date.UTC(y, mo - 1, d);
  }
  return null;
}
function parsePct(s) {
  const v = String(s ?? '').trim().toLowerCase().replace(/\s*%$/, '');
  if (/^(done|complete|completed|finished|cast|yes)$/.test(v)) return 100;
  if (/^(not started|none|no)$/.test(v)) return 0;
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const n = +v; return n >= 0 && n <= 100 ? n : null;
}
function actKey(s) { // "SP.GF.6", "GF.06", "FUR.M.C.SP.GF.06" -> "FUR.M.C.SP.GF.06"
  let k = String(s || '').trim().toUpperCase().replace(/\s+/g, '').replace(/\.(\d)$/, '.0$1');
  if (!k) return null;
  if (k.startsWith('FUR.')) return k;
  if (/^(SP|SB)\./.test(k)) return 'FUR.M.C.' + k;
  if (/^(B1|GF|1ST|2ND|RF)\.\d+$/.test(k)) return 'FUR.M.C.SP.' + k;
  if (/^(CW|THE)\.\d+$/.test(k)) return 'FUR.M.C.SB.' + k;
  return 'FUR.M.C.' + k;
}
const isoDay = t => new Date(t).toISOString().slice(0, 10);
function groupSite(rows) { // one update per date, person and note
  const groups = new Map();
  for (const r of rows) {
    const key = r.t + '|' + r.by + '|' + r.note;
    if (!groups.has(key)) groups.set(key, { t: r.t, date: isoDay(r.t), by: r.by, note: r.note, progress: {}, lineOf: {}, draft: !!r.draft });
    const g = groups.get(key); g.progress[r.id] = r.v; g.lineOf[r.id] = r.line;
  }
  return [...groups.values()].sort((a, b) => a.t - b.t);
}
function siteFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { updates: [], problems: [] };
  const H = rows[0].map(h => h.trim().toLowerCase());
  const col = (...names) => H.findIndex(h => names.some(n => h === n || h.startsWith(n)));
  const ci = { date: col('date', 'day'), act: col('activity', 'id', 'code'), pct: col('percent', '%', 'progress', 'actual', 'status', 'done'), by: col('by', 'who', 'reported'), note: col('note', 'comment', 'remark', 'description') };
  if (ci.date < 0 || ci.act < 0 || ci.pct < 0) throw new Error(L('its first line must name the columns: date, activity, percent, by, note', 'يجب أن يحمل سطره الأول أسماء الأعمدة: date, activity, percent, by, note'));
  const problems = [], out = [];
  for (const r of rows.slice(1)) {
    const get = k => ci[k] >= 0 ? String(r[ci[k]] ?? '').trim() : '';
    if (get('date').startsWith('#')) continue; // a comment line
    const t = parseAnyDate(get('date')), id = actKey(get('act')), v = parsePct(get('pct'));
    if (t == null) { problems.push(L(`Line ${r.line}: "${get('date')}" is not a date. Write it like 2026-11-25 or 25/11/2026.`, `السطر ${r.line}: "${get('date')}" ليس تاريخاً. اكتبه هكذا 2026-11-25 أو 25/11/2026.`)); continue; }
    if (!id) { problems.push(L(`Line ${r.line}: the activity is empty.`, `السطر ${r.line}: النشاط فارغ.`)); continue; }
    if (v == null) { problems.push(L(`Line ${r.line}: "${get('pct')}" is not a percent from 0 to 100.`, `السطر ${r.line}: "${get('pct')}" ليس نسبة من 0 إلى 100.`)); continue; }
    out.push({ t, id, v, by: get('by'), note: get('note'), line: r.line });
  }
  return { updates: groupSite(out), problems };
}
function siteFromJson(text) {
  const j = JSON.parse(text); const out = []; const problems = [];
  (Array.isArray(j.updates) ? j.updates : []).forEach((u, i) => {
    const t = parseAnyDate(u && u.date);
    if (t == null || !u.progress || typeof u.progress !== 'object') { problems.push(L(`Entry ${i + 1}: needs a date and a progress list.`, `المدخل ${i + 1}: يحتاج تاريخاً وقائمة إنجاز.`)); return; }
    for (const [k, val] of Object.entries(u.progress)) {
      const v = parsePct(val); if (v == null) { problems.push(L(`Entry ${i + 1}: "${val}" is not a percent from 0 to 100.`, `المدخل ${i + 1}: "${val}" ليس نسبة من 0 إلى 100.`)); continue; }
      out.push({ t, id: actKey(k), v, by: u.by || '', note: u.note || '', line: i + 1 });
    }
  });
  return { updates: groupSite(out), problems };
}
async function loadSiteFile() {
  for (const f of SITE_FILES) {
    let r;
    try { r = await fetchWithTimeout(f + '?t=' + Date.now(), 6000); } catch (e) { continue; }
    if (!r.ok) continue;
    const text = await r.text(); const file = f.replace('./', '');
    const modified = Date.parse(r.headers.get('last-modified') || '') || null;
    try { return { ...(f.endsWith('.csv') ? siteFromCsv(text) : siteFromJson(text)), file, modified, text }; }
    catch (e) { return { updates: [], problems: [L(`The file could not be read: ${e.message}.`, `تعذّرت قراءة الملف: ${e.message}.`)], file, modified, text }; }
  }
  return { updates: [], problems: [], file: null, modified: null, text: '' };
}
/* Documents file: WIR, MIR, photos and other links for activities (documents.csv next to the page).
   Columns: date, activity, type, ref, status, link, note. Lines starting with # are ignored. */
const DOC_STATUS = { A: 'Approved', B: 'Approved as noted', C: 'Revise and resubmit', D: 'Rejected' };
const DOC_STATUS_AR = { A: 'معتمد', B: 'معتمد مع ملاحظات', C: 'يُعدَّل ويُعاد تقديمه', D: 'مرفوض' };
const DOC_TYPE_AR = { document: 'مستند', photo: 'صورة', photos: 'صور', drawing: 'مخطط', report: 'تقرير', video: 'فيديو', letter: 'خطاب', test: 'اختبار' };
const docType = t => AR() ? (DOC_TYPE_AR[String(t).toLowerCase()] || t) : t;
function docsFromCsv(text) {
  const rows = parseCsv(text).filter(r => !String(r[0] ?? '').trim().startsWith('#'));
  if (!rows.length) return { docs: [], problems: [] };
  const H = rows[0].map(h => h.trim().toLowerCase());
  const col = (...names) => H.findIndex(h => names.some(n => h === n || h.startsWith(n)));
  const ci = { date: col('date', 'day'), act: col('activity', 'id', 'code'), type: col('type', 'kind', 'doc'), ref: col('ref', 'number', 'no.', 'doc no'), status: col('status', 'result', 'code '), link: col('link', 'url', 'sharepoint', 'file'), note: col('note', 'title', 'description', 'comment') };
  if (ci.act < 0 || ci.link < 0) throw new Error(L('its first line must name the columns: date, activity, type, ref, status, link, note', 'يجب أن يحمل سطره الأول أسماء الأعمدة: date, activity, type, ref, status, link, note'));
  const problems = [], docs = [];
  for (const r of rows.slice(1)) {
    const get = k => ci[k] >= 0 ? String(r[ci[k]] ?? '').trim() : '';
    const ids = get('act').split(/[\s;+&]+/).map(actKey).filter(Boolean);
    const link = get('link'), t = get('date') ? parseAnyDate(get('date')) : null;
    if (!ids.length) { problems.push(L(`Line ${r.line}: the activity is empty.`, `السطر ${r.line}: النشاط فارغ.`)); continue; }
    if (link && !/^https?:\/\//i.test(link)) { problems.push(L(`Line ${r.line}: the link must start with https://`, `السطر ${r.line}: يجب أن يبدأ الرابط بـ https://`)); continue; }
    if (get('date') && t == null) problems.push(L(`Line ${r.line}: "${get('date')}" is not a date, so it is shown without one.`, `السطر ${r.line}: "${get('date')}" ليس تاريخاً، لذا يُعرض بدون تاريخ.`));
    const st = get('status'); const code = st.toUpperCase();
    docs.push({ t, ids, type: get('type') || 'Document', ref: get('ref'), status: DOC_STATUS[code] ? `${code} · ${L(DOC_STATUS[code], DOC_STATUS_AR[code])}` : st, code: DOC_STATUS[code] ? code : '', link, note: get('note'), line: r.line });
  }
  return { docs, problems };
}
async function loadDocsFile() {
  let r;
  try { r = await fetchWithTimeout('./documents.csv?t=' + Date.now(), 6000); } catch (e) { return { docs: [], problems: [], file: null, text: '' }; }
  if (!r.ok) return { docs: [], problems: [], file: null, text: '' };
  const text = await r.text();
  try { return { ...docsFromCsv(text), file: 'documents.csv', text }; }
  catch (e) { return { docs: [], problems: [L(`The file could not be read: ${e.message}.`, `تعذّرت قراءة الملف: ${e.message}.`)], file: 'documents.csv', text }; }
}
const docsFor = ids => DOCS.docs.filter(d => d.ids.some(id => ids.includes(id))).sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
function prepData(D, live, source) {
  const acts = new Map();
  for (const a of D.activities || []) {
    if (!a || !a.id) continue;
    const rs = parseIso(a.start), rf = parseIso(a.finish);
    let s = rs ?? rf, f = rf ?? rs;
    const reversed = rs != null && rf != null && rf < rs;
    if (reversed) { s = rf; f = rs; }
    const act = Math.max(0, Math.min(100, +a.act || 0));
    acts.set(a.id, { id: a.id, short: a.id.replace('FUR.M.C.', ''), name: cleanName(a.name), plan: +a.plan || 0, dashAct: act, act,
      start: s, finish: f, rawStart: rs, rawFinish: rf, reversed, float: a.float, cost: +a.cost || 0, stage: stageOf(String(a.name || '')), site: null });
  }
  const meta = D.meta || {};
  const wk = D.weeks && D.dataDateIndex != null ? D.weeks[D.dataDateIndex] : null;
  const dataDate = parseDash(meta.dataDate) ?? parseDash(wk) ?? localToday();
  const sc = D.scurve || {}; const di = D.dataDateIndex;
  const overall = (D.packages || {}).Overall || {};
  const kpi = {
    planCum: sc.cumPlan && di != null ? sc.cumPlan[di] : overall.plan, actCum: sc.cumAct && di != null ? sc.cumAct[di] : overall.act,
    spi: overall.spi, finish: meta.forecastFinish, blFinish: meta.blFinish,
  };
  const all = [...acts.values()];
  const start = parseIso(meta.blStartISO) ?? Math.min(...all.map(a => a.start).filter(x => x != null));
  const end = Math.max(parseIso(meta.forecastFinishISO) ?? 0, ...all.map(a => a.finish).filter(x => x != null));
  const hash = meta.dataDate + ':' + (D.activities || []).map(a => [a.id, a.plan, a.act, a.start, a.finish].join('|')).join(';').length + ':' +
    (D.activities || []).reduce((s, a) => s + (+a.act || 0) * 7 + (+a.plan || 0) * 3 + (parseIso(a.start) || 0) / 1e9, 0).toFixed(3);
  return { acts, meta, dataDate, kpi, start, end, live, source, hash, checked: Date.now(), project: meta.project || 'Al-Furaih Villa', origin: D._source || null };
}
async function loadData() {
  const live = await loadLive();
  if (live.D) { saveLastGood(live.D, live.source); return prepData(live.D, true, live.source); }
  return fallbackData(live);
}
// The dashboard could not be used: show the newer of the last good copy on this device and the saved snapshot.
async function fallbackData(fail) {
  const lg = readLastGood();
  let snap = null;
  try { const r = await fetch('./snapshot.json', { cache: 'no-store' }); if (r.ok) { const D = await r.json(); if (!checkBundle(D)) snap = D; } } catch (e) { /* no snapshot */ }
  let d;
  if (lg && (!snap || bundleDate(lg.D) >= bundleDate(snap))) { d = prepData(lg.D, false, 'lastGood'); d.savedAt = lg.savedAt; d.savedFrom = lg.source; }
  else if (snap) d = prepData(snap, false, 'snapshot');
  else throw new Error(fail.fail === 'format' ? L(`The dashboard was reached but its data could not be read (${fail.why}).`, `تم الوصول إلى لوحة المتابعة لكن تعذّرت قراءة بياناتها (${fail.why}).`) : L('No dashboard data could be loaded.', 'تعذّر تحميل أي بيانات من لوحة المتابعة.'));
  d.fail = liveExpected() || fail.fail === 'format' ? { ...fail, at: Date.now() } : null;
  return d;
}
// Site updates newer than the dashboard's data date replace the dashboard's actual %.
// Drafts (typed into this page, not yet in the file) count the same way, marked as drafts.
function applySite() {
  for (const a of DATA.acts.values()) { a.act = a.dashAct; a.site = null; }
  const today = localToday();
  const all = [...SITE, ...DRAFTS].sort((a, b) => a.t - b.t);
  DATA.siteFuture = all.filter(u => u.t > today); // a date after today is almost always a typing slip, so it is not used
  DATA.siteActive = all.filter(u => u.t > DATA.dataDate && u.t <= today);
  DATA.siteOld = all.filter(u => u.t <= DATA.dataDate);
  DATA.siteUsed = S.useSite ? DATA.siteActive : [];
  DATA.siteUnknown = [];
  for (const u of all) for (const k of Object.keys(u.progress)) if (!DATA.acts.has(k)) DATA.siteUnknown.push({ u, k });
  for (const u of DATA.siteUsed) for (const [k, v] of Object.entries(u.progress)) {
    const a = DATA.acts.get(k); if (!a) continue;
    a.act = Math.max(0, Math.min(100, v));
    a.site = { t: u.t, by: u.by, note: u.note, v: a.act, from: a.dashAct, draft: u.draft };
  }
  DATA.asOf = Math.max(DATA.dataDate, ...DATA.siteUsed.map(u => u.t));
}

/* ---------- Progress logic ---------- */
const isStruct = a => /^FUR\.M\.C\.(SB|SP)\./.test(a.id);
function plannedAt(a, t) { // % complete at day t, spread evenly over the activity's dates
  if (a.start == null) return 0;
  const s = a.start, f = a.finish + DAY;
  if (t >= f) return 100; if (t < s) return 0;
  return Math.max(0, Math.min(100, (t - s) / (f - s) * 100));
}
function valueAt(a, t) { // timeline: the dates, but never below what had been reported by that day
  let v = plannedAt(a, t);
  if (t >= DATA.dataDate) v = Math.max(v, a.dashAct);
  if (a.site && t >= a.site.t) v = Math.max(v, a.site.v);
  return v;
}
function linked(w) { return w.acts.map(id => DATA.acts.get(id)).filter(Boolean); }
function itemState(w, valueOf) {
  const acts = linked(w);
  if (!acts.length) return { s: 'nolink' };
  const vals = acts.map(a => ({ a, p: valueOf(a) }));
  const defining = vals.filter(v => ['cast', 'block', 'blockwork', 'wp'].includes(v.a.stage));
  const set = defining.length ? defining : vals;
  if (set.every(v => v.p >= 99.5)) return { s: 'built' };
  const started = vals.filter(v => v.p > 0);
  if (started.length) {
    started.sort((x, y) => STAGES[y.a.stage].order - STAGES[x.a.stage].order);
    const cur = started[0];
    const nextUp = vals.filter(v => v.p < 99.5 && STAGES[v.a.stage].order > STAGES[cur.a.stage].order).sort((x, y) => STAGES[x.a.stage].order - STAGES[y.a.stage].order)[0];
    return { s: 'prog', stage: cur.a.stage, p: cur.p, a: cur.a, done: cur.p >= 99.5, next: nextUp ? nextUp.a : null };
  }
  return { s: 'none' };
}
function itemsOfAct(id) { return Object.values(WORK).filter(w => w.acts.includes(id)); }
function castM3(a) { return a.stage === 'cast' ? sum(itemsOfAct(a.id), w => w.m3) : 0; }

/* Look-ahead windows: weeks run Friday to Thursday, in step with the dashboard's weekly (Thursday) data date. */
function windows() {
  const c0 = DATA.dataDate + DAY;
  const k0 = Math.max(0, Math.floor((localToday() - c0) / (7 * DAY)));
  const wk = k => ({ from: c0 + (k0 + k) * 7 * DAY, to: c0 + (k0 + k) * 7 * DAY + 6 * DAY });
  const tw = wk(0), nw = wk(1), w3 = wk(2);
  return {
    this: { ...tw, label: L('This week', 'هذا الأسبوع'), name: L('this week', 'هذا الأسبوع') },
    next: { ...nw, label: L('Next week', 'الأسبوع القادم'), name: L('next week', 'الأسبوع القادم') },
    three: { from: tw.from, to: w3.to, label: L('3 weeks', '3 أسابيع'), name: L('the next 3 weeks', 'الأسابيع الثلاثة القادمة') },
  };
}
const curWin = () => windows()[S.win];
const GROUPS = ['carried', 'progress', 'starting'];
const groupLabel = (g, w) => ({ carried: L(`Carried over: due before ${fmtD(w.from)}, not reported done`, `مرحّل: كان مستحقاً قبل ${fmtD(w.from)} ولم يُبلَّغ عن إنجازه`), progress: L('In progress', 'قيد التنفيذ'), starting: L('Starting', 'يبدأ') }[g]);
function lookAhead(w) { // structural activities not finished and due to start by the end of the window
  const order = { carried: 0, progress: 1, starting: 2 };
  return [...DATA.acts.values()].filter(a => isStruct(a) && a.act < 100 && a.start != null && a.start <= w.to)
    .map(a => {
      const carried = a.finish < w.from;
      return { a, group: carried ? 'carried' : a.act > 0 ? 'progress' : 'starting', lateStart: !carried && a.act <= 0 && a.start < w.from };
    })
    .sort((x, y) => order[x.group] - order[y.group] || x.a.start - y.a.start || x.a.id.localeCompare(y.a.id));
}
function pours(la) {
  return la.filter(x => x.a.stage === 'cast').map(x => {
    const items = itemsOfAct(x.a.id).filter(w => w.m3 > 0);
    return { a: x.a, items, m3: sum(items, w => w.m3), t: x.a.start, carried: x.group === 'carried' };
  }).filter(p => p.items.length).sort((p, q) => p.t - q.t);
}
function pva(w) { // plan vs actual uses the dashboard's own figures at its data date
  const acts = linked(w);
  if (!acts.length) return { s: 'nolink' };
  const plan = sum(acts, a => a.plan) / acts.length, act = sum(acts, a => a.dashAct) / acts.length;
  if (plan <= 0 && act <= 0) return { s: 'notdue', plan, act };
  const overdue = acts.some(a => a.plan >= 99.5 && a.dashAct < 99.5);
  if (act - plan >= -5) return { s: 'ontrack', plan, act };
  return { s: overdue ? 'late' : 'behind', plan, act };
}
// Days late against the baseline, for an activity behind plan at the data date. The dashboard gives the baseline %
// at the data date (plan) and the current forecast dates, not the baseline dates. If the baseline had it finished by
// the data date, it is at least (forecast finish - data date) late. If the baseline had it part done, the baseline
// finish is about the data date plus the part still to come, at the same duration.
function lateDays(a) {
  if (a.dashAct >= 99.5 || a.start == null || a.plan <= 0 || a.plan - a.dashAct < 0.5) return null;
  const dur = (a.finish - a.start) / DAY + 1, end = DATA.dataDate + DAY;
  const blEnd = a.plan >= 99.5 ? end : end + (1 - a.plan / 100) * dur * DAY;
  const fcEnd = Math.max(a.finish + DAY, end + (1 - a.dashAct / 100) * dur * DAY); // dates in the past still need the work left
  return { d: Math.max(0, Math.round((fcEnd - blEnd) / DAY)), atLeast: a.plan >= 99.5, fcEnd };
}
// Top delays: work items behind plan, the most days late first.
function delayItems() {
  const out = [];
  for (const w of Object.values(WORK)) {
    if (!w.els.length) continue;
    const r = pva(w); if (r.s !== 'late' && r.s !== 'behind') continue;
    let worst = null;
    for (const a of linked(w)) { const ld = lateDays(a); if (ld && (!worst || ld.d > worst.d)) worst = { ...ld, a }; }
    out.push({ w, group: r.s, plan: r.plan, act: r.act, days: worst ? worst.d : 0, atLeast: !!worst?.atLeast, a: worst?.a || null });
  }
  out.sort((x, y) => y.days - x.days || (x.act - x.plan) - (y.act - y.plan));
  out.forEach((o, i) => { o.n = i + 1; });
  return out;
}
// Last week: work items that moved on since the previous weekly update (and site updates since).
function changeItems() {
  if (!PREV || PREV.none) return [];
  const before = a => PREV.acts.get(a.id) ?? 0;
  const out = [];
  for (const w of Object.values(WORK)) {
    if (!w.els.length) continue;
    const xs = linked(w).filter(a => a.act > before(a) + 0.5).map(a => ({ a, from: before(a), to: a.act, site: !!(a.site && a.site.t > DATA.dataDate) }));
    if (!xs.length) continue;
    const c0 = castFrac(w, before), c1 = castFrac(w, a => a.act);
    out.push({ kind: 'change', w, group: c1 > c0 + 0.005 ? 'chcast' : 'chprog', xs: xs.sort((x, y) => STAGES[x.a.stage].order - STAGES[y.a.stage].order), m3: w.m3 * Math.max(0, c1 - c0) });
  }
  out.sort((x, y) => (x.group === y.group ? 0 : x.group === 'chcast' ? -1 : 1) || PKG[x.w.pkg].i - PKG[y.w.pkg].i || y.m3 - x.m3);
  out.forEach((o, i) => { o.n = i + 1; });
  return out;
}
const daysText = o => o.days ? L(`${o.atLeast ? 'at least ' : 'about '}${plural(o.days, 'day')} late`, `متأخر ${o.atLeast ? 'على الأقل ' : 'حوالي '}${cnt(o.days, 'day', true)}`) : L('behind plan', 'خلف الخطة');
// Share of a work item's concrete that is cast: its casting activities' %, or built / not built.
function castFrac(w, valueOf) {
  const c = linked(w).filter(a => a.stage === 'cast');
  if (!c.length) return itemState(w, valueOf).s === 'built' ? 1 : 0;
  return sum(c, a => Math.max(0, Math.min(100, valueOf(a)))) / c.length / 100;
}
// Concrete cast by floor: actual (with site updates) and the baseline plan at the data date.
function floorProgress() {
  const rows = PKGS.map(p => {
    const ws = Object.values(WORK).filter(w => w.pkg === p.k && w.m3 > 0);
    return { p, tot: sum(ws, w => w.m3), cast: sum(ws, w => w.m3 * castFrac(w, a => a.act)), plan: sum(ws, w => w.m3 * castFrac(w, a => a.plan)) };
  }).filter(r => r.tot > 0);
  const all = { tot: sum(rows, r => r.tot), cast: sum(rows, r => r.cast), plan: sum(rows, r => r.plan) };
  return { rows, all };
}
function concreteCast() { const { all } = floorProgress(); return all; }
// Next-week focus: each work item in the look-ahead, with the group it falls in and its activities.
function weekItems() {
  const w = curWin(); const la = lookAhead(w); const out = new Map();
  const rank = { carried: 0, progress: 1, starting: 2 };
  for (const x of la) for (const it of itemsOfAct(x.a.id)) {
    if (!it.els.length) continue;
    if (!out.has(it.key)) out.set(it.key, { w: it, group: x.group, xs: [] });
    const o = out.get(it.key); o.xs.push(x); if (rank[x.group] < rank[o.group]) o.group = x.group;
  }
  const list = [...out.values()].sort((a, b) => rank[a.group] - rank[b.group] || Math.min(...a.xs.map(x => x.a.start)) - Math.min(...b.xs.map(x => x.a.start)));
  list.forEach((o, i) => { o.n = i + 1; });
  return list;
}

/* ---------- Programme checks ---------- */
// Two ways out of a "planned before what it stands on" clash, with the dates they imply.
function seqFix(r, X, first, yEnd, siteFirst) {
  const from = yEnd + DAY; const later = Math.round((from - first.start) / DAY);
  if (AR()) {
    const out = [{ k: 'إعادة التسلسل', t: `ابدأ ${wName(X)} (${first.short}) بعد صب ${r.onAr}. هذا يتبع النموذج وجدول الكميات${siteFirst ? ' والترتيب في الموقع' : ''}. بتواريخ البرنامج يكون ذلك حوالي ${fmtD(from)}، أي بعد المخطط بمقدار ${cnt(later, 'day', true)}${siteFirst ? '؛ والموقع متقدم على تواريخ البلاطة، لذا فالإزاحة الفعلية أقل' : ''}. أعد مراجعة الأعمال التي تليها.` }];
    if (r.y.some(k => /SLAB|HRD/.test(k))) out.push({ k: 'تقسيم الصبة', t: `صُبّ ${r.onShortAr} على مراحل. يمكن بدء ${wName(X)} على المرحلة الأولى بمجرد صبها، مما يُبقي التواريخ أقرب إلى البرنامج.` });
    return out;
  }
  const what = X.name.replace(/^./, c => c.toLowerCase()); const they = /parapet/i.test(X.name) ? 'It' : 'They';
  const out = [{ k: 'Re-sequence', t: `Start the ${what} (${first.short}) after ${r.on} ${r.be} cast. This follows the model and the BOQ${siteFirst ? ', and the order on site' : ''}. With the programme's dates that is about ${fmtD(from)}, ${plural(later, 'day')} later than planned${siteFirst ? '; site is ahead of those slab dates, so the real shift is smaller' : ''}. Re-check the work that follows ${they === 'It' ? 'it' : 'them'}.` }];
  if (r.y.some(k => /SLAB|HRD/.test(k))) out.push({ k: 'Split the pour', t: `Cast ${r.on.replace(/ (they|it) (stand|stands|sit|sits) on$/, '')} in zones. The ${what} on the first zone can start once that zone is cast, which keeps the dates closer to the programme.` });
  return out;
}
function computeChecks() {
  const out = [];
  for (const r of RESTS_ON) {
    const X = WORK[r.x]; const xa = linked(X).filter(a => a.start != null);
    if (!xa.length || xa.every(a => a.act >= 100)) continue;
    const ya = r.y.flatMap(k => linked(WORK[k])).filter(a => a.stage === 'cast' && a.finish != null);
    if (!ya.length) continue;
    const first = xa.reduce((m, a) => a.start < m.start ? a : m);
    const yEnd = Math.max(...ya.map(a => a.finish)), yStart = Math.min(...ya.map(a => a.start));
    if (first.start > yEnd) continue;
    const yAll = r.y.flatMap(k => linked(WORK[k]));
    const siteFirst = yAll.some(a => a.act > 0) && xa.every(a => a.act <= 0);
    const ySite = yAll.filter(a => a.site && a.act > 0);
    const wentFirst = r.y.map(k => WORK[k]).filter(w => linked(w).some(a => a.act > 0));
    const siteAt = ySite.length ? fmtD(Math.max(...ySite.map(a => a.site.t))) : null;
    out.push({
      kind: 'seq', id: 'seq:' + r.x, fl: r.fl, x: [r.x], y: r.y, title: L(r.title, r.titleAr),
      text: AR() ? `${wName(X)} تبدأ ${fmtD(first.start)} (${first.short})، بينما يُصب ${r.onAr} في ${fmtRange(yStart, yEnd)} (${uniq(ya.map(a => a.short)).join('، ')}).` +
          (siteFirst ? ` في الموقع نُفّذ ${listJoin(wentFirst.map(wName))} أولاً${siteAt ? ` (تحديث الموقع ${siteAt})` : ''}.` : '')
        : `${X.name} start ${fmtD(first.start)} (${first.short}), but ${r.on} ${r.be} cast ${fmtRange(yStart, yEnd)} (${uniq(ya.map(a => a.short)).join(', ')}).` +
          (siteFirst ? ` On site the ${wentFirst.map(w => w.name.replace(/^./, c => c.toLowerCase())).join(' and ')} went first${siteAt ? ` (site update ${siteAt})` : ''}.` : ''),
      legend: [['--late', L('Planned too early', 'مخطط مبكراً جداً')], ['--next', L('What it stands on', 'ما يقوم عليه')]],
      fix: seqFix(r, X, first, yEnd, siteFirst),
    });
  }
  for (const a of DATA.acts.values()) {
    if (!isStruct(a)) continue;
    const probs = [];
    if (a.reversed) probs.push(L(`its start date (${fmtD(a.rawStart)}) is after its finish date (${fmtD(a.rawFinish)})`, `تاريخ بدايته (${fmtD(a.rawStart)}) بعد تاريخ نهايته (${fmtD(a.rawFinish)})`));
    if (a.dashAct > 0 && a.start != null && a.start > DATA.dataDate) probs.push(L(`it shows ${pct(a.dashAct)} done although it has not reached its start date`, `يظهر منجزاً بنسبة ${pct(a.dashAct)} رغم أنه لم يصل إلى تاريخ بدايته`));
    if (a.dashAct >= 100 && a.finish != null && a.finish > DATA.dataDate) probs.push(L(`it shows complete although its finish date (${fmtD(a.finish)}) is after the data date`, `يظهر مكتملاً رغم أن تاريخ نهايته (${fmtD(a.finish)}) بعد تاريخ البيانات`));
    if (!probs.length) continue;
    const keys = itemsOfAct(a.id).filter(w => w.els.length).map(w => w.key);
    const what = keys.length ? (AR() ? wName(WORK[keys[0]]) : WORK[keys[0]].name.toLowerCase()) : (AR() ? aName(a) : a.name.toLowerCase());
    out.push({ kind: 'data', id: 'data:' + a.id, x: keys, y: [], act: a.id, title: L(`Dates to check: ${a.short}, ${what}`, `تواريخ للمراجعة: ${a.short}، ${what}`),
      text: L(`In the dashboard ${listJoin(probs)}.`, `في لوحة المتابعة ${listJoin(probs)}.`), legend: [['--form', L('Elements of this activity', 'عناصر هذا النشاط')]] });
  }
  for (const w of Object.values(WORK)) if (w.els.length && !w.acts.length)
    out.push({ kind: 'info', id: 'info:' + w.key, x: [w.key], y: [], title: L(`${w.name} has no activity in the dashboard`, `${wName(w)}: لا يوجد نشاط في لوحة المتابعة`),
      text: L(`${plural(w.els.length, 'element')} in the model, shown as "not in the programme".`, `${cnt(w.els.length, 'element')} في النموذج، تظهر بلون "غير موجود في البرنامج الزمني".`), legend: [['--form', wName(w)]] });
  for (const w of Object.values(WORK)) if (w.upper && w.els.length) {
    const bm = WORK[w.pkg + '/BEAM'];
    out.push({ kind: 'info', id: 'info:' + w.key, x: [w.key], y: [], title: AR() ? `${cnt(w.els.length, 'beam')} بين الأدوار تحمل رمز كمرات ${PKG[w.pkg].longAr}` : `${plural(w.els.length, 'beam')} between floors ${w.els.length === 1 ? 'carries' : 'carry'} the ${PKG[w.pkg].long.toLowerCase()} beam code`,
      text: AR() ? `تقع بين ${FLOORLV[w.pkg][0]} و ${FLOORLV[w.pkg][1] === 'roof' ? 'السطح' : FLOORLV[w.pkg][1]} فوق ${wName(bm)}، لذا لا يمكن تنفيذها معها. يعرضها النموذج مع أعمدة ${PKG[w.pkg].longAr}. يرجى تأكيد النشاط الذي يغطيها.`
        : `${w.els.length === 1 ? 'It sits' : 'They sit'} between ${FLOORLV[w.pkg][0]} and ${FLOORLV[w.pkg][1]}, above the ${bm.name.toLowerCase()}, so ${w.els.length === 1 ? 'it' : 'they'} cannot go up with them. The 4D shows ${w.els.length === 1 ? 'it' : 'them'} with the ${PKG[w.pkg].long.toLowerCase()} columns. Confirm which activity covers them.`,
      legend: [['--form', wName(w)]] });
  }
  if (WORK['RF/BLK'].els.length)
    out.push({ kind: 'info', id: 'info:RF/BLK', x: ['RF/BLK'], y: [], title: L('Roof siporex blocks have no activity of their own', 'بلوك سيبوركس السطح ليس له نشاط مستقل'),
      text: L('The 4D shows them with the roof hordi slab (RF.13 to RF.16).', 'يعرضه النموذج مع بلاطة هوردي السطح (RF.13 إلى RF.16).'), legend: [['--form', L('Roof siporex blocks', 'بلوك سيبوركس السطح')]] });
  return out;
}

/* ---------- Colour schemes ---------- */
const weekOn = () => S.weekFocus && S.mode === 'status';
const delayOn = () => S.delayFocus && S.mode === 'pva';
const changeOn = () => S.changeFocus && S.mode === 'status' && !!PREV && !PREV.none;
const pinsOn = () => weekOn() || delayOn() || changeOn();
const prevDate = () => PREV && !PREV.none ? fmtD(PREV.dataDate) : L('last week', 'الأسبوع الماضي');
const T_ELSE = () => L('Everything else', 'باقي العناصر');
const T_NOPROG = () => L('Not in the programme', 'غير موجود في البرنامج الزمني');
const T_LATE = () => L(`Late: the baseline had it finished by ${fmtD(DATA.dataDate)}`, `متأخر: كان يجب أن ينتهي بحلول ${fmtD(DATA.dataDate)} حسب الخطة الأساسية`);
const T_BEHIND = () => L('Behind the baseline plan', 'خلف الخطة الأساسية');
function legendDefs() {
  if (changeOn()) return [
    { k: 'chcast', label: L(`Concrete cast since ${prevDate()}`, `صُبّت الخرسانة منذ ${prevDate()}`), c: '--built' },
    { k: 'chprog', label: L(`Moved on since ${prevDate()}, not cast yet`, `تقدّم منذ ${prevDate()} ولم يُصب بعد`), c: '--rebar' },
    { k: 'chbefore', label: L(`Built before ${prevDate()}`, `منفّذ قبل ${prevDate()}`), c: '--before' },
    { k: 'dim', label: L('Not built yet', 'لم يُنفّذ بعد'), c: 'ghost' },
  ];
  if (delayOn()) return [
    { k: 'late', label: T_LATE(), c: '--late' },
    { k: 'behind', label: T_BEHIND(), c: '--rebar' },
    { k: 'dim', label: T_ELSE(), c: 'ghost' },
  ];
  if (weekOn()) { const w = curWin(); return [
    { k: 'wkcarried', label: L(`Carried over: due before ${fmtD(w.from)}`, `مرحّل: كان مستحقاً قبل ${fmtD(w.from)}`), c: '--late' },
    { k: 'wkprogress', label: L('In progress', 'قيد التنفيذ'), c: '--rebar' },
    { k: 'wkstarting', label: L(`Starting by ${fmtD(w.to)}`, `يبدأ حتى ${fmtD(w.to)}`), c: '--next' },
    { k: 'dim', label: T_ELSE(), c: 'ghost' },
  ]; }
  if (S.mode === 'pva') return [
    { k: 'ontrack', label: L('On plan or ahead', 'حسب الخطة أو متقدم'), c: '--built' },
    { k: 'behind', label: T_BEHIND(), c: '--rebar' },
    { k: 'late', label: T_LATE(), c: '--late' },
    { k: 'notdue', label: L('Not due yet', 'لم يحن موعده'), c: 'ghost' },
    { k: 'nolink', label: T_NOPROG(), c: 'ghost' },
  ];
  const w = curWin();
  return [
    { k: 'built', label: L('Built: concrete cast', 'منفّذ: تم صب الخرسانة'), c: '--built' },
    { k: 'form', label: L('Formwork or blocks', 'الشدات أو البلوك'), c: '--form' },
    { k: 'rebar', label: L('Steel fixing, or fixed and waiting for concrete', 'تركيب الحديد، أو جاهز بانتظار الصب'), c: '--rebar' },
    { k: 'cast', label: L('Being cast', 'جارٍ الصب'), c: '--cast' },
    ...(S.mode === 'status' ? [{ k: 'next', label: L(`Planned by ${fmtD(w.to)} (${w.name})`, `مخطط حتى ${fmtD(w.to)} (${w.name})`), c: '--next' }] : []),
    { k: 'none', label: S.mode === 'time' ? L('Not started on this date', 'لم يبدأ في هذا التاريخ') : L('Not started yet', 'لم يبدأ بعد'), c: 'ghost' },
    { k: 'nolink', label: T_NOPROG(), c: 'ghost' },
  ];
}
function classOf(w) { // which legend key a work item falls in, for the current mode
  if (S.hl) return S.hl.map.has(w.key) ? 'hl' + S.hl.map.get(w.key) : 'dim';
  if (weekOn()) { const o = S.pinMap?.get(w.key); return o ? 'wk' + o.group : 'dim'; }
  if (delayOn()) { const o = S.pinMap?.get(w.key); return o ? o.group : 'dim'; }
  if (changeOn()) { const o = S.pinMap?.get(w.key); return o ? o.group : itemState(w, a => a.act).s === 'built' ? 'chbefore' : 'dim'; }
  if (S.mode === 'pva') return pva(w).s;
  const t = S.mode === 'time' ? S.t : null;
  const st = itemState(w, a => t == null ? a.act : valueAt(a, t));
  if (st.s === 'prog') return st.stage === 'rebar' ? 'rebar' : st.stage === 'cast' || st.stage === 'strip' ? 'cast' : 'form';
  if (st.s === 'none' && S.mode === 'status' && S.nextSet?.has(w.key)) return 'next';
  return st.s;
}

/* ---------- Model loading ---------- */
// Fetch JSON and report how much has arrived, for the loading bar.
async function fetchJsonProgress(url, expected, onp) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(L(`${url.replace('./', '')} could not be loaded (${r.status})`, `تعذّر تحميل ${url.replace('./', '')} (${r.status})`));
  const len = +r.headers.get('content-length') || 0;
  const total = !r.headers.get('content-encoding') && len ? len : expected;
  if (!r.body || !r.body.getReader) { const j = await r.json(); onp(1); return j; }
  const rd = r.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; onp(Math.min(0.99, got / total)); }
  const all = new Uint8Array(got); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  onp(1);
  return JSON.parse(new TextDecoder().decode(all));
}
async function loadModel(onp = () => {}) {
  const layer = LAYERS.find(l => l.on); // one layer today; extra layers would be read here and appended the same way
  const mj = await fetchJsonProgress(layer.file, layer.bytes, onp);
  let buf;
  if (mj.bin) { const raw = atob(mj.bin); const u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i); buf = u8.buffer; delete mj.bin; }
  else buf = await fetch('./model.bin').then(r => { if (!r.ok) throw new Error('model.bin ' + r.status); return r.arrayBuffer(); });
  const H = mj.header, [ox, oy, oz] = H.origin;
  const q = new Uint16Array(buf, 0, H.vertexCount * 3), li = new Uint16Array(buf, H.posBytes, H.indexCount);
  const pos = new Float32Array(H.vertexCount * 3);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < H.vertexCount; i++) {
    const x = q[3 * i] * H.unit + ox, y = q[3 * i + 1] * H.unit + oy, z = q[3 * i + 2] * H.unit + oz;
    pos[3 * i] = x; pos[3 * i + 1] = z; pos[3 * i + 2] = -y;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minY) minY = z; if (z > maxY) maxY = z; if (-y < minZ) minZ = -y; if (-y > maxZ) maxZ = -y;
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  for (let i = 0; i < H.vertexCount; i++) { pos[3 * i] -= cx; pos[3 * i + 2] -= cz; }
  const gidx = new Uint32Array(H.indexCount);
  const els = mj.elements;
  els.forEach((e, n) => {
    for (let j = 0; j < e.in; j++) gidx[e.io + j] = e.vo + li[e.io + j];
    const a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
    for (let v = e.vo; v < e.vo + e.vn; v++) for (let k = 0; k < 3; k++) { const c = pos[3 * v + k]; if (c < a[k]) a[k] = c; if (c > b[k]) b[k] = c; }
    e.min = a; e.max = b; e.n = n; e.layer = layer.k;
    e.m3 = NOT_CONCRETE.test(e.t || '') ? 0 : (+e.v || 0);
    const w = WORK[e.w]; if (w) { w.els.push(n); w.m3 += e.m3; }
  });
  return { info: mj.info, H, pos, gidx, els, layers: [layer.k], box: { minX: minX - cx, maxX: maxX - cx, minY, maxY, minZ: minZ - cz, maxZ: maxZ - cz } };
}

/* ---------- Three.js scene ---------- */
function initThree() {
  const canvas = $('#c');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch (e) { throw new Error(L('This browser could not start 3D graphics (WebGL).', 'تعذّر على هذا المتصفح تشغيل الرسوم ثلاثية الأبعاد (WebGL).')); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.12; controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI * 0.98; controls.minDistance = 2; controls.maxDistance = 220;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(30, 50, 40); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(-40, 20, -30); scene.add(fill);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(M.pos, 3));
  g.setIndex(new THREE.BufferAttribute(M.gidx, 1));
  g.computeVertexNormals();
  const colors = new Float32Array(M.pos.length);
  const colAttr = new THREE.BufferAttribute(colors, 3); colAttr.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('color', colAttr);
  const idx = new THREE.BufferAttribute(new Uint32Array(M.gidx.length), 1); idx.setUsage(THREE.DynamicDrawUsage);
  g.setIndex(idx);
  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const ghostMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.14, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const mesh = new THREE.Mesh(g, [solidMat, ghostMat]);
  scene.add(mesh);

  // feature edges: built in small batches after the first picture, so the model shows sooner on phones
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x1b1d1f, transparent: true, opacity: 0.32 });
  const edgeGhostMat = new THREE.LineBasicMaterial({ color: 0x1b1d1f, transparent: true, opacity: 0.09, depthWrite: false });

  // selection overlay
  const selGeo = new THREE.BufferGeometry();
  selGeo.setAttribute('position', g.getAttribute('position'));
  selGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(0), 1));
  const selMesh = new THREE.Mesh(selGeo, new THREE.MeshBasicMaterial({ color: 0x111316, transparent: true, opacity: 0.42, depthTest: false }));
  selMesh.renderOrder = 10; scene.add(selMesh);

  three = { renderer, scene, camera, controls, mesh, g, colors, colAttr, idx, edges: null, eGeo: null, eIdx: null, edgeRange: null, edgeMat, edgeGhostMat, selMesh, selGeo, triOwner: new Int32Array(M.gidx.length / 3), solidMat, ghostMat, need: true };
  controls.addEventListener('change', () => { three.need = true; });
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  const ro = new ResizeObserver(resize); ro.observe($('#stage')); ro.observe($('#tl')); resize();
  fitView('3d', false);
  const loop = () => {
    requestAnimationFrame(loop);
    controls.update();
    if (three.need) { three.need = false; renderer.render(scene, camera); placeTags(); placeCallouts(); }
  };
  loop();
  setupPicking(canvas);
  setTimeout(buildEdges, 60);
}
async function buildEdges() {
  const edgePos = []; const edgeRange = new Array(M.els.length);
  let ev = 0, t = performance.now();
  for (const e of M.els) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(M.pos.subarray(e.vo * 3, (e.vo + e.vn) * 3), 3));
    const local = new Uint32Array(e.in); for (let j = 0; j < e.in; j++) local[j] = M.gidx[e.io + j] - e.vo;
    sg.setIndex(new THREE.BufferAttribute(local, 1));
    const eg = new THREE.EdgesGeometry(sg, 28);
    const p = eg.getAttribute('position').array;
    edgeRange[e.n] = [ev, p.length / 3];
    for (let k = 0; k < p.length; k++) edgePos.push(p[k]);
    ev += p.length / 3;
    sg.dispose(); eg.dispose();
    if (performance.now() - t > 30) { await new Promise(r => setTimeout(r, 0)); t = performance.now(); } // keep the page responsive
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgePos), 3));
  const eIdx = new THREE.BufferAttribute(new Uint32Array(ev), 1); eIdx.setUsage(THREE.DynamicDrawUsage);
  eGeo.setIndex(eIdx);
  const edges = new THREE.LineSegments(eGeo, [three.edgeMat, three.edgeGhostMat]);
  three.scene.add(edges);
  Object.assign(three, { edges, eGeo, eIdx, edgeRange });
  if (window.__4d.timing) window.__4d.timing.edges = Math.round(performance.now() - window.__4d.t0);
  paint();
}
// Keep the model clear of the timeline bar: shift the view up by the bar's height.
function resize() {
  if (!three) return;
  const stage = $('#stage'); const { renderer, camera } = three;
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  const tl = $('#tl');
  const bar = tl.classList.contains('on') ? tl.offsetHeight + 12 : 0;
  stage.style.setProperty('--tlh', bar + 'px');
  // the camera's own view is the free area: above the timeline bar, and left of the week labels
  const right = calloutCol(w) ? calloutCol(w) + 24 : 0;
  const fw = w - right, fh = bar < h * 0.6 ? h - bar : h;
  if (fw < w || fh < h) { camera.aspect = fw / Math.max(1, fh); camera.setViewOffset(fw, fh, AR() ? fw - w : 0, 0, w, h); }
  else { camera.clearViewOffset(); camera.aspect = w / Math.max(1, h); }
  camera.updateProjectionMatrix(); three.need = true;
}
function applyTheme() {
  if (!three) return;
  const bg = new THREE.Color(); bg.setStyle(css('--bg'), THREE.SRGBColorSpace);
  three.scene.background = bg;
  const dark = bg.getHSL({}).l < 0.4;
  for (const k in colorCache) delete colorCache[k];
  three.edgeMat.color.set(dark ? 0xe8ebed : 0x1b1d1f); three.edgeGhostMat.color.set(dark ? 0xe8ebed : 0x1b1d1f);
  three.edgeMat.opacity = dark ? 0.22 : 0.32; three.edgeGhostMat.opacity = dark ? 0.08 : 0.09;
  three.ghostMat.opacity = dark ? 0.12 : 0.14;
  three.selMesh.material.color.set(dark ? 0xffffff : 0x111316); three.selMesh.material.opacity = dark ? 0.5 : 0.42;
  if (DATA) paint();
  three.need = true;
}
function fitView(kind, animate = true) {
  const b = M.box;
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
  const target = new THREE.Vector3(0, (b.minY + b.maxY) / 2 - 1, 0);
  const dir = (kind === 'top' ? new THREE.Vector3(0.001, 1, 0.0001) : new THREE.Vector3(0.95, 0.62, 1.05)).normalize();
  const narrow = three.camera.aspect < 1.1 ? 1.1 / three.camera.aspect : 1; // portrait screens need more room left and right
  const dist = size * (kind === 'top' ? 1.55 : 1.65) * narrow;
  moveCamera(target.clone().add(dir.multiplyScalar(dist)), target, animate);
}
let camAnim = null;
function moveCamera(pos, target, animate = true) {
  const { camera, controls } = three;
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(pos); controls.target.copy(target); controls.update(); three.need = true; return; }
  const p0 = camera.position.clone(), t0 = controls.target.clone(), start = performance.now(), dur = 650;
  cancelAnimationFrame(camAnim);
  const step = now => {
    const k = Math.min(1, (now - start) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    camera.position.lerpVectors(p0, pos, e); controls.target.lerpVectors(t0, target, e); controls.update(); three.need = true;
    if (k < 1) camAnim = requestAnimationFrame(step);
  };
  camAnim = requestAnimationFrame(step);
}
function flyToElements(list) {
  if (!list.length) return;
  const a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
  for (const n of list) { const e = M.els[n]; for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], e.min[k]); b[k] = Math.max(b[k], e.max[k]); } }
  const c = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  const size = Math.max(b[0] - a[0], b[1] - a[1], b[2] - a[2], 4);
  const dir = three.camera.position.clone().sub(three.controls.target).normalize();
  moveCamera(c.clone().add(dir.multiplyScalar(size * 1.9 + 4)), c);
}

/* ---------- Painting ---------- */
const colorCache = {};
function colorFor(key) {
  let v;
  if (key.startsWith('hl')) v = css(key.slice(2));
  else { const def = legendDefs().find(d => d.k === key); v = !def || def.c === 'ghost' ? css('--ghost') : css(def.c); }
  if (!colorCache[v]) { const c = new THREE.Color(); c.setStyle(v, THREE.SRGBColorSpace); colorCache[v] = c; }
  return colorCache[v];
}
function floorVisible(pkgKey) {
  if (S.floor === 'ALL') return true;
  const i = PKG[pkgKey].i, f = PKG[S.floor].i;
  return S.only ? i === f : i <= f;
}
function paint() {
  if (!three || !DATA) return;
  if (S.mode === 'status') S.nextSet = new Set(lookAhead(curWin()).flatMap(x => itemsOfAct(x.a.id)).map(w => w.key));
  S.pins = weekOn() ? weekItems() : delayOn() ? delayItems() : changeOn() ? changeItems() : null;
  S.pinMap = S.pins ? new Map(S.pins.map(o => [o.w.key, o])) : null;
  const solid = [], ghost = [];
  const counts = {};
  const { colors } = three;
  for (const w of Object.values(WORK)) {
    if (!w.els.length) continue;
    const key = classOf(w);
    counts[key] = (counts[key] || 0) + w.els.length;
    const asked = (S.hl && S.hl.map.has(w.key)) || (S.focus && S.focus.has(w.key));
    if (w.wp && !S.wp && !asked) continue;
    if (!floorVisible(w.pkg) && !asked) continue;
    const ghostKey = key === 'none' || key === 'notdue' || key === 'nolink' || key === 'dim';
    let vis;
    if (S.hl) vis = asked ? 1 : 2;
    else if (S.focus) vis = asked ? 1 : 2;
    else if (S.legendFilter) vis = S.legendFilter === key ? 1 : 2;
    else vis = ghostKey ? (S.ghost ? 2 : 0) : 1;
    if (vis === 0) continue;
    const col = colorFor(key);
    for (const n of w.els) {
      const e = M.els[n];
      for (let v = e.vo; v < e.vo + e.vn; v++) { colors[3 * v] = col.r; colors[3 * v + 1] = col.g; colors[3 * v + 2] = col.b; }
      (vis === 1 ? solid : ghost).push(n);
    }
  }
  const idx = three.idx.array, own = three.triOwner; let p = 0;
  const pushEl = n => { const e = M.els[n]; for (let j = 0; j < e.in; j++) idx[p + j] = M.gidx[e.io + j]; own.fill(n, p / 3, (p + e.in) / 3); p += e.in; };
  solid.forEach(pushEl); const solidEnd = p; ghost.forEach(pushEl);
  three.g.clearGroups(); three.g.addGroup(0, solidEnd, 0); three.g.addGroup(solidEnd, p - solidEnd, 1);
  three.g.setDrawRange(0, p);
  three.idx.needsUpdate = true; three.colAttr.needsUpdate = true;
  if (three.eIdx) {
    const eIdx = three.eIdx.array; let q = 0;
    const pushEdge = n => { const [o, c] = three.edgeRange[n]; for (let j = 0; j < c; j++) eIdx[q + j] = o + j; q += c; };
    solid.forEach(pushEdge); const eSolidEnd = q; ghost.forEach(pushEdge);
    three.eGeo.clearGroups(); three.eGeo.addGroup(0, eSolidEnd, 0); three.eGeo.addGroup(eSolidEnd, q - eSolidEnd, 1);
    three.eGeo.setDrawRange(0, q); three.eIdx.needsUpdate = true;
  }
  three.need = true;
  S.counts = counts;
  renderLegend();
  paintSelection();
}
function paintSelection() {
  const n = S.sel;
  if (n < 0) { three.selGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(0), 1)); three.need = true; return; }
  const e = M.els[n]; const a = new Uint32Array(e.in);
  for (let j = 0; j < e.in; j++) a[j] = M.gidx[e.io + j];
  three.selGeo.setIndex(new THREE.BufferAttribute(a, 1)); three.need = true;
}

/* ---------- Level tags ---------- */
const tagEls = [];
function placeTags() {
  if (!M) return;
  const box = $('#tags'); const levels = M.info.levels.filter(l => l.name !== 'STREET LEVEL');
  if (!tagEls.length) for (const l of levels) { const s = document.createElement('span'); box.appendChild(s); tagEls.push([s, l]); }
  for (const [s, l] of tagEls) { const t = levelTag(l); if (s.textContent !== t) s.textContent = t; }
  const w = box.clientWidth, h = box.clientHeight; const b = M.box;
  const v = new THREE.Vector3();
  const look = three.controls.getPolarAngle ? three.controls.getPolarAngle() : 1;
  box.style.display = look < 0.45 ? 'none' : '';
  const barTop = h - (parseFloat(getComputedStyle($('#stage')).getPropertyValue('--tlh')) || 0);
  const fb = $('#floors').getBoundingClientRect(), sb = box.getBoundingClientRect();
  const fLeft = fb.left - sb.left - 8, fRight = fb.right - sb.left + 8, fTop = fb.top - sb.top - 8;
  const rtl = AR(); // Arabic: the level tags sit on the right of the building, as the side labels and the card move to the left
  for (const [s, l] of tagEls) {
    const cand = [[b.minX, b.maxZ], [b.maxX, b.maxZ], [b.minX, b.minZ], [b.maxX, b.minZ]];
    let best = null;
    for (const [x, z] of cand) { v.set(x, l.elev, z).project(three.camera); const sx = (v.x + 1) / 2 * w; if (!best || (rtl ? sx > best[0] : sx < best[0])) best = [sx, (1 - v.y) / 2 * h, v.z]; }
    const tw = s.offsetWidth || 90;
    const x0 = rtl ? best[0] + 2 : best[0] - tw - 10, x1 = rtl ? best[0] + tw + 10 : best[0] - 2; // the tag's extent
    const show = best[2] < 1 && x0 > 4 && x1 < w - 4 && best[1] > 10 && best[1] < barTop - 10 && !(x0 < fRight && x1 > fLeft && best[1] > fTop);
    s.style.display = show ? '' : 'none';
    if (show) { s.style.left = (rtl ? best[0] + 6 : best[0] - 6) + 'px'; s.style.top = best[1] + 'px'; }
  }
}

/* ---------- Focus pins: numbered pins on the model (next week's work, or the top delays), and labels down the side on wide screens ---------- */
function anchorOf(w) { // the top of the element nearest the middle of the work item
  if (w._anchor) return w._anchor;
  const a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
  for (const n of w.els) { const e = M.els[n]; for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], e.min[k]); b[k] = Math.max(b[k], e.max[k]); } }
  const c = [0, 1, 2].map(k => (a[k] + b[k]) / 2);
  let best = M.els[w.els[0]], bd = Infinity;
  for (const n of w.els) { const e = M.els[n]; const d = [0, 1, 2].reduce((s, k) => s + ((e.min[k] + e.max[k]) / 2 - c[k]) ** 2, 0); if (d < bd) { bd = d; best = e; } }
  return (w._anchor = new THREE.Vector3((best.min[0] + best.max[0]) / 2, best.max[1], (best.min[2] + best.max[2]) / 2));
}
const GROUP_COLOR = { carried: '--late', progress: '--rebar', starting: '--next', late: '--late', behind: '--rebar', chcast: '--built', chprog: '--rebar' };
const GROUP_INK = { carried: '#fff', progress: '#1b1d1f', starting: '#fff', late: '#fff', behind: '#1b1d1f', chcast: '#fff', chprog: '#1b1d1f' }; // number on the pin: white or near-black by the fill
const pinStyle = g => `--c:var(${GROUP_COLOR[g]});--t:${GROUP_INK[g]}`;
const T_MORE = n => L(`+${n} more`, `+${n} أخرى`);
function calloutText(o) {
  if (o.kind === 'change') return o.xs.slice(0, 3).map(x => `${sLabel(x.a.stage)} ${Math.round(x.from)} ${L('→', '←')} ${Math.round(x.to)}%${x.site ? L(' (site)', ' (الموقع)') : ''}`).join(' · ') + (o.xs.length > 3 ? ` · ${T_MORE(o.xs.length - 3)}` : '') + (o.m3 >= 0.1 ? L(` · about ${fmtM3(o.m3)} cast`, ` · حوالي ${fmtM3(o.m3)} مصبوبة`) : '');
  if (o.days != null) return `${daysText(o)} · ${L('plan', 'المخطط')} ${pct(o.plan)}${L(', done ', '، المنجز ')}${pct(o.act)}${o.a ? ` · ${sLow(o.a.stage)} ${L('to', 'حتى')} ${fmtD(o.a.finish)}` : ''}`;
  const xs = [...o.xs].sort((p, q) => p.a.start - q.a.start);
  const part = x => x.group === 'carried' ? `${sLabel(x.a.stage)}${L(', was due ', '، كان مستحقاً ')}${fmtD(x.a.finish)}`
    : x.group === 'progress' ? `${sLabel(x.a.stage)} ${pct(x.a.act)}${L(', to ', '، حتى ')}${fmtD(x.a.finish)}` : `${sLabel(x.a.stage)} ${fmtRange(x.a.start, x.a.finish)}`;
  return xs.slice(0, 2).map(part).join(' · ') + (xs.length > 2 ? ` · ${T_MORE(xs.length - 2)}` : '');
}
const shownPins = () => pinsOn() && !S.focus && !S.hl && S.pins ? S.pins.filter(o => floorVisible(o.w.pkg)) : [];
// Width of the column of labels on the right, or 0 when they are not shown there.
function calloutCol(W) {
  const n = shownPins().length;
  return n && n <= 12 && W >= 700 ? Math.min(250, W * 0.3) : 0;
}
function placeCallouts() {
  const box = $('#callouts'); if (!box || !three) return;
  const list = shownPins();
  if (!list.length || $('#stage').classList.contains('carded')) { box.hidden = true; return; }
  box.hidden = false;
  const key = list.map(o => o.w.key + ':' + o.group + ':' + o.n).join(',') + '|' + S.win + '|' + S.mode + '|' + LANG;
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    box.innerHTML = '<svg aria-hidden="true"></svg>' + list.map(o => `<button type="button" class="pin" data-pin="${esc(o.w.key)}" style="${pinStyle(o.group)}" title="${esc(wName(o.w))}">${o.n}</button>` +
      `<button type="button" class="call" data-pin="${esc(o.w.key)}" style="${pinStyle(o.group)}"><b>${o.n}. ${esc(wName(o.w))}</b><span>${esc(calloutText(o))}</span></button>`).join('');
  }
  const W = box.clientWidth, H = box.clientHeight, v = new THREE.Vector3();
  const pins = [...box.querySelectorAll('.pin')], calls = [...box.querySelectorAll('.call')];
  const pts = list.map(o => { v.copy(anchorOf(o.w)).project(three.camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, front: v.z < 1 }; });
  for (let i = 0; i < pts.length; i++) for (let j = 0; j < i; j++) { // keep pins from sitting on top of each other
    if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 22) { pts[i].x += 22; j = -1; }
  }
  pins.forEach((p, i) => { p.style.display = pts[i].front ? '' : 'none'; p.style.left = pts[i].x + 'px'; p.style.top = pts[i].y + 'px'; });
  const bw = calloutCol(W);
  const svg = box.querySelector('svg'); let lines = '';
  if (bw) {
    const x0 = AR() ? 12 : W - bw - 12, top = 62, bottom = H - 12, xl = AR() ? x0 + bw : x0;
    const order = list.map((o, i) => i).sort((a, b) => pts[a].y - pts[b].y);
    const hs = calls.map(c => { c.style.width = bw + 'px'; c.style.display = ''; return c.offsetHeight; });
    let y = top; const ys = [];
    for (const i of order) { const want = pts[i].y - hs[i] / 2; y = Math.max(y, want); ys[i] = y; y += hs[i] + 6; }
    const over = y - 6 - bottom;
    if (over > 0) { let lim = bottom; for (const i of [...order].reverse()) { ys[i] = Math.min(ys[i], lim - hs[i]); lim = ys[i] - 6; } }
    const fits = order.every(i => ys[i] >= top - 1);
    calls.forEach((c, i) => { if (!fits) { c.style.display = 'none'; return; } c.style.left = x0 + 'px'; c.style.top = ys[i] + 'px';
      if (pts[i].front) lines += `<line x1="${pts[i].x}" y1="${pts[i].y}" x2="${xl}" y2="${ys[i] + hs[i] / 2}" style="stroke:var(${GROUP_COLOR[list[i].group]})"/>`; });
  } else calls.forEach(c => { c.style.display = 'none'; });
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.innerHTML = lines;
}

/* ---------- Picking ---------- */
function setupPicking(canvas) {
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) { down = null; return; }
    down = null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, three.camera);
    const hits = ray.intersectObject(three.mesh, false);
    if (!hits.length) { select(-1); return; }
    const solidEnd = three.g.groups[0].count / 3;
    const h = hits.find(x => x.faceIndex < solidEnd) || hits[0];
    select(three.triOwner[h.faceIndex]);
  });
}
function select(n) { S.sel = n; paintSelection(); renderCard(); saveHash(); if (n >= 0 && guideStep === GUIDE.length - 1) closeGuide(); }

/* ---------- Panel rendering ---------- */
function renderKpis() {
  const k = DATA.kpi; const cc = concreteCast();
  const cp = cc.tot ? cc.cast / cc.tot * 100 : null, pp = cc.tot ? cc.plan / cc.tot * 100 : null;
  const gap = (k.actCum ?? 0) - (k.planCum ?? 0);
  const fin = parseDash(k.finish), bl = parseDash(k.blFinish);
  const late = fin != null && bl != null ? Math.round((fin - bl) / DAY) : null;
  $('#kpis').innerHTML = `
    <div class="kpi${cp != null && cp < pp - 5 ? ' bad' : ''}"><b>${cp != null ? Math.round(cp) + '%' : '—'}</b><span>${L('Structure cast, plan', 'صب الهيكل، المخطط')} ${pp != null ? Math.round(pp) + '%' : '—'}: ${esc(fmtM3(cc.cast))} ${L('of', 'من')} ${esc(fmtM3(cc.tot))}</span></div>
    <div class="kpi${gap < -5 ? ' bad' : ''}"><b>${esc(pct(k.actCum))}</b><span>${L('Whole project, plan', 'المشروع كاملاً، المخطط')} ${esc(pct(k.planCum))}${k.spi != null ? `${L(', ', '، ')}SPI ${esc((+k.spi).toFixed(2))}` : ''}</span></div>
    <div class="kpi${late > 0 ? ' bad' : ''}"><b>${esc(fmtD(fin))}</b><span>${L('Forecast finish', 'الانتهاء المتوقع')} ${fin != null ? new Date(fin).getUTCFullYear() : ''}${late > 0 ? L(`, ${late} days after the baseline`, `، بعد الخطة الأساسية بـ${cnt(late, 'day', true)}`) : late != null ? L(', on the baseline', '، حسب الخطة الأساسية') : ''}</span></div>`;
}
function renderFloorProgress() {
  const { rows } = floorProgress();
  const row = r => {
    const a = r.cast / r.tot * 100, p = r.plan / r.tot * 100, on = S.floor === r.p.k, behind = a < p - 5;
    const tip = L(`${r.p.long}: ${fmtM3(r.cast)} of ${fmtM3(r.tot)} concrete cast (${Math.round(a)}%). Plan at ${fmtD(DATA.dataDate)}: ${Math.round(p)}%${behind ? ', so it is behind plan' : ''}. Tap to show it in 3D.`,
      `${r.p.longAr}: صُبّ ${fmtM3(r.cast)} من ${fmtM3(r.tot)} (${Math.round(a)}%). المخطط في ${fmtD(DATA.dataDate)}: ${Math.round(p)}%${behind ? '، أي أنه خلف الخطة' : ''}. اضغط لعرضه في النموذج.`);
    return `<li><button type="button" data-pfloor="${r.p.k}" aria-pressed="${on}" title="${esc(tip)}" aria-label="${esc(tip)}">
      <span class="nm">${esc(pLong(r.p))}</span><span class="mt"><i style="width:${a.toFixed(1)}%"></i><u style="inset-inline-start:${Math.min(99.4, p).toFixed(1)}%"></u></span><span class="fig${behind ? ' late' : ''}">${Math.round(a)}%</span><span class="pl">${L('plan', 'المخطط')} ${Math.round(p)}%</span></button></li>`;
  };
  $('#floorProg').innerHTML = `<h2><span>${L('Concrete cast by floor', 'الخرسانة المصبوبة حسب الدور')}</span><small><span class="key"><i></i>${L('cast', 'مصبوب')}</span><span class="key"><u></u>${L('plan at', 'المخطط في')} ${esc(fmtD(DATA.dataDate))}</span></small></h2>
    <ul class="meters">${rows.map(row).join('')}</ul>`;
}
const srcState = () => DATA.fail ? 'fallback' : DATA.live ? 'live' : 'snapshot';
function shownCopy() { // which data is on screen when the dashboard is not being read live
  if (DATA.live) return L(`the data read at ${fmtTime(DATA.checked)}`, `البيانات المقروءة الساعة ${fmtTime(DATA.checked)}`);
  if (DATA.source === 'lastGood') return L(`the last copy that loaded on this device (read ${fmtD(DATA.savedAt)} ${fmtTime(DATA.savedAt)})`, `آخر نسخة حُمّلت على هذا الجهاز (قُرئت ${fmtD(DATA.savedAt)} ${fmtTime(DATA.savedAt)})`);
  return L('the copy saved with the 4D', 'النسخة المحفوظة مع النموذج');
}
function renderSource() {
  const b = $('#srcBadge'), ban = $('#banner'), st = srcState(), dd = fmtD(DATA.dataDate, true);
  b.className = 'badge ' + { live: 'live', fallback: 'warn', snapshot: 'snap' }[st];
  b.querySelector('span').textContent = st === 'live' ? L(`Live · data date ${dd} · checked ${fmtTime(DATA.checked)}`, `مباشر · تاريخ البيانات ${dd} · آخر تحقق ${fmtTime(DATA.checked)}`)
    : st === 'fallback' ? L(`Not live just now · data date ${dd}`, `غير مباشر حالياً · تاريخ البيانات ${dd}`) : L(`Saved copy · data date ${dd}`, `نسخة محفوظة · تاريخ البيانات ${dd}`);
  b.title = st === 'live' ? L(`Read from ${DATA.source}. Checked again every ${REFRESH_MINUTES} minutes while the page is open.`, `مقروءة من ${DATA.source}. يُعاد التحقق كل ${REFRESH_MINUTES} دقيقة ما دامت الصفحة مفتوحة.`)
    : st === 'fallback' ? L(`The dashboard could not be read, so this shows ${shownCopy()}.`, `تعذّرت قراءة لوحة المتابعة، لذا تُعرض ${shownCopy()}.`) : L('This copy cannot reach the dashboard, so it shows the dashboard data saved with it.', 'هذه النسخة لا تصل إلى لوحة المتابعة، لذا تعرض بياناتها المحفوظة معها.');
  const hc = healthRows().filter(r => (r[0] === 'warn' || r[0] === 'bad') && !r[3]).length;
  $('#healthLink').hidden = !hc; $('#healthLink').textContent = L(`Data health: ${plural(hc, 'thing', 'things')} to check`, `سلامة البيانات: ${cnt(hc, 'thing')} للتحقق`);
  if (st === 'live') { ban.hidden = true; return; }
  const age = Math.round((localToday() - DATA.dataDate) / DAY);
  const ago = age > 0 ? L(` (${plural(age, 'day')} ago)`, ` (قبل ${cnt(age, 'day', true)})`) : '';
  const su = DATA.siteUsed.length ? L(`, plus ${plural(DATA.siteUsed.length, 'site update')} to ${fmtD(DATA.asOf)}`, `، مع تحديثات الموقع (${DATA.siteUsed.length}) حتى ${fmtD(DATA.asOf)}`) : '';
  ban.hidden = false;
  if (st === 'fallback') {
    const f = DATA.fail;
    const why = f.fail === 'format' ? L(`The dashboard was reached, but its data could not be read: ${f.why}. The 4D may need a small update to follow the new format.`, `تم الوصول إلى لوحة المتابعة لكن تعذّرت قراءة بياناتها: ${f.why}. قد يحتاج النموذج إلى تحديث بسيط ليتوافق مع الصيغة الجديدة.`)
      : L(`The dashboard could not be reached at ${fmtTime(f.last || f.at)}.`, `تعذّر الوصول إلى لوحة المتابعة الساعة ${fmtTime(f.last || f.at)}.`);
    ban.innerHTML = AR() ? `<b>تُعرض بيانات ${esc(dd)}${esc(ago)}</b>${esc(why)} يستخدم هذا العرض ${esc(shownCopy())}${esc(su)}، ويعيد محاولة قراءة لوحة المتابعة كل ${REFRESH_MINUTES} دقيقة. <a href="#" data-retry>حاول الآن</a> · <a href="#healthBox" data-open="healthBox">سلامة البيانات</a>`
      : `<b>Showing data from ${esc(dd)}${esc(ago)}</b>${esc(why)} This view uses ${esc(shownCopy())}${esc(su)}, and tries the dashboard again every ${REFRESH_MINUTES} minutes. <a href="#" data-retry>Try now</a> · <a href="#healthBox" data-open="healthBox">Data health</a>`;
    return;
  }
  ban.innerHTML = AR() ? `<b>هذا الرابط غير مباشر</b>يعرض لوحة المتابعة كما كانت في ${esc(dd)}${esc(ago)}${esc(su)}. لا تصل تغييرات لوحة المتابعة إلى هذا الرابط إلا عند تحديثه. <a href="#healthBox" data-open="healthBox">كيف يصبح مباشراً</a>`
    : `<b>Not live on this link</b>It shows the dashboard as of ${esc(dd)}${esc(ago)}${esc(su)}. Dashboard changes reach this link only when it is updated. <a href="#healthBox" data-open="healthBox">How to make it live</a>`;
}
// Data health: is the 4D reading what it should, and does every part line up?
function healthRows() {
  const R = []; const st = srcState(); const sh = id => id.replace('FUR.M.C.', '');
  if (st === 'live') R.push(['ok', L('Dashboard read live', 'لوحة المتابعة مقروءة مباشرة'), L(`From ${esc(DATA.source)} at ${esc(fmtTime(DATA.checked))}, and again every ${REFRESH_MINUTES} minutes while the page is open.`, `من ${esc(DATA.source)} الساعة ${esc(fmtTime(DATA.checked))}، ويُعاد كل ${REFRESH_MINUTES} دقيقة ما دامت الصفحة مفتوحة.`)]);
  else if (st === 'fallback') R.push(['bad', DATA.fail.fail === 'format' ? L('Dashboard data could not be read', 'تعذّرت قراءة بيانات لوحة المتابعة') : L('Dashboard not reached', 'تعذّر الوصول إلى لوحة المتابعة'),
    `${DATA.fail.fail === 'format' ? esc(DATA.fail.why.replace(/^./, c => c.toUpperCase())) + '. ' : ''}${L(`Showing ${esc(shownCopy())} instead. The page tries again every ${REFRESH_MINUTES} minutes.`, `تُعرض ${esc(shownCopy())} بدلاً منها. تعيد الصفحة المحاولة كل ${REFRESH_MINUTES} دقيقة.`)}`]);
  else R.push(['info', L('Saved copy of the dashboard', 'نسخة محفوظة من لوحة المتابعة'), L('This link cannot read the dashboard, so it shows the copy saved with the 4D. The GitHub link reads it live.', 'هذا الرابط لا يقرأ لوحة المتابعة، لذا يعرض النسخة المحفوظة مع النموذج. رابط GitHub يقرؤها مباشرة.')]);
  const age = Math.round((localToday() - DATA.dataDate) / DAY);
  R.push([age > 13 ? 'warn' : 'ok', L(`Data date ${esc(fmtD(DATA.dataDate, true))}, ${age <= 0 ? 'today' : plural(age, 'day') + ' ago'}`, `تاريخ البيانات ${esc(fmtD(DATA.dataDate, true))}، ${age <= 0 ? 'اليوم' : 'قبل ' + cnt(age, 'day', true)}`),
    age > 13 ? L('More than two weeks old. The dashboard is normally updated every week.', 'أقدم من أسبوعين. تُحدَّث لوحة المتابعة عادة كل أسبوع.') : L('Within the weekly update cycle.', 'ضمن دورة التحديث الأسبوعية.')]);
  const want = uniq(Object.values(WORK).filter(w => w.els.length).flatMap(w => w.acts));
  const missing = want.filter(id => !DATA.acts.has(id));
  R.push([missing.length ? 'warn' : 'ok', L(`${want.length - missing.length} of ${want.length} linked activities found in the dashboard`, `وُجد ${want.length - missing.length} من ${want.length} نشاطاً مرتبطاً في لوحة المتابعة`),
    missing.length ? L(`Not found: ${esc(missing.slice(0, 12).map(sh).join(', '))}${missing.length > 12 ? ` and ${missing.length - 12} more` : ''}. If they were renamed in the dashboard, the 4D's links need the new IDs; until then their elements show as "not in the programme".`,
      `غير موجودة: ${esc(missing.slice(0, 12).map(sh).join('، '))}${missing.length > 12 ? ` و${missing.length - 12} أخرى` : ''}. إذا تغيّرت رموزها في لوحة المتابعة فيجب تحديث روابط النموذج بالرموز الجديدة؛ وحتى ذلك الحين تظهر عناصرها بلون "غير موجود في البرنامج الزمني".`)
      : L('Every activity the model is linked to is in the dashboard.', 'كل الأنشطة المرتبطة بالنموذج موجودة في لوحة المتابعة.')]);
  const linkedIds = new Set(want);
  const unl = [...DATA.acts.values()].filter(a => isStruct(a) && !linkedIds.has(a.id));
  R.push([unl.length ? 'info' : 'ok', unl.length ? L(`${plural(unl.length, 'structural activity', 'structural activities')} in the dashboard with no model elements`, `أنشطة إنشائية في لوحة المتابعة بلا عناصر في النموذج: ${unl.length}`) : L('Every structural activity has model elements', 'لكل نشاط إنشائي عناصر في النموذج'),
    unl.length ? `${AR() ? `أعمال غير مرسومة كعناصر مستقلة في نموذج Revit، مثل ${esc(listJoin(uniq(unl.map(aName)).slice(0, 3)))}. تبقى محسوبة في إنجاز لوحة المتابعة.` : `Work not drawn as separate elements in the Revit model, for example ${esc(listJoin(uniq(unl.map(a => a.name.toLowerCase().replace(/ for .*/, ''))).slice(0, 3)))}. It still counts in the dashboard's progress.`}
      <details class="more"><summary>${L('Show the list', 'عرض القائمة')}</summary><ul>${unl.map(a => `<li>${esc(a.short)} ${esc(aName(a))}</li>`).join('')}</ul></details>` : '']);
  const noAct = Object.values(WORK).filter(w => w.els.length && !linked(w).length);
  R.push([noAct.length ? 'info' : 'ok', noAct.length ? L(`${plural(noAct.length, 'model work item')} with no dashboard activity`, `بنود في النموذج بلا نشاط في لوحة المتابعة: ${noAct.length}`) : L('Every model work item has an activity', 'لكل بند في النموذج نشاط'),
    noAct.length ? `${esc(noAct.map(w => `${itemLabel(w)} (${cnt(w.els.length, 'element')})`).join(L('; ', '؛ ')))}${L('. Shown as "not in the programme".', '. تظهر بلون "غير موجود في البرنامج الزمني".')}` : '']);
  const sp = siteProblems(); const nLines = sum(SITE, u => Object.keys(u.progress).length);
  R.push([sp.length ? 'warn' : 'ok', SITEINFO.file ? `${esc(SITEINFO.file)}: ${cnt(nLines, 'line')}${sp.length ? L(`, ${sp.length} to fix`, `، ${sp.length} للتصحيح`) : L(', no problems', '، بلا مشاكل')}` : L('No site updates file found', 'لا يوجد ملف تحديثات الموقع'),
    sp.length ? `<a href="#siteSec" data-open-sec="siteSec">${L('See the lines to fix', 'عرض الأسطر المطلوب تصحيحها')}</a>` : SITEINFO.file ? `${DATA.siteActive.length ? L(`${plural(DATA.siteActive.length, 'update')} newer than the dashboard ${DATA.siteActive.length === 1 ? 'is' : 'are'} in use.`, `تحديثات أحدث من لوحة المتابعة مستخدمة: ${DATA.siteActive.length}.`) : L('None newer than the dashboard.', 'لا يوجد ما هو أحدث من لوحة المتابعة.')}` : L('Add site-updates.csv next to the 4D page to record progress seen on site.', 'أضف ملف site-updates.csv بجانب صفحة النموذج لتسجيل الإنجاز المشاهد في الموقع.')]);
  const nDocs = DOCS.docs.length; const unkDocs = DOCS.docs.filter(d => d.ids.some(id => !DATA.acts.has(id)));
  const docProbs = [...DOCS.problems, ...unkDocs.map(d => L(`Line ${d.line}: ${d.ids.filter(id => !DATA.acts.has(id)).map(id => id.replace('FUR.M.C.', '')).join(', ')} is not an activity in the dashboard.`, `السطر ${d.line}: ${d.ids.filter(id => !DATA.acts.has(id)).map(id => id.replace('FUR.M.C.', '')).join('، ')} ليس نشاطاً في لوحة المتابعة.`))]
    .sort((a, b) => lineNo(a) - lineNo(b));
  R.push([docProbs.length ? 'warn' : DOCS.file ? 'ok' : 'info', DOCS.file ? `documents.csv: ${cnt(nDocs, 'link')}${docProbs.length ? L(`, ${docProbs.length} to fix`, `، ${docProbs.length} للتصحيح`) : ''}` : L('No documents file yet', 'لا يوجد ملف مستندات بعد'),
    docProbs.length ? `<ul class="plain">${docProbs.slice(0, 5).map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : DOCS.file ? L('WIR, MIR, photos and other links show on the element cards.', 'تظهر طلبات الفحص WIR وMIR والصور والروابط الأخرى في بطاقات العناصر.') : L('Add documents.csv next to the 4D page to show WIR, MIR, photos and SharePoint links on the element cards.', 'أضف ملف documents.csv بجانب صفحة النموذج لعرض طلبات WIR وMIR والصور وروابط SharePoint في بطاقات العناصر.')]);
  const dc = CHECKS.filter(c => c.kind === 'data');
  R.push([dc.length ? 'warn' : 'ok', dc.length ? L(`${plural(dc.length, 'activity has', 'activities have')} dates to check in the dashboard`, `أنشطة بتواريخ تحتاج مراجعة في لوحة المتابعة: ${dc.length}`) : L('Activity dates read cleanly', 'تواريخ الأنشطة سليمة'),
    dc.length ? `${esc(dc.map(c => c.act.replace('FUR.M.C.', '')).join(L(', ', '، ')))}. <a href="#checksBox" data-open="checksBox">${L('See programme checks', 'عرض تدقيق البرنامج الزمني')}</a>` : '', true]); // listed in the programme checks too, so not flagged at the top
  return R;
}
const lineNo = t => +(/^(?:Line|Entry|السطر|المدخل) (\d+)/.exec(t)?.[1]) || 0;
function renderHealth() {
  const R = healthRows(); const n = R.filter(r => r[0] === 'warn' || r[0] === 'bad').length;
  const bad = R.some(r => r[0] === 'bad');
  $('#healthSum').textContent = n ? L(`${n} to check`, `${n} للتحقق`) : L('all good', 'كل شيء سليم');
  $('#healthSum').className = bad ? 'hs hs-bad' : n ? 'hs hs-warn' : 'hs hs-ok';
  const ic = { ok: ['✓', L('OK', 'سليم')], warn: ['!', L('Check', 'للتحقق')], bad: ['!', L('Problem', 'مشكلة')], info: ['i', L('Note', 'ملاحظة')] };
  $('#health').innerHTML = `<ul class="health">${R.map(([lv, t, d]) => `<li class="${lv}"><span class="ic" aria-label="${ic[lv][1]}">${ic[lv][0]}</span><span><b>${t}</b>${d ? `<span class="m">${d}</span>` : ''}</span></li>`).join('')}</ul>
    <p class="hint">${L('Checked each time the dashboard or the site file is read.', 'يُفحص في كل مرة تُقرأ فيها لوحة المتابعة أو ملف الموقع.')} <a href="#" data-howto>${L('Weekly routine', 'الخطوات الأسبوعية')}</a></p>
    <h3 class="hh">${L('How this link stays up to date', 'كيف يبقى هذا الرابط محدّثاً')}</h3>${liveHowHtml()}`;
}
function renderWarn() {
  const seq = CHECKS.filter(c => c.kind === 'seq'); const el = $('#warn');
  if (!seq.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = AR() ? `<span class="ic">!</span><span><b>${cnt(seq.length, 'clash')} في البرنامج الزمني</b>أعمدة مخططة قبل البلاطة التي تقوم عليها (${esc(listJoin(uniq(seq.map(c => PKG[c.fl].longAr))))}). <u>مراجعة</u></span>`
    : `<span class="ic">!</span><span><b>${plural(seq.length, 'sequence clash', 'sequence clashes')} in the programme</b>Columns are planned before the slab they stand on (${esc(listJoin(uniq(seq.map(c => PKG[c.fl].long.toLowerCase()))))}). <u>Review</u></span>`;
}
function renderStamp() {
  let t;
  const key = (pairs, list) => pairs.filter(([g]) => list.some(o => o.group === g)).map(([g, l]) => `<span><i style="background:var(${GROUP_COLOR[g]})"></i>${esc(l)}</span>`).join('');
  if (S.hl) t = `${L('Programme check', 'تدقيق البرنامج الزمني')}<small>${esc(S.hl.label)}</small><span class="k">${S.hl.legend.map(([c, l]) => `<span><i style="background:var(${c})"></i>${esc(l)}</span>`).join('')}</span>`;
  else if (S.mode === 'time') t = `${esc(fmtDW(S.t))}<small>${L(`Dashboard dates: recorded to ${esc(fmtD(DATA.dataDate))}, forecast after`, `تواريخ لوحة المتابعة: مسجّلة حتى ${esc(fmtD(DATA.dataDate))}، ومتوقعة بعده`)}</small>`;
  else if (changeOn()) {
    t = `${L('Done since', 'المنجز منذ')} ${esc(fmtD(PREV.dataDate, true))}<small>${L(`Dashboard ${esc(fmtD(PREV.dataDate))} to ${esc(fmtD(DATA.dataDate))}${DATA.siteUsed.length ? `, plus site updates to ${esc(fmtD(DATA.asOf))}` : ''}`, `لوحة المتابعة من ${esc(fmtD(PREV.dataDate))} إلى ${esc(fmtD(DATA.dataDate))}${DATA.siteUsed.length ? `، مع تحديثات الموقع حتى ${esc(fmtD(DATA.asOf))}` : ''}`)}</small>
      <span class="k">${key([['chcast', L('Cast', 'صُبّ')], ['chprog', L('Moved on', 'تقدّم')]], S.pins || [])}<span><i style="background:var(--before)"></i>${L('Built before', 'منفّذ سابقاً')}</span></span>`;
  }
  else if (delayOn()) {
    t = `${L('Top delays at', 'أكبر التأخيرات في')} ${esc(fmtD(DATA.dataDate, true))}<small>${L('Days late against the baseline, from the dashboard', 'أيام التأخير مقارنة بالخطة الأساسية، من لوحة المتابعة')}</small>
      <span class="k">${key([['late', L('Late', 'متأخر')], ['behind', L('Behind plan', 'خلف الخطة')]], S.pins || [])}</span>`;
  }
  else if (S.mode === 'pva') t = `${L('Plan vs actual at', 'المخطط مقابل الفعلي في')} ${esc(fmtD(DATA.dataDate, true))}<small>${L("Baseline plan % against the dashboard's actual %", 'نسبة الخطة الأساسية مقابل النسبة الفعلية في لوحة المتابعة')}</small>`;
  else if (weekOn()) {
    const w = curWin();
    t = `${esc(w.label)}: ${esc(fmtRange(w.from, w.to, true))}<small>${L(`Structural work from the dashboard of ${esc(fmtD(DATA.dataDate))}${DATA.siteUsed.length ? ` and site updates to ${esc(fmtD(DATA.asOf))}` : ''}`, `الأعمال الإنشائية من لوحة المتابعة بتاريخ ${esc(fmtD(DATA.dataDate))}${DATA.siteUsed.length ? ` وتحديثات الموقع حتى ${esc(fmtD(DATA.asOf))}` : ''}`)}</small>
      <span class="k">${key([['carried', L('Carried over', 'مرحّل')], ['progress', L('In progress', 'قيد التنفيذ')], ['starting', L('Starting', 'يبدأ')]], S.pins || weekItems())}</span>`;
  }
  else {
    const w = curWin();
    t = `${L('Site status', 'حالة الموقع')} ${esc(fmtD(DATA.asOf, true))}<small>${DATA.siteUsed.length ? L(`Dashboard ${esc(fmtD(DATA.dataDate))} plus site updates`, `لوحة المتابعة ${esc(fmtD(DATA.dataDate))} مع تحديثات الموقع`) : L('From the dashboard', 'من لوحة المتابعة')} · ${L('blue: planned by', 'الأزرق: مخطط حتى')} ${esc(fmtD(w.to))}</small>`;
  }
  if (S.focus) t += `<small>${L('Showing:', 'المعروض:')} ${esc(S.focusLabel)}</small>`;
  else if (floorText() && !S.hl) t += `<small>${esc(floorText())}</small>`;
  $('#stamp').innerHTML = t;
}
function renderLegend() {
  if (S.hl) {
    $('#legTitle').textContent = L('Programme check', 'تدقيق البرنامج الزمني');
    $('#legNote').textContent = '';
    $('#legend').innerHTML = S.hl.legend.map(([c, l]) => `<li aria-disabled="true"><span class="sw" style="background:var(${c})"></span><span>${esc(l)}</span></li>`).join('') +
      `<li aria-disabled="true"><span class="sw ghost"></span><span>${T_ELSE()}</span></li>`;
    $('#legHint').innerHTML = `<button class="btn" type="button" data-clear>${L('Back to the full model', 'العودة إلى النموذج كاملاً')}</button>`;
    renderStamp(); return;
  }
  const defs = legendDefs();
  $('#legTitle').textContent = weekOn() ? L(`Focus: ${curWin().name}`, `التركيز: ${curWin().name}`) : delayOn() ? L('Focus: top delays', 'التركيز: أكبر التأخيرات') : changeOn() ? L(`Focus: done since ${prevDate()}`, `التركيز: المنجز منذ ${prevDate()}`)
    : { status: L('Site status colours', 'ألوان حالة الموقع'), pva: L('Plan vs actual colours', 'ألوان المخطط مقابل الفعلي'), time: L('Status on the chosen date', 'الحالة في التاريخ المختار') }[S.mode];
  $('#legNote').textContent = S.legendFilter ? L('tap again to show all', 'اضغط مرة أخرى لإظهار الكل') : L('tap a colour to show only those', 'اضغط على لون لإظهار عناصره فقط');
  $('#legend').innerHTML = defs.filter(d => (S.counts?.[d.k] || 0) > 0 || ['built', 'next', 'none', 'ontrack', 'behind', 'notdue', 'dim'].includes(d.k)).map(d => {
    const n = S.counts?.[d.k] || 0;
    const sw = d.c === 'ghost' ? '<span class="sw ghost"></span>' : `<span class="sw" style="background:var(${d.c})"></span>`;
    return `<li role="button" tabindex="0" data-k="${d.k}" aria-pressed="${S.legendFilter === d.k}">${sw}<span>${esc(d.label)}</span></li>`;
  }).join('');
  $('#legHint').textContent = pinsOn() ? L('Numbers on the model match the list below. Tap a number to see that work alone.', 'الأرقام على النموذج تطابق القائمة أدناه. اضغط على رقم لعرض ذلك العمل وحده.') : {
    status: L(`From each activity's % complete in the dashboard${DATA.siteUsed.length ? ', updated with the site updates below' : ''}. Numbers count model elements.`, `من نسبة إنجاز كل نشاط في لوحة المتابعة${DATA.siteUsed.length ? '، مع تحديثات الموقع أدناه' : ''}. الأرقام تمثل عدد عناصر النموذج.`),
    pva: L('Compares the baseline plan % with the dashboard\'s actual % at its data date. Site updates are not included here.', 'يقارن نسبة الخطة الأساسية بالنسبة الفعلية في لوحة المتابعة بتاريخ البيانات. لا تُحتسب تحديثات الموقع هنا.'),
    time: L('Drag the date bar or press play. Each activity\'s progress is spread evenly over its dates.', 'اسحب شريط التاريخ أو اضغط تشغيل. يُوزَّع إنجاز كل نشاط بالتساوي على مدته.'),
  }[S.mode];
  renderStamp();
}
function actRow(a, x = {}) {
  const st = STAGES[a.stage];
  const items = itemsOfAct(a.id).filter(w => w.els.length);
  const where = items.length ? uniq(items.map(itemLabel)).join(L('; ', '؛ ')) : L('not in the structural model', 'غير موجود في النموذج الإنشائي');
  const flags = [];
  if (x.group === 'carried') flags.push(`<span class="late">${L('was due', 'كان مستحقاً')} ${esc(fmtD(a.finish))}</span>`);
  else if (x.lateStart) flags.push(`<span class="late">${L('was due to start', 'كان يجب أن يبدأ')} ${esc(fmtD(a.start))}</span>`);
  if (a.site) flags.push(`<span class="tag">${L('site update', 'تحديث الموقع')} ${esc(fmtD(a.site.t))}</span>`);
  if (a.reversed) flags.push(`<span class="late">${L('dates reversed in the dashboard', 'التواريخ معكوسة في لوحة المتابعة')}</span>`);
  const m3 = castM3(a);
  const fl = a.float != null && a.float !== '' ? ` · ${L('float', 'الفائض')} ${esc(fmtFloat(a.float))}` : '';
  const dot = x.num ? `<span class="num" style="${pinStyle(x.numGroup)}">${x.num}</span>` : `<span class="dot" style="background:var(${st.color})"></span>`;
  return `<li><button type="button" data-act="${esc(a.id)}" aria-pressed="${S.focusAct === a.id}"${AR() ? ` title="${esc(a.name)}"` : ''}>${dot}
    <span class="t">${esc(aName(a))}</span><span class="p">${esc(pct(a.act))}</span>
    <span class="m">${esc(a.short)} · ${esc(where)}<br>${esc(fmtRange(a.start, a.finish))}${fl}${m3 ? ` · ${L('about', 'حوالي')} ${esc(fmtM3(m3))} ${L('concrete', 'خرسانة')}` : ''}${flags.length ? '<br>' + flags.join(' · ') : ''}</span></button></li>`;
}
// "Done since last week": what moved on between the last two weekly updates, plus site updates since.
function pastHtml() {
  if (!PREV || PREV.forDate !== DATA.dataDate) return `<div class="past"><h2><span>${L('Done since last week', 'المنجز منذ الأسبوع الماضي')}</span></h2><p class="sum">${L("Reading last week's dashboard…", 'جارٍ قراءة لوحة متابعة الأسبوع الماضي…')}</p></div>`;
  if (PREV.none) return '';
  const CH = changeItems(); const cast = CH.filter(o => o.group === 'chcast'), prog = CH.filter(o => o.group === 'chprog');
  const names = xs => AR() ? listJoin(xs.slice(0, 3).map(o => wName(o.w))) + (xs.length > 3 ? ` و${xs.length - 3} أخرى` : '')
    : listJoin(xs.slice(0, 3).map(o => o.w.name.replace(/^./, c => c.toLowerCase()))) + (xs.length > 3 ? ` and ${xs.length - 3} more` : '');
  const m3 = sum(cast, o => o.m3);
  const txt = CH.length ? [cast.length ? L(`Concrete cast: ${names(cast)}${m3 >= 0.1 ? ` (about ${fmtM3(m3)})` : ''}.`, `تم صب: ${names(cast)}${m3 >= 0.1 ? ` (حوالي ${fmtM3(m3)})` : ''}.`) : '',
    prog.length ? L(`Moved on: ${names(prog)}.`, `تقدّم العمل في: ${names(prog)}.`) : ''].filter(Boolean).join(' ') : L('No progress recorded since then.', 'لم يُسجَّل أي تقدم منذ ذلك الحين.');
  return `<div class="past"><h2><span>${L('Done since', 'المنجز منذ')} ${esc(fmtD(PREV.dataDate))}</span><small>${L('dashboard', 'لوحة المتابعة')} ${esc(fmtD(PREV.dataDate))} ${L('to', 'إلى')} ${esc(fmtD(DATA.dataDate))}${DATA.siteUsed.length ? L(`, site to ${esc(fmtD(DATA.asOf))}`, `، الموقع حتى ${esc(fmtD(DATA.asOf))}`) : ''}</small></h2>
    <p class="sum">${esc(txt)}</p>
    ${CH.length ? `<div class="acts-row"><button class="btn${changeOn() ? ' on' : ''}" type="button" data-changes aria-pressed="${changeOn()}">${changeOn() ? T_FULL() : L('Show it in 3D', 'اعرضه في النموذج')}</button></div>` : ''}
    ${changeOn() ? `<ul class="list">${CH.map(o => `<li><button type="button" data-item="${esc(o.w.key)}" aria-pressed="${S.focusItem === o.w.key}"><span class="num" style="${pinStyle(o.group)}">${o.n}</span><span class="t">${esc(itemLabel(o.w))}</span><span class="p"></span><span class="m">${esc(calloutText(o))}</span></button></li>`).join('')}</ul>` : ''}</div>`;
}
const T_FULL = () => L('Show the full model', 'إظهار النموذج كاملاً');
function renderModeBody() {
  const box = $('#modeBody');
  if (S.mode === 'status') {
    const W = windows(); const w = W[S.win];
    const la = lookAhead(w); const P = pours(la);
    if (weekOn()) { const wm = new Map(weekItems().map(o => [o.w.key, o])); for (const x of la) { const o = itemsOfAct(x.a.id).map(it => wm.get(it.key)).find(Boolean); if (o) { x.num = o.n; x.numGroup = o.group; } } }
    const n = g => la.filter(x => x.group === g).length;
    const seg = k => `<button type="button" data-win="${k}" aria-pressed="${S.win === k}">${W[k].label}<small>${esc(fmtRange(W[k].from, W[k].to))}</small></button>`;
    const parts = AR() ? [n('carried') && `${n('carried')} مرحّل`, n('progress') && `${n('progress')} قيد التنفيذ`, n('starting') && `${n('starting')} تبدأ`].filter(Boolean)
      : [n('carried') && `${n('carried')} carried over`, n('progress') && `${n('progress')} in progress`, n('starting') && `${n('starting')} starting`].filter(Boolean);
    box.innerHTML = pastHtml() + `<h2><span>${L('Planned structural work', 'الأعمال الإنشائية المخططة')}</span><small>${L('weeks run Friday to Thursday', 'الأسبوع من الجمعة إلى الخميس')}</small></h2>
      <div class="seg" role="group" aria-label="${L('Look-ahead', 'الفترة القادمة')}">${['this', 'next', 'three'].map(seg).join('')}</div>
      <p class="sum">${la.length ? L(`${esc(listJoin(parts))} by ${esc(fmtD(w.to, true))}. Tap one to see it in the model.`, `${esc(listJoin(parts))} حتى ${esc(fmtD(w.to, true))}. اضغط على أي منها لرؤيته في النموذج.`) : L('Nothing is due in this window.', 'لا يوجد عمل مستحق في هذه الفترة.')}</p>
      <div class="acts-row"><button class="btn${S.weekFocus ? ' on' : ''}" type="button" data-week aria-pressed="${S.weekFocus}">${S.weekFocus ? T_FULL() : L('Show only this in 3D', 'اعرض هذه فقط في النموذج')}</button><button class="btn" type="button" data-copy>${L('Copy list', 'نسخ القائمة')}</button></div>
      <ul class="list">${GROUPS.map(g => {
        const xs = la.filter(x => x.group === g); if (!xs.length) return '';
        return `<li class="grp">${esc(groupLabel(g, w))}</li>` + xs.map(x => actRow(x.a, x)).join('');
      }).join('')}</ul>
      ${P.length ? `<div class="pour"><b>${L('Concrete to pour: about', 'الخرسانة المطلوب صبها: حوالي')} ${esc(fmtM3(sum(P, p => p.m3)))}</b> ${L(`in ${plural(P.length, 'pour')}, from the model volumes:`, `في ${cnt(P.length, 'pour', true)}، من كميات النموذج:`)}<br>${P.map(p => `${esc(fmtD(p.t))}${p.carried ? ` <span class="late">${L('carried over', 'مرحّل')}</span>` : ''}: ${esc(p.items.map(itemLabel).join(L(', ', '، ')))}, ${esc(fmtM3(p.m3))}`).join('<br>')}</div>` : ''}`;
  } else if (S.mode === 'pva') {
    const DL = delayItems(); const late = DL.filter(o => o.group === 'late').length;
    const row = o => `<li><button type="button" data-item="${esc(o.w.key)}" aria-pressed="${S.focusItem === o.w.key}">${delayOn() ? `<span class="num" style="${pinStyle(o.group)}">${o.n}</span>` : `<span class="dot" style="background:var(${GROUP_COLOR[o.group]})"></span>`}
        <span class="t">${esc(itemLabel(o.w))}</span><span class="p${o.group === 'late' ? ' late' : ''}">${o.days ? AR() ? `${o.days} يوم` : `${o.atLeast ? '≥' : '~'}${o.days} d` : '—'}</span>
        <span class="m">${o.days ? esc(AR() ? daysText(o) : daysText(o).replace(/^./, c => c.toUpperCase())) : L('Behind plan', 'خلف الخطة')}${o.a ? `: ${esc(o.a.short)} ${esc(sLow(o.a.stage))}${L(', forecast to finish ', '، الانتهاء المتوقع ')}${esc(fmtD(o.a.finish))}` : ''}${o.a && +o.a.float < 0 ? ` · <span title="${L('Negative total float: on the critical path', 'فائض كلي سالب: على المسار الحرج')}">${L('critical, float', 'حرج، الفائض')} ${esc(fmtFloat(o.a.float))}</span>` : ''}
        <span class="pv">${L('Plan', 'المخطط')} ${esc(pct(o.plan))}${L(', done ', '، المنجز ')}${esc(pct(o.act))}</span><span class="bar"><i style="width:${Math.min(100, o.act)}%;background:var(--built)"></i><u style="inset-inline-start:${Math.min(99.5, o.plan)}%"></u></span></span></button></li>`;
    box.innerHTML = `<h2><span>${L('Top delays at', 'أكبر التأخيرات في')} ${esc(fmtD(DATA.dataDate))}</span><small>${DL.length ? L(`${plural(DL.length, 'work item')} behind plan`, `${cnt(DL.length, 'item')} خلف الخطة`) : ''}</small></h2>
      <p class="sum">${DL.length ? L(`${late ? `${plural(late, 'work item')} late, ` : ''}most days late first. Days late compare the dashboard's forecast finish with the baseline.`, `${late ? `المتأخرة: ${late}. ` : ''}الأكثر تأخيراً أولاً. تقارن أيام التأخير الانتهاء المتوقع في لوحة المتابعة بالخطة الأساسية.`) : L('Everything is on plan.', 'كل شيء حسب الخطة.')}</p>
      ${DL.length ? `<div class="acts-row"><button class="btn${S.delayFocus ? ' on' : ''}" type="button" data-delays aria-pressed="${S.delayFocus}">${S.delayFocus ? T_FULL() : L('Show only these in 3D', 'اعرض هذه فقط في النموذج')}</button><button class="btn" type="button" data-copy-delays>${L('Copy list', 'نسخ القائمة')}</button></div>` : ''}
      <ul class="list">${DL.map(row).join('')}</ul>`;
  } else {
    const t = S.t;
    const active = [...DATA.acts.values()].filter(a => isStruct(a) && a.start != null && a.start <= t && a.finish + DAY > t).sort((a, b) => a.start - b.start);
    box.innerHTML = `<h2><span>${L('Working on', 'الأعمال الجارية في')} ${esc(fmtD(t, true))}</span><small>${cnt(active.length, 'activity')}</small></h2>
      <ul class="list">${active.length ? active.slice(0, 14).map(a => actRow(a)).join('') : `<li class="empty">${L('No structural activity on this date.', 'لا يوجد نشاط إنشائي في هذا التاريخ.')}</li>`}</ul>`;
  }
}
function renderFloors() {
  $('#floors').innerHTML = [{ k: 'ALL', name: 'All', note: 'The whole structure', ar: 'الكل', noteAr: 'الهيكل كاملاً' }, ...[...PKGS].reverse()].map(p => `<button type="button" data-floor="${p.k}" aria-pressed="${S.floor === p.k}" title="${esc(pNote(p))}">${esc(pName(p))}</button>`).join('');
  $('#floorNote').textContent = floorText() || L('showing the whole structure', 'يُعرض الهيكل كاملاً');
}
const floorText = () => S.floor === 'ALL' ? '' : AR() ? (S.only ? `${PKG[S.floor].longAr} فقط` : `حتى ${PKG[S.floor].longAr}`) : (S.only ? 'Only the ' : 'Up to the ') + PKG[S.floor].long.toLowerCase();
// Lines in the site file (and drafts) that need fixing, in line order.
function siteProblems() {
  const where = (u, k) => u.draft ? L('Draft', 'مسودة') : `${L('Line', 'السطر')} ${u.lineOf[k] ?? Object.values(u.lineOf)[0] ?? '?'}`;
  return [...SITEINFO.problems,
    ...DATA.siteUnknown.map(({ u, k }) => L(`${where(u, k)}: "${k.replace('FUR.M.C.', '')}" is not an activity in the dashboard.`, `${where(u, k)}: "${k.replace('FUR.M.C.', '')}" ليس نشاطاً في لوحة المتابعة.`)),
    ...DATA.siteFuture.map(u => L(`${where(u, Object.keys(u.progress)[0])}: the date ${fmtD(u.t, true)} is after today, so it is not used yet.`, `${where(u, Object.keys(u.progress)[0])}: التاريخ ${fmtD(u.t, true)} بعد اليوم، لذا لن يُستخدم الآن.`))]
    .map(t => [lineNo(t) || (/^(Draft|مسودة)/.test(t) ? 1e9 : -1), t]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
function renderSite() {
  const act = DATA.siteActive, old = DATA.siteOld, info = SITEINFO;
  const latest = [...SITE].sort((a, b) => b.t - a.t)[0];
  $('#siteWho').textContent = latest ? `${L('latest', 'الأحدث')} ${fmtD(latest.t, true)}${latest.by ? L(', ', '، ') + latest.by : ''}` : L('none yet', 'لا يوجد بعد');
  const probs = siteProblems();
  const row = (u, i) => `<li><button type="button" data-site="${i}" aria-pressed="${S.focusSite === i}"><span class="d">${esc(fmtD(u.t, true))}${u.by ? ' · ' + esc(u.by) : ''}</span>${u.draft ? ` <span class="tag draft">${L('draft, this screen only', 'مسودة، على هذه الشاشة فقط')}</span>` : ''}<br><span dir="auto">${esc(u.note || L('(no note)', '(بلا ملاحظة)'))}</span><br>
    <span class="m">${esc(Object.entries(u.progress).map(([k, v]) => `${k.replace('FUR.M.C.', '')} ${DATA.acts.get(k) ? sLow(DATA.acts.get(k).stage) : ''} ${L('→', '←')} ${v}%`).join(L(', ', '، ')))}</span></button></li>`;
  $('#siteList').innerHTML = `${probs.length ? `<div class="probs"><b>${AR() ? `أسطر تحتاج تصحيحاً في ${esc(info.file || 'الملف')}: ${probs.length}` : `${plural(probs.length, 'line needs', 'lines need')} fixing in ${esc(info.file || 'the file')}`}</b><ul>${probs.slice(0, 6).map(p => `<li>${esc(p)}</li>`).join('')}</ul>${probs.length > 6 ? `<p>${L(`and ${probs.length - 6} more.`, `و${probs.length - 6} أخرى.`)}</p>` : ''}</div>` : ''}
    ${act.length ? `<ul class="site">${act.map(row).join('')}</ul>` : `<p class="empty">${L('None newer than the dashboard.', 'لا يوجد ما هو أحدث من لوحة المتابعة.')}</p>`}
    <p class="hint">${AR() ? `الإنجاز المشاهد في الموقع بعد تاريخ بيانات لوحة المتابعة (${esc(fmtD(DATA.dataDate))}). ${info.file ? `مقروء من <code>${esc(info.file)}</code>${info.modified ? `، آخر تعديل ${esc(fmtD(info.modified, true))} ${esc(fmtTime(info.modified))}` : ''}. ` : ''}يتوقف احتساب كل تحديث بمجرد تحديث لوحة المتابعة لما بعد تاريخه${old.length ? `؛ وتحديثات أقدم تغطيها لوحة المتابعة الآن: ${old.length}` : ''}.`
      : `Progress seen on site after the dashboard's data date (${esc(fmtD(DATA.dataDate))}). ${info.file ? `Read from <code>${esc(info.file)}</code>${info.modified ? `, last changed ${esc(fmtD(info.modified, true))} ${esc(fmtTime(info.modified))}` : ''}. ` : ''}Each update stops counting once the dashboard is updated past its date${old.length ? `; ${plural(old.length, 'older update is', 'older updates are')} already covered by the dashboard` : ''}.`}</p>`;
  renderDrafts();
}
// The "Add a site update" form: activities due soon first, then the rest.
function fillSiteForm(pick) {
  const sel = $('#sfAct'); const keep = pick || sel.value;
  const W = windows(); const soon = lookAhead({ from: W.this.from, to: W.three.to }).map(x => x.a);
  const soonIds = new Set(soon.map(a => a.id));
  const rest = [...DATA.acts.values()].filter(a => isStruct(a) && !soonIds.has(a.id)).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const opt = a => `<option value="${esc(a.id)}">${esc(a.short)} · ${esc(aName(a))} (${esc(fmtRange(a.start, a.finish))}${L(', now ', '، الآن ')}${esc(pct(a.act))})</option>`;
  sel.innerHTML = `<option value="">${L('Choose an activity…', 'اختر نشاطاً…')}</option><optgroup label="${L('Due in the next 3 weeks', 'المستحق خلال الأسابيع الثلاثة القادمة')}">${soon.map(opt).join('')}</optgroup><optgroup label="${L('All structural activities', 'كل الأنشطة الإنشائية')}">${rest.map(opt).join('')}</optgroup>`;
  if (keep && DATA.acts.has(keep)) sel.value = keep;
  const d = $('#sfDate'); if (!d.value) d.value = isoDay(localToday());
  const by = $('#sfBy'); if (!by.value) { try { by.value = localStorage.getItem('fur4d.by') || ''; } catch (e) { /* storage blocked */ } }
}
const csvCell = v => /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
function draftLines() {
  return DRAFTS.flatMap(u => Object.entries(u.progress).map(([k, v]) => [u.date, k.replace('FUR.M.C.', ''), v, u.by, u.note].map(csvCell).join(',')));
}
function renderDrafts() {
  const out = $('#siteDraftOut'); if (!out) return;
  if (!DRAFTS.length) { out.innerHTML = ''; return; }
  const lines = draftLines();
  out.innerHTML = `<p class="hint" style="color:var(--ink)">${AR() ? `<b>${cnt(lines.length, 'draft')} على هذه الشاشة فقط.</b> لمشاركتها مع الجميع، أضف ${lines.length === 1 ? 'هذا السطر' : 'هذه الأسطر'} إلى نهاية <code>site-updates.csv</code> على GitHub (أيقونة القلم، ثم لصق، ثم Commit changes):`
      : `<b>${plural(lines.length, 'draft line')} on this screen only.</b> To share ${lines.length === 1 ? 'it' : 'them'} with everyone, add ${lines.length === 1 ? 'this line' : 'these lines'} to the end of <code>site-updates.csv</code> on GitHub (pencil icon, paste, Commit changes):`}</p>
    <pre class="csv">${esc(lines.join('\n'))}</pre>
    <div class="acts-row"><button class="btn" type="button" data-draft-copy>${AR() ? (lines.length === 1 ? 'نسخ السطر' : 'نسخ الأسطر') : `Copy ${lines.length === 1 ? 'line' : 'lines'}`}</button><button class="btn" type="button" data-draft-dl>${L('Download the updated file', 'تنزيل الملف المحدّث')}</button><button class="btn" type="button" data-draft-clear>${L('Clear drafts', 'مسح المسودات')}</button></div>`;
}
function renderChecks() {
  const seq = CHECKS.filter(c => c.kind === 'seq');
  const n = CHECKS.filter(c => c.kind !== 'info').length;
  $('#checksSum').textContent = CHECKS.length ? `${n ? L(`${n} to review`, `${n} للمراجعة`) : ''}${n && CHECKS.length > n ? L(', ', '، ') : ''}${CHECKS.length > n ? AR() ? `${CHECKS.length - n} ${CHECKS.length - n === 1 ? 'ملاحظة' : 'ملاحظات'}` : `${CHECKS.length - n} ${CHECKS.length - n === 1 ? 'note' : 'notes'}` : ''}` : L('nothing found', 'لا شيء');
  $('#checksSum').className = 'hs ' + (n ? 'hs-warn' : 'hs-ok');
  $('#checksSec').innerHTML = `
    ${seq.length ? `<p class="hint" style="margin:0 0 6px">${L('The programme lists each floor\'s columns before its slab. In the model and the BOQ (3.4.1, 3.5.1, 3.6.1), a floor\'s columns rise from that floor\'s slab, so they can only start once it is cast. The 4D follows the BOQ until the programme is confirmed.', 'يضع البرنامج الزمني أعمدة كل دور قبل بلاطته. أما في النموذج وجدول الكميات (3.4.1، 3.5.1، 3.6.1) فأعمدة الدور تقوم على بلاطة ذلك الدور، فلا تبدأ إلا بعد صبها. يتبع النموذج جدول الكميات إلى أن يُؤكَّد البرنامج.')}</p>` : ''}
    <ul class="chk">${CHECKS.map(c => `<li><button type="button" data-check="${esc(c.id)}" aria-pressed="${S.focusCheck === c.id}"><span class="ic ${c.kind === 'seq' ? '' : c.kind}">${c.kind === 'info' ? 'i' : '!'}</span><b>${esc(c.title)}</b><span class="m">${esc(c.text)}</span></button>
      ${c.fix ? `<details class="fix"${c === seq[0] ? ' open' : ''}><summary>${L('Ways to fix it', 'طرق المعالجة')}</summary>${c.fix.map((f, i) => `<p><b>${i + 1}. ${esc(f.k)}.</b> ${esc(f.t)}</p>`).join('')}</details>` : ''}
      ${c.x.length + c.y.length ? `<div class="fixrow"><button class="btn sm" type="button" data-zoomcheck="${esc(c.id)}">${L('Zoom to it in 3D', 'تكبير عليه في النموذج')}</button></div>` : ''}</li>`).join('')}</ul>`;
}
function renderMapping() {
  const rows = PKGS.flatMap(p => Object.values(WORK).filter(w => w.pkg === p.k).map(w => `<tr><td>${esc(pName(p))}</td><td>${esc(wName(w))}</td><td>${w.acts.length ? esc(w.acts.map(x => x.replace('FUR.M.C.', '')).join(', ')) : '—'}</td><td class="r">${w.els.length}</td><td class="r">${w.m3 ? esc(fmtM3(w.m3)) : '—'}</td></tr>`)).join('');
  const layers = LAYERS.filter(l => l.on).map(l => L(l.name, l.ar)).join(L(', ', '، '));
  $('#mapping').innerHTML = AR() ? `<p>يُصنَّف كل عنصر في Revit ضمن بند حسب رمز البند الفرعي في جدول الكميات (BOQ) والفئة والمنسوب. ويرتبط كل بند بأنشطة لوحة المتابعة أدناه. تتبع الألوان نسبة الإنجاز الفعلية للأنشطة (حالة الموقع)، أو نسبة الخطة الأساسية (المخطط مقابل الفعلي)، أو التواريخ (الخط الزمني). كميات الخرسانة من النموذج ولا تشمل بلوك السيبوركس وأعمال البلوك والعزل المائي.</p>
    <p>الطبقات: ${esc(layers)}. يمكن لاحقاً إضافة نماذج الأعمال الكهروميكانيكية (الصرف، التكييف، تغذية المياه، الكهرباء) كطبقات إضافية لها روابطها الخاصة بلوحة المتابعة.</p>
    <table class="map"><thead><tr><th>الدور</th><th>البند</th><th>أنشطة لوحة المتابعة</th><th class="r">العناصر</th><th class="r">الخرسانة</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p>Each Revit element goes into a work item by its BOQ subsection code, category and level. Each work item is tied to the dashboard activities below. Colours follow the activities' actual % (site status), baseline plan % (plan vs actual) or dates (timeline). Concrete volumes come from the model and leave out siporex blocks, blockwork and waterproofing.</p>
    <p>Layers: ${esc(layers)}. The MEP models (drainage, HVAC, water supply, electrical) can be added later as extra layers with their own links to the dashboard.</p>
    <table class="map"><thead><tr><th>Floor</th><th>Work item</th><th>Dashboard activities</th><th class="r">Elements</th><th class="r">Concrete</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function liveHowHtml() { // how this link stays up to date, shown under Data health
  const o = DATA.origin;
  if (AR()) return DATA.live
    ? `<p>تقرأ هذه الصفحة لوحة المتابعة في كل مرة تُفتح، ثم كل ${REFRESH_MINUTES} دقيقة ما دامت مفتوحة، لذا يظهر هنا كل "Publish to live link" في لوحة المتابعة دون أي خطوة إضافية. آخر قراءة الساعة ${esc(fmtTime(DATA.checked))} من <code>${esc(DATA.source)}</code>.</p>
       <p>إذا تعذّرت قراءة لوحة المتابعة (ضعف الشبكة في الموقع، أو تغيّر صيغتها) تستمر الصفحة في عرض آخر نسخة سليمة محفوظة على هذا الجهاز، وتنبّه إلى ذلك في الأعلى، وتعيد المحاولة تلقائياً.</p>
       <p>تحديثات الموقع تأتي من <code>site-updates.csv</code> في نفس مجلد هذه الصفحة. أضف سطراً عندما يكون الموقع متقدماً على لوحة المتابعة (نموذج "إضافة تحديث من الموقع" يكتب السطر لك)؛ ويتوقف احتسابه تلقائياً عندما تلحق به لوحة المتابعة.</p>`
    : `<p>هذه النسخة لا تصل إلى لوحة المتابعة، لذا تعرض بياناتها المحفوظة معها: تاريخ البيانات ${esc(fmtD(DATA.dataDate, true))}${o ? `، من ${esc(o.file)} كما حُفظ <bdi dir="ltr">${esc(o.committed)}</bdi> (${esc(o.commit)})` : ''}.</p>
       <p>لجعلها مباشرة، ضع مجلد <code>furah-4d</code> في مستودع لوحة المتابعة على GitHub بجانب <code>furah.html</code>:</p>
       <ol><li>افتح مستودع ahb-dashboard على GitHub واختر Add file ثم Upload files.</li><li>اسحب مجلد <code>furah-4d</code> ثم Commit.</li><li>افتح <code>${esc(LIVE_HOME)}</code>. يقرأ لوحة المتابعة في كل زيارة، فيظهر كل تحديث أسبوعي تلقائياً.</li></ol>
       <p>تحديثات الموقع تُكتب في <code>furah-4d/site-updates.csv</code>، سطر لكل نشاط: التاريخ، النشاط، النسبة، الاسم، الملاحظة. ويتوقف احتساب كل سطر بعد تحديث لوحة المتابعة لما بعد تاريخه.</p>`;
  return DATA.live
    ? `<p>This page reads the dashboard every time it opens and again every ${REFRESH_MINUTES} minutes while it stays open, so each "Publish to live link" on the dashboard shows here with no extra step. Last read ${esc(fmtTime(DATA.checked))} from <code>${esc(DATA.source)}</code>.</p>
       <p>If the dashboard cannot be read (no signal on site, or its format changes), the page keeps showing the last good copy saved on this device, says so at the top, and tries again by itself.</p>
       <p>Site updates come from <code>site-updates.csv</code> in the same folder as this page. Add a line there when site is ahead of the dashboard (the "Add a site update" form writes the line for you); it stops counting by itself once the dashboard catches up.</p>`
    : `<p>This copy cannot reach the dashboard, so it shows the dashboard data saved with it: data date ${esc(fmtD(DATA.dataDate, true))}${o ? `, from ${esc(o.file)} as committed ${esc(o.committed)} (${esc(o.commit)})` : ''}.</p>
       <p>To make it live, put the <code>furah-4d</code> folder in the dashboard's GitHub repository, next to <code>furah.html</code>:</p>
       <ol><li>Open the ahb-dashboard repository on GitHub and choose Add file, then Upload files.</li><li>Drag in the <code>furah-4d</code> folder and commit.</li><li>Open <code>${esc(LIVE_HOME)}</code>. It reads the dashboard on every visit, so each weekly update flows through.</li></ol>
       <p>Site updates go in <code>furah-4d/site-updates.csv</code>, one line per activity: date, activity, percent, by, note. Each one stops counting once the dashboard is updated past its date.</p>`;
}
function renderFoot() {
  const i = M.info;
  const exp = parseIso(i.exported) != null ? `${fmtD(parseIso(i.exported), true)} ${String(i.exported).slice(11, 16)}` : i.exported;
  const layers = LAYERS.filter(l => l.on).map(l => L(l.name, l.ar)).join(L(', ', '، '));
  $('#foot').innerHTML = AR() ? `النموذج 4D ${VERSION}. النموذج: <bdi>${esc(i.source)}</bdi>، صُدِّر ${esc(exp)} (${M.els.length} عنصراً إنشائياً؛ الطبقات: ${esc(layers)}). البرنامج الزمني: لوحة متابعة AHB، ${DATA.live ? 'مقروءة مباشرة' : DATA.source === 'lastGood' ? 'آخر نسخة سليمة على هذا الجهاز' : 'نسخة محفوظة'}، <bdi>${esc(DATA.project)}</bdi>. <a href="#" data-tour>جولة سريعة</a>`
    : `4D ${VERSION}. Model: ${esc(i.source)}, exported ${esc(exp)} (${M.els.length} structural elements; layers: ${esc(layers)}). Programme: AHB dashboard, ${DATA.live ? 'read live' : DATA.source === 'lastGood' ? 'last good copy on this device' : 'saved copy'}, ${esc(DATA.project)}. <a href="#" data-tour>Quick tour</a>`;
}
function stateText(w) {
  const st = itemState(w, a => a.act);
  if (st.s === 'built') return { label: L('Built: concrete cast', 'منفّذ: تم صب الخرسانة'), c: '--built' };
  if (st.s === 'none') return { label: L('Not started yet', 'لم يبدأ بعد'), c: '--ghost' };
  if (st.s === 'nolink') return { label: T_NOPROG(), c: '--ghost' };
  const lab = sLabel(st.stage);
  if (st.done) return { label: AR() ? `${lab}: منتهية${st.next ? `، والتالي ${sLow(st.next.stage)} (${fmtD(st.next.start)})` : ''}` : `${lab} done${st.next ? `, ${sLow(st.next.stage)} next (${fmtD(st.next.start)})` : ''}`, c: STAGES[st.stage].color };
  return { label: AR() ? `${lab} قيد التنفيذ، ${pct(st.p)}` : `${lab} in progress, ${pct(st.p)}`, c: STAGES[st.stage].color };
}
function docRows(w) {
  const ds = docsFor(w.acts);
  if (!ds.length) return `<p class="ph">${AR() ? `لا توجد طلبات فحص WIR أو MIR أو صور أو مستندات مرتبطة بعد. ${DOCS.file ? 'أضف سطراً لهذا العمل في <code>documents.csv</code>' : 'أضف ملف <code>documents.csv</code> بجانب صفحة النموذج'} لعرضها هنا.`
    : `No WIR, MIR, photos or documents linked yet. ${DOCS.file ? 'Add a line for this work to <code>documents.csv</code>' : 'Add a <code>documents.csv</code> file next to the 4D page'} to show them here.`}</p>`;
  return `<ul class="docs">${ds.map(d => `<li><span class="dt">${esc(docType(d.type))}</span><span class="dm"><b dir="auto">${esc(d.ref || d.note || docType(d.type))}</b>${d.status ? ` <span class="ds${d.code ? ' c' + d.code : ''}">${esc(d.status)}</span>` : ''}
    <span class="k">${d.t != null ? esc(fmtD(d.t, true)) + ' · ' : ''}${esc(d.ids.map(id => id.replace('FUR.M.C.', '')).join(', '))}${d.ref && d.note ? ' · <span dir="auto">' + esc(d.note) + '</span>' : ''}</span></span>${d.link ? `<a class="btn sm" href="${esc(d.link)}" target="_blank" rel="noopener">${L('Open', 'فتح')}</a>` : ''}</li>`).join('')}</ul>`;
}
function renderCard() {
  const card = $('#card');
  if (S.sel < 0) { card.classList.remove('on'); card.innerHTML = ''; $('#stage').classList.remove('carded'); return; }
  const e = M.els[S.sel]; const w = WORK[e.w];
  const st = stateText(w); const pv = pva(w);
  const CAT_AR = { 'Structural Framing': 'إطار إنشائي (كمرات)', 'Walls': 'جدران', 'Structural Columns': 'أعمدة إنشائية', 'Floors': 'بلاطات', 'Structural Foundations': 'أساسات إنشائية', 'Stairs': 'درج', 'Generic Models': 'نماذج عامة' };
  const dims = [AR() ? (CAT_AR[e.c] || e.c) : e.c, e.l ? L('level ', 'المنسوب ') + e.l : null, e.b && e.tp ? `${e.b} ${L('to', 'إلى')} ${e.tp}` : null, e.q ? 'BOQ ' + e.q : null, e.mk && e.mk !== 'PLANTED COLUMN' ? L('mark ', 'العلامة ') + e.mk : (e.mk ? L('planted column', 'عمود مزروع') : null)].filter(Boolean);
  const acts = linked(w);
  const rows = acts.map(a => `<tr><td>${esc(sLabel(a.stage))}<span class="id">${esc(a.short)}</span></td><td>${esc(fmtRange(a.start, a.finish))}</td><td class="r">${esc(pct(a.plan))}</td><td class="r">${esc(pct(a.act))}${a.site ? '*' : ''}</td></tr>`).join('');
  const siteActs = acts.filter(a => a.site);
  const note = S.mode === 'pva' ? ({ late: L('Should be finished by the data date.', 'كان يجب أن ينتهي بحلول تاريخ البيانات.'), behind: L('Behind the baseline plan.', 'خلف الخطة الأساسية.'), ontrack: L('On plan.', 'حسب الخطة.') }[pv.s] || '') : '';
  card.innerHTML = `<button class="x" type="button" aria-label="${L('Close', 'إغلاق')}" data-close>×</button>
    <h3>${esc(pLong(PKG[w.pkg]))} · ${esc(wName(w))}</h3>
    <div class="k"><bdi>${esc(e.t || '')}</bdi></div><div class="k">${esc(dims.join(' · '))}</div>
    <div class="st"><i style="background:var(${st.c})"></i>${esc(st.label)}${note ? ` <span class="k" style="font-weight:500">· ${esc(note)}</span>` : ''}</div>
    ${siteActs.length ? `<p class="note"><span class="tag">${L('site update', 'تحديث الموقع')}</span> ${uniq(siteActs.map(a => `${esc(fmtD(a.site.t))}${a.site.by ? `${L(', ', '، ')}<bdi>${esc(a.site.by)}</bdi>` : ''}${a.site.note ? `: <bdi>${esc(a.site.note)}</bdi>` : ''}`)).join(' ')}</p>` : ''}
    <h4>${L('Programme', 'البرنامج الزمني')}</h4>
    ${acts.length ? `<table class="acts"><thead><tr><th>${L('Stage', 'المرحلة')}</th><th>${L('Dates', 'التواريخ')}</th><th class="r">${L('Plan', 'المخطط')}</th><th class="r">${L('Actual', 'الفعلي')}</th></tr></thead><tbody>${rows}</tbody></table>${siteActs.length ? `<p class="k" style="margin:4px 0 0">${L('* from a site update; the dashboard shows', '* من تحديث الموقع؛ لوحة المتابعة تُظهر')} ${esc(siteActs.map(a => `${a.short} ${pct(a.site.from)}`).join(L(', ', '، ')))}.</p>` : ''}` : `<p class="k">${L('This element has no matching activity in the dashboard yet.', 'لا يوجد لهذا العنصر نشاط مطابق في لوحة المتابعة بعد.')}</p>`}
    <h4>${L('Quantities', 'الكميات')}</h4>
    <p class="note">${e.m3 ? L(`This element: ${esc(fmtM3(e.m3))} concrete. `, `هذا العنصر: ${esc(fmtM3(e.m3))} خرسانة. `) : (e.v ? L(`This element: ${esc(fmtM3(e.v))} (not concrete). `, `هذا العنصر: ${esc(fmtM3(e.v))} (ليست خرسانة). `) : '')}${L('Work item:', 'البند:')} ${cnt(w.els.length, 'element')}${w.m3 ? L(`, ${esc(fmtM3(w.m3))} concrete`, `، ${esc(fmtM3(w.m3))} خرسانة`) : ''}.</p>
    <h4>${L('Inspections, photos and documents', 'طلبات الفحص والصور والمستندات')}</h4>
    ${docRows(w)}
    <div class="row"><button type="button" data-isolate="${esc(w.key)}">${L('Show this work item', 'إظهار هذا البند')}</button>${acts.length ? `<button type="button" data-update="${esc(w.key)}">${L('Update progress', 'تحديث الإنجاز')}</button>` : ''}${S.focus || S.hl ? `<button type="button" data-clear>${L('Show everything', 'إظهار الكل')}</button>` : ''}</div>`;
  card.classList.add('on');
  $('#stage').classList.add('carded');
}
function renderAll() {
  if (S.mode !== 'status') { S.weekFocus = false; S.changeFocus = false; }
  if (S.mode !== 'pva') S.delayFocus = false;
  renderKpis(); renderFloorProgress(); renderSource(); renderWarn(); renderModeBody(); renderFloors(); renderSite(); renderChecks(); renderHealth(); paint();
  $('#bWeek').setAttribute('aria-pressed', String(weekOn())); $('#bDone').setAttribute('aria-pressed', String(changeOn())); $('#lens').hidden = S.mode !== 'status';
  $('#tl').classList.toggle('on', S.mode === 'time');
  $('#stage').classList.toggle('timeline', S.mode === 'time');
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)));
  if (S.mode === 'time') renderTimeline();
  resize();
  renderCard();
  saveHash();
}

/* ---------- Copy and print ---------- */
function listText() {
  if (AR()) return listTextAr();
  const w = curWin(); const la = lookAhead(w); const P = pours(la);
  const out = [`Al-Furaih Villa: structural work, ${w.name} (${fmtRange(w.from, w.to, true)})`,
    `Dashboard data date ${fmtD(DATA.dataDate, true)}${DATA.siteUsed.length ? `, with site updates to ${fmtD(DATA.asOf, true)}` : ''}.`];
  const cc = concreteCast();
  if (cc.tot) out.push(`Concrete cast: ${Math.round(cc.cast / cc.tot * 100)}% of ${fmtM3(cc.tot)} (plan ${Math.round(cc.plan / cc.tot * 100)}% at ${fmtD(DATA.dataDate)}).`);
  for (const g of GROUPS) {
    const xs = la.filter(x => x.group === g); if (!xs.length) continue;
    out.push('', groupLabel(g, w) + ':');
    for (const x of xs) {
      const items = itemsOfAct(x.a.id).filter(v => v.els.length).map(itemLabel);
      out.push(`- ${x.a.short} ${x.a.name}${items.length ? ` [${uniq(items).join('; ')}]` : ''}: ${fmtRange(x.a.start, x.a.finish)}${x.a.act > 0 ? `, ${pct(x.a.act)} done` : ''}`);
    }
  }
  if (P.length) { out.push('', `Concrete to pour (model volumes): about ${fmtM3(sum(P, p => p.m3))}`); for (const p of P) out.push(`- ${fmtD(p.t)}${p.carried ? ' (carried over)' : ''}: ${p.items.map(itemLabel).join(', ')}, ${fmtM3(p.m3)}`); }
  const seq = CHECKS.filter(c => c.kind === 'seq');
  if (seq.length) out.push('', `Programme check: ${plural(seq.length, 'sequence clash', 'sequence clashes')}, columns planned before the slab they stand on.`);
  out.push('', `4D view: ${shareUrl()}`);
  return out.join('\n');
}
function listTextAr() { // the same list in Arabic; each line starts with Arabic so chat apps show it right to left
  const w = curWin(); const la = lookAhead(w); const P = pours(la);
  const out = [`فيلا الفريح: الأعمال الإنشائية، ${w.name} (${fmtRange(w.from, w.to, true)})`,
    `تاريخ بيانات لوحة المتابعة ${fmtD(DATA.dataDate, true)}${DATA.siteUsed.length ? `، مع تحديثات الموقع حتى ${fmtD(DATA.asOf, true)}` : ''}.`];
  const cc = concreteCast();
  if (cc.tot) out.push(`الخرسانة المصبوبة: ${Math.round(cc.cast / cc.tot * 100)}% من ${fmtM3(cc.tot)} (المخطط ${Math.round(cc.plan / cc.tot * 100)}% في ${fmtD(DATA.dataDate)}).`);
  for (const g of GROUPS) {
    const xs = la.filter(x => x.group === g); if (!xs.length) continue;
    out.push('', groupLabel(g, w) + ':');
    for (const x of xs) {
      const items = uniq(itemsOfAct(x.a.id).filter(v => v.els.length).map(itemLabel));
      out.push(`- ${aName(x.a)} (${x.a.short})${items.length ? ` [${items.join('؛ ')}]` : ''}: ${fmtRange(x.a.start, x.a.finish)}${x.a.act > 0 ? `، منجز ${pct(x.a.act)}` : ''}`);
    }
  }
  if (P.length) { out.push('', `الخرسانة المطلوب صبها (كميات النموذج): حوالي ${fmtM3(sum(P, p => p.m3))}`); for (const p of P) out.push(`- صبة ${fmtD(p.t)}${p.carried ? ' (مرحّلة)' : ''}: ${p.items.map(itemLabel).join('، ')}، ${fmtM3(p.m3)}`); }
  const seq = CHECKS.filter(c => c.kind === 'seq');
  if (seq.length) out.push('', `تدقيق البرنامج الزمني: ${cnt(seq.length, 'clash')}، أعمدة مخططة قبل البلاطة التي تقوم عليها.`);
  out.push('', `رابط النموذج: ${shareUrl()}`);
  return out.join('\n');
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* fall back */ }
  try {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
/* ---------- Export: the current view on an A4 sheet with the AHB title block, as a picture or a PDF ---------- */
const SHEET = { w: 2339, h: 1654 }; // A4 landscape at 200 dpi
const MM = SHEET.w / 297;
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = src; });
function viewTitle() {
  if (S.hl) { const c = computeChecks().find(x => x.id === S.focusCheck); return `${L('Programme check', 'تدقيق البرنامج الزمني')}: ${c ? c.title : S.hl.label}`; }
  if (weekOn()) { const w = curWin(); return `${w.label}: ${fmtRange(w.from, w.to, true)}`; }
  if (delayOn()) return `${L('Top delays at', 'أكبر التأخيرات في')} ${fmtD(DATA.dataDate, true)}`;
  if (changeOn()) return `${L('Done since', 'المنجز منذ')} ${fmtD(PREV.dataDate, true)}`;
  if (S.mode === 'pva') return `${L('Plan vs actual at', 'المخطط مقابل الفعلي في')} ${fmtD(DATA.dataDate, true)}`;
  if (S.mode === 'time') return `${L('4D timeline', 'الخط الزمني 4D')}: ${fmtDW(S.t)}`;
  return `${L('Site status at', 'حالة الموقع في')} ${fmtD(DATA.asOf, true)}`;
}
// Render the model at the given size in print colours (light, white background) and note where pins and level labels go.
function render3D(wPx, hPx) {
  const { renderer, camera, scene } = three; const root = document.documentElement; const prevTheme = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  for (const k in colorCache) delete colorCache[k];
  paint();
  const cols = {}; for (const d of legendDefs()) cols[d.k] = d.c === 'ghost' ? css('--ghost') : css(d.c);
  for (const g in GROUP_COLOR) cols['g:' + g] = css(GROUP_COLOR[g]);
  const prevBg = scene.background, prevPR = renderer.getPixelRatio();
  scene.background = new THREE.Color(0xffffff);
  three.edgeMat.color.set(0x1b1d1f); three.edgeMat.opacity = 0.34; three.edgeGhostMat.color.set(0x1b1d1f); three.edgeGhostMat.opacity = 0.1; three.ghostMat.opacity = 0.15;
  three.selMesh.visible = false;
  renderer.setPixelRatio(1); renderer.setSize(wPx, hPx, false);
  camera.clearViewOffset(); camera.aspect = wPx / hPx; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const img = document.createElement('canvas'); img.width = wPx; img.height = hPx; img.getContext('2d').drawImage(renderer.domElement, 0, 0);
  const v = new THREE.Vector3();
  const proj = p => { v.copy(p).project(camera); return { x: (v.x + 1) / 2 * wPx, y: (1 - v.y) / 2 * hPx, front: v.z < 1 }; };
  const pins = shownPins().map(o => ({ o, ...proj(anchorOf(o.w)) }));
  const b = M.box;
  const levels = (three.controls.getPolarAngle() < 0.45 ? [] : M.info.levels.filter(l => l.name !== 'STREET LEVEL')).map(l => {
    const best = [[b.minX, b.maxZ], [b.maxX, b.maxZ], [b.minX, b.minZ], [b.maxX, b.minZ]].map(([x, z]) => proj(new THREE.Vector3(x, l.elev, z))).reduce((m, q) => q.x < m.x ? q : m);
    return { ...best, text: levelTag(l) };
  });
  // back to the screen
  if (prevTheme == null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', prevTheme);
  scene.background = prevBg; three.selMesh.visible = true;
  renderer.setPixelRatio(prevPR); resize(); applyTheme();
  return { img, pins, levels, cols };
}
function wrapText(g, text, maxW, maxLines = 99) {
  const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (!cur || g.measureText(t).width <= maxW) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = fitText(g, lines[maxLines - 1] + ' …', maxW); }
  return lines.map(l => fitText(g, l, maxW));
}
function fitText(g, text, maxW) { if (g.measureText(text).width <= maxW) return text; let t = text; while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t.trimEnd() + '…'; }
function sheetList() { // the list beside the picture: what this view is about
  if (S.hl) { const c = computeChecks().find(x => x.id === S.focusCheck); return { head: 'Programme check', items: c ? [{ name: c.title, text: c.text }, ...(c.fix || []).map((f, i) => ({ name: `${i + 1}. ${f.k}`, text: f.t }))] : [] }; }
  if (pinsOn()) {
    const items = shownPins().map(o => ({ n: o.n, g: o.group, name: itemLabel(o.w), text: calloutText(o) }));
    return { head: weekOn() ? `${curWin().label} · ${fmtRange(curWin().from, curWin().to, true)}` : delayOn() ? `Top delays · data date ${fmtD(DATA.dataDate, true)}` : `Done since ${fmtD(PREV.dataDate, true)}`, items, pins: true };
  }
  if (S.mode === 'status') { const w = curWin(); return { head: `Planned: ${w.name} · ${fmtRange(w.from, w.to, true)}`, items: weekItems().map(o => ({ g: o.group, name: itemLabel(o.w), text: calloutText(o) })) }; }
  if (S.mode === 'pva') return { head: `Top delays · data date ${fmtD(DATA.dataDate, true)}`, items: delayItems().map(o => ({ g: o.group, name: itemLabel(o.w), text: calloutText(o) })) };
  const t = S.t; const act = [...DATA.acts.values()].filter(a => isStruct(a) && a.start != null && a.start <= t && a.finish + DAY > t).sort((a, b) => a.start - b.start);
  return { head: `Working on ${fmtD(t, true)}`, items: act.map(a => ({ g: null, c: STAGES[a.stage].color, name: `${a.short} ${a.name}`, text: `${fmtRange(a.start, a.finish)} · ${uniq(itemsOfAct(a.id).filter(w => w.els.length).map(itemLabel)).join('; ') || 'not in the model'}` })) };
}
async function buildSheet() {
  const { AHB_LOGO, AHB_LOGO_AR } = await import('./logos.js');
  const [lg1, lg2] = await Promise.all([loadImg(AHB_LOGO), loadImg(AHB_LOGO_AR)]);
  const cv = inEn(() => drawSheet(lg1, lg2)); // the sheet keeps AHB's English title block
  if (AR()) paint(); // the screen goes back to Arabic
  return cv;
}
function drawSheet(lg1, lg2) {
  const W = SHEET.w, H = SHEET.h, m = MM, X0 = 10 * m, X1 = W - 10 * m;
  const pic = { x: X0, y: 33 * m, w: 194 * m, h: 132 * m };
  const r = render3D(Math.round(pic.w), Math.round(pic.h));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const F = (mm, wt = 400) => `${wt} ${Math.round(mm * m)}px Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif`;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.textBaseline = 'alphabetic';
  // header: ahb logo left, company logo right, title in the middle
  const h1 = 12 * m, w1 = h1 * lg1.width / lg1.height; g.drawImage(lg1, X0, 10 * m, w1, h1);
  const h2 = 15 * m, w2 = h2 * lg2.width / lg2.height; g.drawImage(lg2, X1 - w2, 8.5 * m, w2, h2);
  const midW = X1 - w2 - X0 - w1 - 16 * m, cx = (X0 + w1 + X1 - w2) / 2;
  g.textAlign = 'center';
  g.fillStyle = '#6f6f6f'; g.font = F(2.5, 700); g.fillText('STRUCTURE 4D  ·  AHB PROJECT DASHBOARD', cx, 13.5 * m);
  g.fillStyle = '#000'; let ts = 5.4; g.font = F(ts, 700); const title = `AL-FURAIH VILLA  ·  ${viewTitle().toUpperCase()}`;
  while (g.measureText(title).width > midW && ts > 3) { ts -= 0.2; g.font = F(ts, 700); }
  g.fillText(title, cx, 20.5 * m);
  g.fillStyle = '#6f6f6f'; g.font = F(2.5);
  g.fillText(fitText(g, `Project 25008  ·  Model ${String(M.info.source || '').replace(/\.rvt$/i, '')}  ·  Dashboard data date ${fmtD(DATA.dataDate, true)}${DATA.siteUsed.length ? `  ·  Site updates to ${fmtD(DATA.asOf, true)}` : ''}`, midW), cx, 25.5 * m);
  g.fillStyle = '#000'; g.fillRect(X0, 28.6 * m, X1 - X0, 0.5 * m);
  // the picture, with level labels and pins
  g.drawImage(r.img, pic.x, pic.y, pic.w, pic.h);
  g.save(); g.beginPath(); g.rect(pic.x, pic.y, pic.w, pic.h); g.clip();
  g.textAlign = 'right'; g.font = F(2.3, 700); g.fillStyle = '#5f666c'; g.strokeStyle = '#5f666c'; g.lineWidth = 0.3 * m;
  for (const l of r.levels) { if (!l.front) continue; const tw = g.measureText(l.text).width; const x = pic.x + l.x - 2 * m, y = pic.y + l.y; if (x - tw < pic.x + 2 * m || y < pic.y + 4 * m || y > pic.y + pic.h - 2 * m) continue; g.fillText(l.text, x - 1.2 * m, y + 0.8 * m); g.beginPath(); g.moveTo(x, y - 1.6 * m); g.lineTo(x, y + 1.6 * m); g.stroke(); }
  const pinAt = (x, y, n, grp, rad) => { g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fillStyle = r.cols['g:' + grp]; g.fill(); g.lineWidth = 0.5 * m; g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = GROUP_INK[grp]; g.textAlign = 'center'; g.font = F(rad / m * 1.05, 700); g.fillText(String(n), x, y + rad * 0.36); };
  const pts = r.pins.map(p => ({ ...p })); const rad = 2.4 * m;
  for (let i = 0; i < pts.length; i++) for (let j = 0; j < i; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < rad * 2.1) { pts[i].x += rad * 2.1; j = -1; }
  for (const p of pts) if (p.front) pinAt(pic.x + p.x, pic.y + p.y, p.o.n, p.o.group, rad);
  g.restore();
  g.strokeStyle = '#bdbdbd'; g.lineWidth = 0.25 * m; g.strokeRect(pic.x, pic.y, pic.w, pic.h);
  // right column: colours, then the list for this view
  const cx0 = pic.x + pic.w + 4 * m, cw = X1 - cx0; let y = pic.y;
  const headRow = (text, right) => { g.fillStyle = '#000'; g.fillRect(cx0, y, cw, 6.2 * m); g.fillStyle = '#fff'; g.font = F(2.5, 700); g.textAlign = 'left'; g.fillText(fitText(g, text.toUpperCase(), cw - (right ? 22 * m : 4 * m)), cx0 + 2 * m, y + 4.3 * m); if (right) { g.textAlign = 'right'; g.font = F(2.2, 400); g.fillText(right, cx0 + cw - 2 * m, y + 4.3 * m); } y += 6.2 * m; };
  const rule = () => { g.fillStyle = '#d6d6d6'; g.fillRect(cx0, y, cw, 0.2 * m); };
  headRow('Colours', S.hl ? '' : 'elements');
  const hlc = S.hl ? computeChecks().find(x => x.id === S.focusCheck) : null;
  const defs = S.hl ? [...(hlc ? hlc.legend : S.hl.legend).map(([c, l]) => ({ label: l, col: css(c) })), { label: T_ELSE(), col: null }]
    : legendDefs().filter(d => (S.counts?.[d.k] || 0) > 0).map(d => ({ label: d.label, col: d.c === 'ghost' ? null : r.cols[d.k], n: S.counts[d.k] }));
  for (const d of defs) {
    g.font = F(2.45); const lines = wrapText(g, d.label, cw - 20 * m, 2); const rh = (2.2 + lines.length * 3.3) * m;
    if (d.col) { g.fillStyle = d.col; g.fillRect(cx0 + 2 * m, y + 1.6 * m, 3.6 * m, 3.6 * m); }
    else { g.strokeStyle = '#9aa0a6'; g.lineWidth = 0.3 * m; g.strokeRect(cx0 + 2 * m, y + 1.6 * m, 3.6 * m, 3.6 * m); g.beginPath(); g.moveTo(cx0 + 2 * m, y + 5.2 * m); g.lineTo(cx0 + 5.6 * m, y + 1.6 * m); g.stroke(); }
    g.fillStyle = '#111'; g.textAlign = 'left'; lines.forEach((l, i) => g.fillText(l, cx0 + 7.5 * m, y + (4.6 + i * 3.3) * m));
    if (d.n != null) { g.textAlign = 'right'; g.fillStyle = '#555'; g.fillText(String(d.n), cx0 + cw - 2 * m, y + 4.6 * m); }
    y += rh; rule();
  }
  y += 4 * m;
  const SL = sheetList(); const bottom = pic.y + pic.h;
  headRow(SL.head, SL.items.length ? String(SL.items.length) : '');
  if (!SL.items.length) { g.font = F(2.45); g.fillStyle = '#555'; g.textAlign = 'left'; g.fillText('Nothing in this list.', cx0 + 2 * m, y + 4.6 * m); }
  for (let i = 0; i < SL.items.length; i++) {
    const it = SL.items[i]; const ind = 8 * m;
    g.font = F(2.45, 700); const nl = wrapText(g, it.name, cw - ind - 2 * m, 2);
    g.font = F(2.25); const tl = wrapText(g, it.text || '', cw - ind - 2 * m, 3);
    const rh = (1.6 + nl.length * 3.2 + tl.length * 3 + 1.4) * m;
    if (y + rh > bottom - (i < SL.items.length - 1 ? 6 * m : 0)) { g.font = F(2.3, 700); g.fillStyle = '#333'; g.textAlign = 'left'; g.fillText(`+ ${SL.items.length - i} more in the 4D view`, cx0 + 2 * m, y + 4.4 * m); break; }
    if (SL.pins) pinAt(cx0 + 3.8 * m, y + 3.9 * m, it.n, it.g, 2.1 * m);
    else { g.beginPath(); g.arc(cx0 + 3.8 * m, y + 3.6 * m, 1.2 * m, 0, Math.PI * 2); g.fillStyle = it.g ? r.cols['g:' + it.g] : css(it.c); g.fill(); }
    g.textAlign = 'left'; g.fillStyle = '#111'; g.font = F(2.45, 700); nl.forEach((l, k) => g.fillText(l, cx0 + ind, y + (4.4 + k * 3.2) * m));
    g.fillStyle = '#555'; g.font = F(2.25); tl.forEach((l, k) => g.fillText(l, cx0 + ind, y + (4.4 + nl.length * 3.2 + k * 3) * m));
    y += rh; rule();
  }
  // title block: grey labels, yellow values (AHB form style)
  let by = 169 * m; const rh = 6.6 * m, lw = 27 * m, vw = (X1 - X0 - 2 * lw) / 2;
  const fl = S.floor === 'ALL' ? 'Whole structure' : floorText();
  const who = (() => { try { return localStorage.getItem('fur4d.by') || ''; } catch (e) { return ''; } })();
  const rows = [
    ['Project', 'Al-Furaih Villa (25008)', 'View', viewTitle()],
    ['Programme', `AHB dashboard, data date ${fmtD(DATA.dataDate, true)} (${DATA.live && !DATA.fail ? 'read live' : DATA.source === 'lastGood' ? 'last good copy' : 'saved copy'})`, 'Floors', fl],
    ['Site updates', DATA.siteUsed.length ? `${plural(DATA.siteUsed.length, 'update')}, latest ${fmtD(DATA.asOf, true)}` : 'None after the data date', 'Model', `${String(M.info.source || '').replace(/\.rvt$/i, '')}${parseIso(M.info.exported) != null ? `, exported ${fmtD(parseIso(M.info.exported), true)}` : ''}`],
    ['Issued', `${fmtD(Date.now(), true)} ${fmtTime(Date.now())}`, 'Prepared by', who],
  ];
  for (const row of rows) {
    let x = X0;
    row.forEach((txt, i) => {
      const isL = i % 2 === 0, cwid = isL ? lw : vw;
      g.fillStyle = isL ? '#E4E4E4' : '#FFF7A7'; g.fillRect(x, by, cwid, rh);
      g.strokeStyle = '#c4c4c4'; g.lineWidth = 0.25 * m; g.strokeRect(x, by, cwid, rh);
      g.fillStyle = '#000'; g.textAlign = 'left'; g.font = F(2.5, isL ? 700 : 400);
      g.fillText(fitText(g, txt, cwid - 4 * m), x + 2 * m, by + 4.4 * m);
      x += cwid;
    });
    by += rh;
  }
  // footer
  g.fillStyle = '#000'; g.fillRect(X0, 199.5 * m, X1 - X0, 0.3 * m);
  g.font = F(2.3); g.fillStyle = '#444'; const fy = 203.5 * m;
  g.textAlign = 'left'; g.fillText('Addr. RGHA 7930, Saudi Arabia / UNN. 7014749027', X0, fy);
  g.textAlign = 'center'; g.fillText('www.ahb.sa', W / 2, fy);
  g.textAlign = 'right'; g.fillText(`Structure 4D ${VERSION} · Page 1 of 1`, X1, fy);
  return cv;
}
// A one-page A4 landscape PDF holding the sheet as a JPEG.
function sheetPdf(jpg, wPx, hPx, title) {
  const enc = new TextEncoder(); const parts = []; const offs = []; let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const PW = 841.89, PH = 595.28; const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
  push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  const t = String(title).replace(/[^\x20-\x7e]/g, '-').replace(/[()\\]/g, '');
  obj(6, () => push(`<< /Title (${t}) /Producer (Al-Furaih Structure 4D) >>`));
  const xref = len;
  push(`xref\n0 7\n0000000000 65535 f \n${[1, 2, 3, 4, 5, 6].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
const canvasBlob = (cv, type, q) => new Promise(res => cv.toBlob(res, type, q));
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
let SHEETCV = null;
const sheetName = ext => `Al-Furaih-4D_${viewTitle().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}_${isoDay(localToday())}.${ext}`;
async function openExport() {
  const dlg = $('#exportDlg'); const im = $('#exImg');
  dlg.querySelectorAll('[data-ex]').forEach(b => { b.disabled = true; });
  $('#exPrint').hidden = !topLevel;
  $('#exNote').textContent = L('Preparing the sheet…', 'جارٍ تجهيز الورقة…'); im.removeAttribute('src');
  if (!dlg.open) dlg.showModal();
  try {
    await new Promise(r => setTimeout(r, 30));
    SHEETCV = await buildSheet();
    const png = await canvasBlob(SHEETCV, 'image/png');
    if (im.src.startsWith('blob:')) URL.revokeObjectURL(im.src);
    im.src = URL.createObjectURL(png); im.dataset.png = '1'; SHEETCV._png = png;
    dlg.querySelectorAll('[data-ex]').forEach(b => { b.disabled = false; });
    $('#exNote').textContent = L(`${viewTitle()}. A4 landscape with the AHB title block.`, `${viewTitle()}. ورقة A4 أفقية بترويسة AHB (باللغة الإنجليزية).`) + (topLevel ? '' : L(' Inside this preview, downloads may be blocked: if nothing downloads, right-click or press and hold the picture to save it.', ' قد يُمنع التنزيل داخل هذه المعاينة: إذا لم يبدأ التنزيل، انقر بالزر الأيمن على الصورة أو اضغط عليها مطولاً لحفظها.'));
  } catch (err) { console.error(err); $('#exNote').textContent = L('The sheet could not be made in this browser: ', 'تعذّر إنشاء الورقة في هذا المتصفح: ') + (err.message || err); }
}
async function exportAs(kind) {
  if (!SHEETCV) return;
  if (kind === 'png') { download(SHEETCV._png, inEn(() => sheetName('png'))); toast(L('Picture saved to your downloads.', 'حُفظت الصورة في التنزيلات.')); return; }
  if (kind === 'pdf') {
    const jb = await canvasBlob(SHEETCV, 'image/jpeg', 0.9);
    const pdf = sheetPdf(new Uint8Array(await jb.arrayBuffer()), SHEETCV.width, SHEETCV.height, inEn(() => `Al-Furaih Villa 4D - ${viewTitle()}`));
    download(pdf, inEn(() => sheetName('pdf'))); toast(L('PDF saved to your downloads.', 'حُفظ ملف PDF في التنزيلات.')); return;
  }
  if (kind === 'print') {
    $('#print').innerHTML = `<img class="sheet" alt="" src="${$('#exImg').src}">`;
    const st = document.createElement('style'); st.textContent = '@page{size:A4 landscape;margin:0}'; document.head.appendChild(st);
    try { await $('#print img').decode(); } catch (e) { /* print anyway */ }
    window.print(); setTimeout(() => st.remove(), 1000);
  }
}
/* ---------- How to update: the weekly routine ---------- */
function openHow() { const d = $('#howDlg'); d.querySelectorAll('[data-print-how]').forEach(b => { b.hidden = !topLevel; }); if (!d.open) d.showModal(); }
function printHow() {
  const body = $('#howDlg .dlg:not([hidden])').cloneNode(true); body.querySelectorAll('button, .acts-row, .dh, p.hint').forEach(b => b.remove());
  $('#print').className = 'how'; $('#print').dir = AR() ? 'rtl' : 'ltr';
  $('#print').innerHTML = `<h1>${L('Al-Furaih Villa 4D · keeping it up to date', 'فيلا الفريح 4D · إبقاء النموذج محدّثاً')}</h1>${body.innerHTML}`;
  window.print(); setTimeout(() => { $('#print').className = ''; }, 1000);
}


/* ---------- Timeline ---------- */
function renderTimeline() {
  const r = $('#tlRange');
  const days = Math.round((DATA.end - DATA.start) / DAY);
  r.max = String(days); r.value = String(Math.round((S.t - DATA.start) / DAY));
  $('#tlDate').innerHTML = `${esc(fmtDW(S.t))}<small>${S.t <= DATA.dataDate ? L('Recorded progress', 'الإنجاز المسجّل') : L('Forecast from the dashboard', 'متوقع من لوحة المتابعة')} · ${L('day', 'اليوم')} ${Math.round((S.t - DATA.start) / DAY) + 1} ${L('of', 'من')} ${days + 1}</small>`;
  const tr = $('#track');
  tr.querySelectorAll('.mk').forEach(x => x.remove());
  const mk = (t, cls, label) => { if (t < DATA.start || t > DATA.end) return; const d = document.createElement('div'); d.className = 'mk ' + cls; d.style.left = `${(t - DATA.start) / (DATA.end - DATA.start) * 100}%`; d.innerHTML = `<b>${esc(label)}</b>`; tr.appendChild(d); };
  mk(DATA.dataDate, 'data', L('data date', 'تاريخ البيانات'));
  const today = localToday();
  if (Math.abs(today - DATA.dataDate) > 2 * DAY) mk(today, 'today', L('today', 'اليوم'));
}
let playTimer = null;
function setT(t) {
  S.t = Math.max(DATA.start, Math.min(DATA.end, t));
  paint(); renderModeBody(); renderTimeline();
}
function play(on) {
  S.playing = on; $('#play').textContent = on ? '❚❚' : '▶'; $('#play').setAttribute('aria-label', on ? L('Pause', 'إيقاف مؤقت') : L('Play', 'تشغيل'));
  clearInterval(playTimer);
  if (on) {
    if (S.t >= DATA.end) S.t = DATA.start;
    playTimer = setInterval(() => { if (S.t >= DATA.end) { play(false); return; } setT(S.t + DAY); }, 90);
  }
}

/* ---------- Focus helpers ---------- */
function rerenderLists() { renderModeBody(); renderSite(); renderChecks(); renderCard(); }
function focusItems(keys, label, extra = {}) {
  S.hl = null; S.focusCheck = null; S.legendFilter = null;
  S.focus = new Set(keys); S.focusLabel = label; S.focusAct = extra.act || null; S.focusItem = extra.item || null; S.focusSite = extra.site ?? null;
  paint(); rerenderLists();
  flyToElements(keys.flatMap(k => WORK[k].els));
}
function showCheck(c) {
  S.focus = null; S.focusAct = null; S.focusItem = null; S.focusSite = null; S.legendFilter = null;
  S.hl = { map: new Map([...c.x.map(k => [k, c.legend[0][0]]), ...c.y.map(k => [k, c.legend[1]?.[0] || '--next'])]), label: c.title, legend: c.legend };
  S.focusCheck = c.id;
  paint(); rerenderLists();
  flyToElements([...S.hl.map.keys()].flatMap(k => WORK[k].els));
}
function clearFocus() {
  S.focus = null; S.focusAct = null; S.focusItem = null; S.focusSite = null; S.focusCheck = null; S.hl = null; S.legendFilter = null;
  paint(); rerenderLists();
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.tm); toast.tm = setTimeout(() => el.classList.remove('on'), 3200); }
function focusAct(id) {
  const items = itemsOfAct(id).filter(w => w.els.length);
  if (S.focusAct === id) { clearFocus(); return; }
  if (!items.length) { toast(L('This activity has no elements in the structural model.', 'لا توجد لهذا النشاط عناصر في النموذج الإنشائي.')); return; }
  const a = DATA.acts.get(id);
  focusItems(items.map(w => w.key), a ? `${a.short} ${aName(a)}` : id, { act: id });
}

/* ---------- Week focus, drafts and small actions ---------- */
const narrow = () => matchMedia('(max-width:760px)').matches;
function showStage() { if (narrow()) $('#stage').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
function toggleWeek(on = !S.weekFocus, win) {
  if (win) S.win = win;
  S.weekFocus = on;
  if (on) { S.mode = 'status'; S.changeFocus = false; S.focus = null; S.focusAct = null; S.focusItem = null; S.focusSite = null; S.hl = null; S.focusCheck = null; S.legendFilter = null; S.sel = -1; play(false); }
  renderAll();
  if (on && S.pins?.length) { flyToElements(S.pins.flatMap(o => o.w.els)); showStage(); }
}
async function toggleChanges(on = !S.changeFocus) {
  if (on) {
    if (!PREV || PREV.forDate !== DATA.dataDate) { toast(L('Reading last week\'s dashboard…', 'جارٍ قراءة لوحة متابعة الأسبوع الماضي…')); await loadPrev(); }
    if (PREV.none) { toast(L('Last week\'s dashboard is not available on this link.', 'لوحة متابعة الأسبوع الماضي غير متاحة على هذا الرابط.')); S.changeFocus = false; renderAll(); return; }
    S.mode = 'status'; S.weekFocus = false; S.focus = null; S.focusAct = null; S.focusItem = null; S.focusSite = null; S.hl = null; S.focusCheck = null; S.legendFilter = null; S.sel = -1; play(false);
  }
  S.changeFocus = on;
  renderAll();
  if (on && S.pins?.length) { flyToElements(S.pins.flatMap(o => o.w.els)); showStage(); }
}
function toggleDelays(on = !S.delayFocus) {
  S.delayFocus = on;
  if (on) { S.mode = 'pva'; S.focus = null; S.focusAct = null; S.focusItem = null; S.focusSite = null; S.hl = null; S.focusCheck = null; S.legendFilter = null; S.sel = -1; play(false); }
  renderAll();
  if (on && S.pins?.length) { flyToElements(S.pins.flatMap(o => o.w.els)); showStage(); }
}
function delaysText() {
  const DL = delayItems();
  if (AR()) {
    const out = [`فيلا الفريح: أكبر التأخيرات في ${fmtD(DATA.dataDate, true)} (تاريخ بيانات لوحة المتابعة)`, 'تقارن أيام التأخير الانتهاء المتوقع بالخطة الأساسية.', ''];
    for (const o of DL) out.push(`${o.n}. ${itemLabel(o.w)}: ${daysText(o)}${o.a ? ` (${sLow(o.a.stage)} ${o.a.short}، الانتهاء المتوقع ${fmtD(o.a.finish)}${+o.a.float < 0 ? `، الفائض ${fmtFloat(o.a.float)}` : ''})` : ''}؛ المخطط ${pct(o.plan)}، المنجز ${pct(o.act)}`);
    if (!DL.length) out.push('كل شيء حسب الخطة.');
    out.push('', `رابط النموذج: ${shareUrl()}`);
    return out.join('\n');
  }
  const out = [`Al-Furaih Villa: top delays at ${fmtD(DATA.dataDate, true)} (dashboard data date)`, 'Days late compare the forecast finish with the baseline.', ''];
  for (const o of DL) out.push(`${o.n}. ${itemLabel(o.w)}: ${daysText(o)}${o.a ? ` (${o.a.short} ${STAGES[o.a.stage].label.toLowerCase()}, forecast to finish ${fmtD(o.a.finish)}${+o.a.float < 0 ? `, float ${fmtFloat(o.a.float)}` : ''})` : ''}; plan ${pct(o.plan)}, done ${pct(o.act)}`);
  if (!DL.length) out.push('Everything is on plan.');
  out.push('', `4D view: ${shareUrl()}`);
  return out.join('\n');
}
function saveDrafts() { try { localStorage.setItem('fur4d.drafts', JSON.stringify(DRAFTS.map(({ t, by, note, progress }) => ({ t, by, note, progress })))); } catch (e) { /* storage blocked */ } }
function loadDrafts() {
  try { const j = JSON.parse(localStorage.getItem('fur4d.drafts') || '[]'); return groupSite(j.flatMap(u => Object.entries(u.progress).map(([id, v]) => ({ t: u.t, id, v, by: u.by, note: u.note, draft: true })))); }
  catch (e) { return []; }
}
function addDraft() {
  const id = $('#sfAct').value, v = parsePct($('#sfPct').value), t = parseIso($('#sfDate').value), by = $('#sfBy').value.trim(), note = $('#sfNote').value.trim();
  if (!id || v == null || t == null) { toast(L('Pick an activity, a % from 0 to 100 and a date.', 'اختر نشاطاً ونسبة من 0 إلى 100 وتاريخاً.')); return; }
  try { localStorage.setItem('fur4d.by', by); } catch (e) { /* storage blocked */ }
  const rows = DRAFTS.flatMap(u => Object.entries(u.progress).map(([k, val]) => ({ t: u.t, id: k, v: val, by: u.by, note: u.note, draft: true })));
  DRAFTS = groupSite([...rows.filter(r => !(r.id === id && r.t === t)), { t, id, v, by, note, draft: true }]);
  saveDrafts(); applySite(); CHECKS = computeChecks(); renderAll(); fillSiteForm(id);
  toast(t <= DATA.dataDate ? L(`Draft kept, but its date is not after the dashboard's data date (${fmtD(DATA.dataDate)}), so the colours do not change.`, `حُفظت المسودة، لكن تاريخها ليس بعد تاريخ بيانات لوحة المتابعة (${fmtD(DATA.dataDate)})، لذا لن تتغير الألوان.`)
    : L('Draft added: the model shows it now. Share it by adding the line to the file.', 'أُضيفت المسودة وتظهر الآن في النموذج. شاركها بإضافة السطر إلى الملف.'));
}
function clearDrafts() { DRAFTS = []; saveDrafts(); applySite(); CHECKS = computeChecks(); renderAll(); }
function downloadSiteFile() {
  const head = 'date,activity,percent,by,note';
  let base = SITEINFO.file === 'site-updates.csv' && SITEINFO.text.trim() ? SITEINFO.text.replace(/\s+$/, '') : head;
  if (SITEINFO.file && SITEINFO.file !== 'site-updates.csv') base = [head, ...SITE.flatMap(u => Object.entries(u.progress).map(([k, v]) => [u.date, k.replace('FUR.M.C.', ''), v, u.by, u.note].map(csvCell).join(',')))].join('\n');
  const blob = new Blob([base + '\n' + draftLines().join('\n') + '\n'], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'site-updates.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(L('If nothing downloads here, use Copy lines instead.', 'إذا لم يبدأ التنزيل هنا، استخدم نسخ الأسطر.'));
}
function openSiteForm(key) {
  const acts = linked(WORK[key]).sort((a, b) => STAGES[a.stage].order - STAGES[b.stage].order);
  const pick = acts.find(a => a.act < 100) || acts[acts.length - 1];
  fillSiteForm(pick?.id); $('#sfPct').value = '100';
  const d = $('#siteAdd'); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#sfAct').focus({ preventScroll: true });
}

/* ---------- Link to this view: the view is kept in the address after # ---------- */
function viewHash() {
  const p = new URLSearchParams();
  if (S.mode !== 'status') p.set('view', S.mode);
  if (S.floor !== 'ALL') p.set('floor', S.floor);
  if (S.only) p.set('only', '1');
  if (S.win !== 'next') p.set('week', S.win);
  if (weekOn()) p.set('focus', 'week');
  if (delayOn()) p.set('focus', 'delays');
  if (changeOn()) p.set('focus', 'done');
  if (S.mode === 'time' && S.t != null) p.set('date', isoDay(S.t));
  if (S.sel >= 0) p.set('el', String(M.els[S.sel].id));
  if (AR()) p.set('lang', 'ar');
  if (three) { const c = three.camera.position, t = three.controls.target; p.set('cam', [c.x, c.y, c.z, t.x, t.y, t.z].map(x => x.toFixed(1)).join(',')); }
  return p.toString();
}
const shareUrl = () => (topLevel && /^https?:/.test(location.href) ? location.href.split('#')[0] : LIVE_HOME) + '#' + viewHash();
let hashTm = null;
function saveHash() {
  clearTimeout(hashTm);
  hashTm = setTimeout(() => { try { history.replaceState(null, '', '#' + viewHash()); } catch (e) { /* not allowed here */ } }, 300);
}
function readHash() { // returns the camera to restore, if any
  let p; try { p = new URLSearchParams(location.hash.replace(/^#/, '')); } catch (e) { return null; }
  if (['status', 'pva', 'time'].includes(p.get('view'))) S.mode = p.get('view');
  if (PKG[p.get('floor')]) S.floor = p.get('floor');
  S.only = p.get('only') === '1'; $('#tOnly').checked = S.only;
  if (['this', 'next', 'three'].includes(p.get('week'))) S.win = p.get('week');
  S.weekFocus = p.get('focus') === 'week'; S.delayFocus = p.get('focus') === 'delays'; S.changeFocus = p.get('focus') === 'done';
  const d = parseIso(p.get('date')); if (d != null) S.t = Math.max(DATA.start, Math.min(DATA.end, d));
  const el = +p.get('el'); if (el) { const e = M.els.find(x => x.id === el); if (e) S.sel = e.n; }
  const cam = (p.get('cam') || '').split(',').map(Number);
  return cam.length === 6 && cam.every(isFinite) ? cam : null;
}

/* ---------- Events ---------- */
const T_COPIED = () => L('List copied. Paste it into WhatsApp, Teams or an email.', 'نُسخت القائمة. الصقها في واتساب أو Teams أو بريد إلكتروني.');
const T_NOCOPY = () => L('Copy did not work in this browser.', 'لم ينجح النسخ في هذا المتصفح.');
function bind() {
  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]'); if (!b) return;
    S.mode = b.dataset.mode; S.legendFilter = null; S.hl = null; S.focusCheck = null; play(false);
    if (S.mode === 'time' && S.t == null) S.t = DATA.asOf;
    renderAll();
  });
  $('#legend').addEventListener('click', e => {
    const li = e.target.closest('li[data-k]'); if (!li) return;
    S.legendFilter = S.legendFilter === li.dataset.k ? null : li.dataset.k; S.focus = null; S.focusAct = null; S.focusItem = null; paint(); renderModeBody();
  });
  $('#legend').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[data-k]')) { e.preventDefault(); e.target.click(); } });
  $('#warn').addEventListener('click', () => { const d = $('#checksBox'); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); d.querySelector('#checksSec button')?.focus({ preventScroll: true }); });
  $('#panel').addEventListener('click', async e => {
    const t = e.target;
    const open = t.closest('[data-open]');
    if (open) { e.preventDefault(); const d = document.getElementById(open.dataset.open); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (t.closest('[data-clear]')) { clearFocus(); return; }
    const win = t.closest('button[data-win]');
    if (win) { S.win = win.dataset.win; renderModeBody(); paint(); saveHash(); return; }
    if (t.closest('button[data-copy]')) { const ok = await copyText(listText()); toast(ok ? T_COPIED() : T_NOCOPY()); return; }
    if (t.closest('button[data-week]')) { toggleWeek(); return; }
    if (t.closest('button[data-delays]')) { toggleDelays(); return; }
    if (t.closest('button[data-changes]')) { toggleChanges(); return; }
    if (t.closest('button[data-copy-delays]')) { const ok = await copyText(delaysText()); toast(ok ? T_COPIED() : T_NOCOPY()); return; }
    if (t.closest('[data-retry]')) { e.preventDefault(); toast(L('Trying the dashboard again…', 'جارٍ إعادة محاولة قراءة لوحة المتابعة…')); refresh(true); return; }
    if (t.closest('[data-howto]')) { e.preventDefault(); openHow(); return; }
    if (t.closest('[data-tour]')) { e.preventDefault(); openGuide(0); return; }
    if (t.closest('#bLang')) { setLang(AR() ? 'en' : 'ar'); return; }
    const os = t.closest('[data-open-sec]');
    if (os) { e.preventDefault(); const sec = document.getElementById(os.dataset.openSec); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const pf = t.closest('button[data-pfloor]');
    if (pf) { const k = pf.dataset.pfloor; S.floor = S.floor === k ? 'ALL' : k; renderFloors(); renderFloorProgress(); paint(); saveHash(); showStage(); return; }
    const zc = t.closest('button[data-zoomcheck]');
    if (zc) { const c = CHECKS.find(x => x.id === zc.dataset.zoomcheck); if (c) { showCheck(c); showStage(); } return; }
    if (t.closest('button[data-draft-copy]')) { const ok = await copyText(draftLines().join('\n')); toast(ok ? L('Copied. Paste at the end of site-updates.csv on GitHub.', 'تم النسخ. الصقه في نهاية site-updates.csv على GitHub.') : T_NOCOPY()); return; }
    if (t.closest('button[data-draft-dl]')) { downloadSiteFile(); return; }
    if (t.closest('button[data-draft-clear]')) { clearDrafts(); return; }
    const act = t.closest('button[data-act]');
    if (act) { focusAct(act.dataset.act); showStage(); return; }
    const item = t.closest('button[data-item]');
    if (item) { const k = item.dataset.item; if (S.focusItem === k) { clearFocus(); return; } focusItems([k], itemLabel(WORK[k]), { item: k }); showStage(); return; }
    const site = t.closest('button[data-site]');
    if (site) {
      const i = +site.dataset.site; if (S.focusSite === i) { clearFocus(); return; }
      const u = DATA.siteActive[i]; const ids = Object.keys(u.progress).map(k => k.startsWith('FUR.') ? k : 'FUR.M.C.' + k);
      const keys = uniq(ids.flatMap(id => itemsOfAct(id)).filter(w => w.els.length).map(w => w.key));
      if (!keys.length) { toast(L('This update has no elements in the structural model.', 'لا توجد لهذا التحديث عناصر في النموذج الإنشائي.')); return; }
      focusItems(keys, `${L('Site update', 'تحديث الموقع')} ${fmtD(u.t)}`, { site: i }); showStage(); return;
    }
    const chk = t.closest('button[data-check]');
    if (chk) {
      const c = CHECKS.find(x => x.id === chk.dataset.check); if (!c) return;
      if (S.focusCheck === c.id) { clearFocus(); return; }
      if (c.x.length + c.y.length === 0) { toast(L('This check has no elements in the model.', 'لا توجد لهذا التدقيق عناصر في النموذج.')); return; }
      showCheck(c); showStage(); return;
    }
  });
  $('#siteForm').addEventListener('submit', e => { e.preventDefault(); addDraft(); });
  $('#siteAdd').addEventListener('toggle', () => { if ($('#siteAdd').open) fillSiteForm(); });
  $('#callouts').addEventListener('click', e => {
    const b = e.target.closest('[data-pin]'); if (!b) return;
    const k = b.dataset.pin; focusItems([k], itemLabel(WORK[k]), { item: k });
  });
  $('#bWeek').addEventListener('click', () => toggleWeek(!(S.weekFocus && S.win === 'next'), 'next'));
  $('#bDone').addEventListener('click', () => toggleChanges());
  const copyLink = async () => {
    const ok = await copyText(shareUrl());
    toast(!ok ? T_NOCOPY() : topLevel && /^https?:/.test(location.href) ? L('Link to this view copied.', 'نُسخ رابط هذا العرض.') : L('Link copied. It opens this view once the 4D is on GitHub.', 'نُسخ الرابط. سيفتح هذا العرض بعد رفع النموذج على GitHub.'));
  };
  three.controls.addEventListener('end', saveHash);
  $('#panel').addEventListener('change', e => {
  });
  $('#floors').addEventListener('click', e => {
    const fl = e.target.closest('button[data-floor]'); if (!fl) return;
    S.floor = fl.dataset.floor; renderFloors(); renderFloorProgress(); paint(); saveHash();
  });
  $('#tOnly').addEventListener('change', e => { S.only = e.target.checked; renderFloors(); paint(); saveHash(); });
  $('#tPlan').addEventListener('change', e => { fitView(e.target.checked ? 'top' : '3d'); });
  $('#card').addEventListener('click', e => {
    if (e.target.closest('[data-close]')) { select(-1); return; }
    const iso = e.target.closest('[data-isolate]'); if (iso) { const k = iso.dataset.isolate; focusItems([k], itemLabel(WORK[k]), { item: k }); return; }
    const up = e.target.closest('[data-update]'); if (up) { openSiteForm(up.dataset.update); return; }
    if (e.target.closest('[data-clear]')) { clearFocus(); }
  });
  $('#bFit').addEventListener('click', () => { clearFocus(); select(-1); $('#tPlan').checked = false; fitView('3d'); });
  $('#bExport').addEventListener('click', openExport);
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => {
    if (e.target === d || e.target.closest('[data-close-dlg]')) { d.close(); return; } // a click on the dark backdrop closes it too
    const ex = e.target.closest('[data-ex]'); if (ex && !ex.disabled) exportAs(ex.dataset.ex);
    if (e.target.closest('[data-print-how]')) printHow();
    if (e.target.closest('[data-link]')) copyLink();
    if (e.target.closest('[data-tour]')) { e.preventDefault(); d.close(); openGuide(0); }
  });
  const q = $('#q');
  q.addEventListener('input', () => {
    const s = q.value.trim().toLowerCase();
    if (s.length < 2) { $('#qres').innerHTML = ''; return; }
    const hits = [...DATA.acts.values()].filter(a => a.id.toLowerCase().includes(s) || a.name.toLowerCase().includes(s) || (actNameAr(a.name) || '').includes(q.value.trim())).slice(0, 8);
    $('#qres').innerHTML = hits.length ? hits.map(a => actRow(a)).join('') : `<li class="empty">${L('No activity matches.', 'لا يوجد نشاط مطابق.')}</li>`;
  });
  $('#play').addEventListener('click', () => play(!S.playing));
  $('#tlRange').addEventListener('input', e => { play(false); setT(DATA.start + (+e.target.value) * DAY); });
  document.querySelector('.tl .sp').addEventListener('click', e => {
    const b = e.target.closest('button[data-jump]'); if (!b) return; play(false);
    const j = b.dataset.jump;
    setT({ start: DATA.start, end: DATA.end, data: DATA.dataDate, today: localToday(), next: S.t + 7 * DAY }[j]);
  });
  $('#guide').addEventListener('click', e => {
    if (e.target.closest('#gClose')) { closeGuide(); return; }
    if (e.target.closest('#gLang')) { setLang(AR() ? 'en' : 'ar'); return; }
    if (e.target.closest('#gNext')) { if (guideStep >= GUIDE.length - 1) closeGuide(); else { guideStep++; showGuideStep(); } return; }
    if (e.target.closest('#gBack')) { if (guideStep === 0) closeGuide(); else { guideStep--; showGuideStep(); } }
  });
  window.addEventListener('keydown', e => {
    if (guideStep >= 0 && e.key === 'Escape') { closeGuide(); return; }
    if (document.querySelector('dialog[open]')) return; // Escape closes the open card by itself
    if (e.key === 'Escape') { if (S.sel >= 0) select(-1); else if (S.focus || S.hl || S.legendFilter) clearFocus(); }
    if (S.mode === 'time' && !e.target.closest('input,textarea')) {
      if (e.key === 'ArrowRight') { play(false); setT(S.t + DAY); }
      if (e.key === 'ArrowLeft') { play(false); setT(S.t - DAY); }
    }
  });
}

/* ---------- Language switch ---------- */
let arFont = false;
function loadArFont() { // the Arabic typeface is only fetched when Arabic is chosen
  if (arFont) return; arFont = true;
  const l = document.createElement('link'); l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';
  document.head.appendChild(l);
}
// Static text in the page carries its Arabic in data-ar (and data-ar-title, -placeholder, -aria-label, -alt).
function applyLang() {
  const ar = AR(), root = document.documentElement;
  root.lang = ar ? 'ar' : 'en'; root.dir = ar ? 'rtl' : 'ltr';
  document.title = L('Al-Furaih Villa 4D', 'فيلا الفريح 4D');
  for (const el of document.querySelectorAll('[data-ar]')) {
    if (el.dataset.en == null) el.dataset.en = el.innerHTML;
    el.innerHTML = ar ? el.dataset.ar : el.dataset.en;
  }
  for (const at of ['title', 'placeholder', 'aria-label', 'alt']) for (const el of document.querySelectorAll(`[data-ar-${at}]`)) {
    if (!el.hasAttribute('data-en-' + at)) el.setAttribute('data-en-' + at, el.getAttribute(at) || '');
    el.setAttribute(at, el.getAttribute(ar ? 'data-ar-' + at : 'data-en-' + at));
  }
  for (const el of document.querySelectorAll('[data-lang]')) el.hidden = el.dataset.lang !== LANG;
  const b = $('#bLang'); b.textContent = ar ? 'English' : 'العربية'; b.lang = ar ? 'en' : 'ar'; b.title = ar ? 'Show the 4D in English' : 'اعرض النموذج بالعربية';
  if (ar) loadArFont();
}
// Messages read from the site and documents files were written in the old language: read them again.
function reparseFiles() {
  if (SITEINFO.file && SITEINFO.text) {
    try { const r = SITEINFO.file.endsWith('.csv') ? siteFromCsv(SITEINFO.text) : siteFromJson(SITEINFO.text); SITEINFO = { ...SITEINFO, problems: r.problems }; }
    catch (e) { SITEINFO = { ...SITEINFO, problems: [L(`The file could not be read: ${e.message}.`, `تعذّرت قراءة الملف: ${e.message}.`)] }; }
  }
  if (DOCS.file && DOCS.text) {
    try { DOCS = { ...DOCS, ...docsFromCsv(DOCS.text) }; }
    catch (e) { DOCS = { ...DOCS, docs: [], problems: [L(`The file could not be read: ${e.message}.`, `تعذّرت قراءة الملف: ${e.message}.`)] }; }
  }
}
function setLang(l) {
  if (l === LANG) return;
  LANG = l; try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* storage blocked */ }
  applyLang();
  if (!DATA || !M || !three) return;
  reparseFiles(); applySite(); CHECKS = computeChecks();
  if (S.focusCheck) { const c = CHECKS.find(x => x.id === S.focusCheck); if (c && S.hl) S.hl = { ...S.hl, label: c.title, legend: c.legend }; }
  if (S.focusAct) { const a = DATA.acts.get(S.focusAct); if (a) S.focusLabel = `${a.short} ${aName(a)}`; }
  else if (S.focusItem) S.focusLabel = itemLabel(WORK[S.focusItem]);
  else if (S.focusSite != null) { const u = DATA.siteActive[S.focusSite]; if (u) S.focusLabel = `${L('Site update', 'تحديث الموقع')} ${fmtD(u.t)}`; }
  $('#play').setAttribute('aria-label', S.playing ? L('Pause', 'إيقاف مؤقت') : L('Play', 'تشغيل'));
  renderAll(); renderMapping(); renderFoot();
  if ($('#siteAdd').open) fillSiteForm();
  if ($('#q').value.trim().length >= 2) $('#q').dispatchEvent(new Event('input'));
  if (guideStep >= 0) showGuideStep();
  placeTags(); three.need = true;
}

/* ---------- First-time guide: three short steps, shown once on each device ---------- */
const GUIDE_KEY = 'fur4d.guide';
let guideStep = -1, guideBack = null, guideSeenHere = false;
const GUIDE = [
  { target: () => $('#stage'), title: () => L('Turn and zoom the building', 'دوّر المبنى وكبّره'),
    body: () => L('Drag to turn it. Scroll or pinch to zoom, and drag with the right button or two fingers to move it. The floor buttons on the model show the building up to one floor.',
      'اسحب لتدويره. استخدم عجلة الفأرة أو إصبعين للتكبير، واسحب بالزر الأيمن أو بإصبعين لتحريكه. أزرار الأدوار على النموذج تعرض المبنى حتى دور معيّن.') },
  { target: () => $('.tabs'), extra: () => $('#lens'), title: () => L('Pick a view', 'اختر طريقة العرض'),
    body: () => L('Site status shows what is built today. Plan vs actual shows what is late. 4D timeline plays the programme day by day. On the model, Last week and Next week number one week of work.',
      '«حالة الموقع» تعرض ما نُفّذ حتى اليوم، و«المخطط والفعلي» يعرض المتأخر، و«الخط الزمني 4D» يشغّل البرنامج يوماً بيوم. وعلى النموذج، زرّا «الأسبوع الماضي» و«الأسبوع القادم» يرقّمان أعمال أسبوع واحد.') },
  { target: () => $('#stage'), title: () => L('Tap any element', 'اضغط على أي عنصر'),
    body: () => L('Tap a column, beam or slab to see its activities, dates and progress, with WIR, MIR and photo links. Reset brings the whole building back.',
      'اضغط على عمود أو كمرة أو بلاطة لترى أنشطتها وتواريخها ونسبة إنجازها، مع روابط طلبات الفحص WIR وMIR والصور. زر «إعادة الضبط» يعيد المبنى كاملاً.') },
];
function guideSeen() { try { return !!localStorage.getItem(GUIDE_KEY); } catch (e) { return guideSeenHere; } }
function openGuide(i = 0) {
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  if (guideStep < 0) guideBack = document.activeElement;
  guideStep = i; $('#guide').hidden = false;
  showGuideStep();
  window.addEventListener('resize', placeGuide); window.addEventListener('scroll', placeGuide, true);
}
function closeGuide() {
  if (guideStep < 0) return;
  guideStep = -1; $('#guide').hidden = true; guideSeenHere = true;
  try { localStorage.setItem(GUIDE_KEY, 'done'); } catch (e) { /* storage blocked */ }
  window.removeEventListener('resize', placeGuide); window.removeEventListener('scroll', placeGuide, true);
  if (guideBack && guideBack.focus && document.contains(guideBack) && guideBack !== document.body) guideBack.focus({ preventScroll: true });
}
function showGuideStep() {
  const g = GUIDE[guideStep], last = guideStep === GUIDE.length - 1;
  $('#gStep').textContent = L(`Quick tour · ${guideStep + 1} of ${GUIDE.length}`, `جولة سريعة · ${guideStep + 1} من ${GUIDE.length}`);
  $('#gT').textContent = g.title(); $('#gBody').textContent = g.body();
  $('#gBack').textContent = guideStep ? L('Back', 'السابق') : L('Skip', 'تخطٍّ');
  $('#gNext').textContent = last ? L('Done', 'تم') : L('Next', 'التالي');
  const gl = $('#gLang'); gl.textContent = AR() ? 'English' : 'العربية'; gl.lang = AR() ? 'en' : 'ar';
  $('#gClose').setAttribute('aria-label', L('Close the tour', 'إغلاق الجولة'));
  const t = g.target();
  if (narrow() && t) { const r = t.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) t.scrollIntoView({ block: r.height > innerHeight * 0.6 ? 'start' : 'center' }); }
  placeGuide(); requestAnimationFrame(placeGuide);
  $('#gNext').focus({ preventScroll: true });
}
function placeGuide() {
  if (guideStep < 0) return;
  const g = GUIDE[guideStep], t = g.target(); if (!t) return;
  const vw = document.documentElement.clientWidth, vh = innerHeight, r = t.getBoundingClientRect(), pad = 5;
  const ring = $('#gRing'), card = $('#gCard');
  const x0 = Math.max(3, r.left - pad), y0 = Math.max(3, r.top - pad), x1 = Math.min(vw - 3, r.right + pad), y1 = Math.min(vh - 3, r.bottom + pad);
  ring.hidden = y1 - y0 < 8;
  Object.assign(ring.style, { left: x0 + 'px', top: y0 + 'px', width: Math.max(0, x1 - x0) + 'px', height: Math.max(0, y1 - y0) + 'px' });
  const ex = g.extra ? g.extra() : null, r2 = $('#gRing2');
  const q = ex && !ex.hidden ? ex.getBoundingClientRect() : null;
  r2.hidden = !q || !q.width || q.bottom < 0 || q.top > vh;
  if (!r2.hidden) Object.assign(r2.style, { left: q.left - 4 + 'px', top: q.top - 4 + 'px', width: q.width + 8 + 'px', height: q.height + 8 + 'px' });
  const cw = card.offsetWidth, ch = card.offsetHeight; let x, y;
  if (r.width > vw * 0.45 && r.height > vh * 0.35) { // the model: the card sits inside it, at the bottom
    x = r.left + (r.width - cw) / 2; y = Math.min(r.bottom, vh) - ch - 18;
  } else {
    const side = AR() ? r.left - cw - 18 : r.right + 18;
    if (!narrow() && (AR() ? side >= 8 : side + cw <= vw - 8)) { x = side; y = r.top - 10; }
    else { x = r.left + (r.width - cw) / 2; y = r.bottom + 14; if (y + ch > vh - 8) y = r.top - ch - 14; }
  }
  card.style.left = Math.max(8, Math.min(vw - cw - 8, x)) + 'px'; card.style.top = Math.max(8, Math.min(vh - ch - 8, y)) + 'px';
}

/* ---------- Live refresh ---------- */
async function refresh(asked = false) {
  const [r, site, docs] = await Promise.all([loadLive(), loadSiteFile(), loadDocsFile()]);
  const siteChanged = site.text !== SITEINFO.text || docs.text !== DOCS.text;
  DOCS = docs;
  let next = null;
  if (r.D) { saveLastGood(r.D, r.source); next = prepData(r.D, true, r.source); }
  const recovered = !!next && !!DATA.fail;
  const dashChanged = !!next && (next.hash !== DATA.hash || recovered || !DATA.live);
  if (!next && (DATA.live || DATA.fail || liveExpected())) {
    // could not read the dashboard this time: keep what is on screen and say so
    DATA.fail = { ...r, at: DATA.fail?.at || Date.now(), last: Date.now() };
  }
  if (dashChanged || siteChanged) {
    if (dashChanged) { const newWeek = next.dataDate !== DATA.dataDate; DATA = next; if (newWeek) { PREV = null; loadPrev().then(() => { if (S.mode === 'status') { renderModeBody(); paint(); } }); } }
    SITE = site.updates; SITEINFO = site; applySite(); CHECKS = computeChecks();
    S.t = Math.max(DATA.start, Math.min(DATA.end, S.t ?? DATA.asOf));
    renderAll(); renderFoot();
    if ($('#siteAdd').open) fillSiteForm();
    toast(recovered ? L(`Dashboard reached again · data date ${fmtD(DATA.dataDate, true)}`, `عادت لوحة المتابعة · تاريخ البيانات ${fmtD(DATA.dataDate, true)}`) : dashChanged ? L(`Dashboard updated · data date ${fmtD(DATA.dataDate, true)}`, `حُدّثت لوحة المتابعة · تاريخ البيانات ${fmtD(DATA.dataDate, true)}`) : L('Site updates changed', 'تغيّرت تحديثات الموقع'));
  } else {
    if (next) DATA.checked = next.checked;
    renderSource(); renderHealth();
    if (asked) toast(next ? L('Dashboard read: no change.', 'قُرئت لوحة المتابعة: لا تغيير.') : L('The dashboard still cannot be read. Showing the last good data.', 'ما زالت قراءة لوحة المتابعة متعذّرة. تُعرض آخر بيانات سليمة.'));
  }
}

/* ---------- Start ---------- */
async function main() {
  const msg = $('#msg'), bar = $('#msgBar'), lab = $('#msgLab');
  const T = { t0: performance.now() }; window.__4d.t0 = T.t0;
  const step = (f, text) => { bar.style.width = Math.round(f * 100) + '%'; if (text) lab.textContent = text; };
  try {
    const [model, data, site, docs] = await Promise.all([
      loadModel(f => step(f * 0.85, `${L('Loading the structure…', 'جارٍ تحميل الهيكل…')} ${Math.round(f * 100)}%`)).then(m => { T.model = performance.now(); return m; }),
      loadData().then(d => { T.data = performance.now(); return d; }),
      loadSiteFile(),
      loadDocsFile(),
    ]);
    M = model; DATA = data; SITE = site.updates; SITEINFO = site; DOCS = docs; DRAFTS = loadDrafts();
    step(0.9, L('Building the 3D view…', 'جارٍ تجهيز العرض ثلاثي الأبعاد…'));
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    applySite(); CHECKS = computeChecks(); S.t = DATA.asOf;
    initThree(); T.three = performance.now();
    const cam = readHash();
    if (S.changeFocus) await loadPrev();
    bind(); renderMapping(); renderFoot(); renderAll();
    if (cam) moveCamera(new THREE.Vector3(cam[0], cam[1], cam[2]), new THREE.Vector3(cam[3], cam[4], cam[5]), false);
    else if (pinsOn() && S.pins?.length) flyToElements(S.pins.flatMap(o => o.w.els));
    msg.hidden = true; T.ready = performance.now();
    window.__4d.timing = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v - T.t0)]));
    if (DATA.live || DATA.fail || liveExpected()) setInterval(refresh, REFRESH_MINUTES * 60000);
    if (!PREV) setTimeout(() => loadPrev().then(() => { if (S.mode === 'status') renderModeBody(); }), 1200); // for "Done since last week"
    if (!guideSeen()) setTimeout(() => { if (guideStep < 0 && !document.querySelector('dialog[open]')) openGuide(0); }, 700);
  } catch (err) {
    console.error(err);
    msg.hidden = false;
    msg.innerHTML = `<p><b>${L('The 4D view could not open', 'تعذّر فتح النموذج')}</b>${esc(err.message || String(err))}</p>`;
  }
}
window.__4d = { S, get three() { return three; }, get DATA() { return DATA; }, get PREV() { return PREV; }, get M() { return M; }, select, refresh, setLang, openGuide };
applyLang();
main();
