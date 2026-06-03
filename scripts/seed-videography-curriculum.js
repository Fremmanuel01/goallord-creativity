// Seed the 12-week High-End Practical Film Bootcamp curriculum into a Videography
// batch's curriculum_entries (one entry per week). Idempotent (upsert on
// batch_id, week, day). Usage:
//   node scripts/seed-videography-curriculum.js [batchId]
// With no batchId it targets the active Videography batch.
require('dotenv').config();
const supabase = require('../lib/supabase');

const DAY = 'Wednesday'; // one entry per week; day kept within the schema constraint

const WEEKS = [
  {
    week: 1,
    topic: 'Orientation, Camera Safety & Visual Thinking',
    subtopics: [
      'Cinematography is making the viewer feel something, not just pressing record',
      'Sony A7 IV: body controls, lens mounting, battery, memory cards, safe handheld posture',
      'Blackmagic 6K: controls, media setup, tripod mounting, menu basics, safe packing',
      'Gear discipline: tripods, carrying during events, lens cleaning, dust/sensor safety',
      'Practical: 10 stable shots - wide, medium, close-up, low-angle, high-angle',
      'Editing lab: new project, import, timeline, basic cuts, export',
    ],
    objectives: 'Goal: handle the Sony A7 IV and Blackmagic 6K safely and confidently and complete a full shoot-to-export cycle. Deliverable: 30-second "My Environment" video using a wide, medium, close-up, low-angle and high-angle shot.',
    resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K', 'Tripod', 'Editing software'],
  },
  {
    week: 2,
    topic: 'Manual Camera Settings, Exposure & Focus',
    subtopics: [
      'Aperture, ISO, shutter speed, shutter angle, frame rate, white balance, focus',
      'Sony A7 IV: manual exposure, autofocus & tracking, white balance, 4K',
      'Blackmagic 6K: resolution, shutter angle, ISO, false colour, focus peaking, BRAW',
      'Correct vs over/under exposure; correct vs wrong white balance',
      'Manual focus vs autofocus; slow-motion test footage',
      'Editing lab: organise clips by setting, comparison timeline, text labels',
    ],
    objectives: 'Goal: stop relying on automatic settings and shoot manually with control. Deliverable: 1-minute camera-settings exercise visually explaining aperture, ISO, shutter speed, white balance and focus.',
    resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K'],
  },
  {
    week: 3,
    topic: 'Composition, Shot Types & Visual Storytelling',
    subtopics: [
      'Rule of thirds, headroom, lead room, depth, leading lines, clean background',
      'Shot types: extreme wide, wide, medium, close-up, extreme close-up, OTS, insert, cutaway, establishing, reaction',
      'Every shot answers a story question (where, who, what, feel, detail)',
      'Build a shot list before shooting; layer foreground/middle/background',
      'Editing lab: continuity, order wide/medium/close-up, cutaways, avoid jump cuts',
    ],
    objectives: 'Goal: frame professional shots that communicate meaning. Deliverable: 1-minute silent story (no dialogue) using at least 10 shot types.',
    resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K', 'Tripod'],
  },
  {
    week: 4,
    topic: 'Camera Movement, Stabilization & Cinematic Motion',
    subtopics: [
      'Movement must have meaning: reveal, follow action, suspense, beauty, emotion, energy',
      'Static, tripod pan/tilt, handheld, gimbal-style, slow motion',
      'Push-in, pull-out, tracking, orbit, reveal; wedding-style and advert-style moves',
      'Drill: 3 each of tripod, handheld, reveal, slow-motion and tracking shots',
      'Editing lab: cut to music, match beats, speed ramps; transitions only when they help',
    ],
    objectives: 'Goal: move the camera smoothly and intentionally. Deliverable: 45-second cinematic movement montage cut to music.',
    resources: ['Tripod', 'Gimbal', 'Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K'],
  },
  {
    week: 5,
    topic: 'Lighting for Film, Interviews, Events & Weddings',
    subtopics: [
      'Natural vs artificial, hard vs soft, side, back, practical and window light',
      'Three-point lighting: key, key+fill, key+backlight',
      'Low-key (dramatic) vs high-key; silhouette',
      'Setups: interview, dramatic scene, wedding preparation, product advert, window portrait',
      'Editing lab: fix exposure/contrast/white balance, match shots, basic colour correction',
    ],
    objectives: 'Goal: shape light for different production situations. Deliverable: 1-minute lighting exercise showing three moods - soft/beautiful, dramatic, and corporate/interview.',
    resources: ['LED lighting', 'Reflector', 'Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K'],
  },
  {
    week: 6,
    topic: 'Sound Recording, Interviews & Documentary Production',
    subtopics: [
      'Mic placement, audio levels, clipping, room tone, echo, syncing, voice-over, music balance',
      'Interview planning: framing, lighting, sound, good questions, B-roll',
      'Bad vs good audio; mic too far vs close to subject',
      'Drill: record a lav/wireless interview, 10+ B-roll shots, room tone',
      'Editing lab: cut answers into a story, B-roll over audio, lower thirds, balance voice/music',
    ],
    objectives: 'Goal: capture clean sound and tell stories through interviews. Deliverable: 2-minute mini documentary (e.g. a day in the life, the story of a craftsman, the making of an event).',
    resources: ['Lavalier/wireless microphone', 'Headphones', 'Sony A7 IV'],
  },
  {
    week: 7,
    topic: 'Photography Basics for Cinematographers',
    subtopics: [
      'Photography trains the eye: composition, exposure, timing, light direction, detail',
      'Portrait composition good vs bad; harsh vs soft light portraits',
      'Event-moment capture, product detail, environmental frames',
      'Drill: 5 each of portraits, candids, product/detail, environmental and event photos',
      'Editing lab: crop/straighten, exposure/contrast, colour temperature, sequence, export web/print',
    ],
    objectives: 'Goal: strengthen visual discipline through stills and learn how photography supports cinematography. Deliverable: 10-photo story (themes: preparation, silence, community, joy, work, faith or creativity).',
    resources: ['Sony A7 IV', 'Prime lens'],
  },
  {
    week: 8,
    topic: 'Event Coverage & Professional Field Production',
    subtopics: [
      'Events cannot be repeated: preparation, speed, attention, discipline',
      'Read the programme, client expectations, shot checklist, gear/battery/card prep',
      'Camera A / B / C thinking; placement for speeches, reactions and details',
      'Team roles: operator, audio, director/producer, drone (if safe), editor',
      'Capture venue, arrivals, speakers, audience reactions, details, closing moments',
      'Editing lab: select key moments, opening montage, music + natural sound, titles',
    ],
    objectives: 'Goal: plan, shoot and edit professional event coverage. Deliverable: 2-minute event highlight video.',
    resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K', 'Microphone', 'Extra batteries & memory cards'],
  },
  {
    week: 9,
    topic: 'Wedding Film Coverage, Montage & Emotional Editing',
    subtopics: [
      'A wedding film is emotional storytelling, not just documentation',
      'Bride/groom prep, ceremony, traditional, reception; entrance, first dance, cake, toasts, blessings',
      'Details: rings, dress, bouquet, shoes, hands, smiles, family reactions',
      'Slow motion, soft lighting, close-ups, elegant movement, romantic framing',
      'Editing lab: select emotional shots, cut to music rhythm, pacing, natural sound, soft grade, clean titles',
    ],
    objectives: 'Goal: shoot and edit wedding-style films with beauty and emotion. Deliverable: 1-minute wedding teaser or montage.',
    resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K', 'Gimbal', 'LED lighting'],
  },
  {
    week: 10,
    topic: 'Drone Cinematography, Adverts & Commercial Storytelling',
    subtopics: [
      'Drone shots add scale - use with purpose (location, space, movement, emotion)',
      'DJI Mavic 2 Pro safety: weather, battery, propellers, compass calibration, GPS lock, take-off/landing',
      'Moves: forward, pull-away, rising reveal, orbit, tracking, establishing',
      'Advert structure: hook, problem/desire, solution, benefits, call to action',
      'Editing lab: 30s advert + 15s vertical reel, text/logo/voice-over/CTA, export horizontal & vertical',
    ],
    objectives: 'Goal: create commercial videos that promote a brand, event, product or service. Deliverable: 30-second advert plus a 15-second social-media reel.',
    resources: ['DJI Mavic 2 Pro', 'Sony A7 IV', 'Microphone'],
  },
  {
    week: 11,
    topic: 'Final Project Production Week',
    subtopics: [
      'Apply everything learned; the instructor acts as production supervisor',
      'Choose a type: short film, mini documentary, event highlight, wedding teaser, advert, montage, promo',
      'Submit treatment, shot list, equipment/location/cast plan and shooting schedule',
      'Shoot the project; capture 10+ strong B-roll; use at least two major gear categories',
      'Review footage daily, identify missing shots, back up and organise properly',
    ],
    objectives: 'Goal: plan and shoot the demo-day project under supervision. Deliverable: organised final-project footage, a rough cut and a list of any missing shots.',
    resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K', 'DJI Mavic 2 Pro', 'Microphone', 'Tripod/Gimbal', 'LED lighting'],
  },
  {
    week: 12,
    topic: 'Final Editing, Colour Grading, Sound Design & Demo Day',
    subtopics: [
      'Editing is storytelling: move from rough cut to fine cut',
      'Balance dialogue, room tone, sound effects and music',
      'Colour correct (exposure, contrast, white balance) then apply a consistent grade',
      'Titles, logo, credits and final export',
      'Export horizontal (Full HD/4K) and vertical (1080x1920); check on speakers & headphones',
      'Demo day: present title, type, team, equipment, process, challenges and lessons',
    ],
    objectives: 'Goal: complete, polish, export and present the final film. Deliverable: finished demo-day project plus a social-media version, presented on demo day.',
    resources: ['Editing software', 'Colour grading tools', 'Headphones', 'Speakers'],
  },
];

(async () => {
  const arg = process.argv[2];
  let batchId = arg;
  if (!batchId) {
    const { data } = await supabase.from('batches')
      .select('id, name').eq('track', 'Videography').eq('is_active', true).limit(1).maybeSingle();
    if (!data) { console.error('No active Videography batch found. Pass a batchId.'); process.exit(1); }
    batchId = data.id;
    console.log(`Targeting active Videography batch: ${data.name} (${batchId})`);
  }

  const rows = WEEKS.map(w => ({
    batch_id: batchId, week: w.week, day: DAY,
    topic: w.topic, subtopics: w.subtopics, objectives: w.objectives, resources: w.resources,
  }));

  const { error } = await supabase.from('curriculum_entries')
    .upsert(rows, { onConflict: 'batch_id,week,day' });
  if (error) { console.error('SEED ERROR:', error.message); process.exit(1); }

  console.log(`Seeded ${rows.length} weekly curriculum entries.`);
  process.exit(0);
})().catch(e => { console.error('SEED ERROR:', e.message); process.exit(1); });
