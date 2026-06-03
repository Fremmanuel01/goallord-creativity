// Seed the 12-week High-End Practical Film Bootcamp curriculum into a Videography
// batch. Classes run Wednesday + Thursday every week, so each week is split into
// two sessions following the bootcamp method:
//   Wednesday = learn & shoot  (concept, demonstration, guided practice)
//   Thursday  = produce & edit (field exercise, editing lab, assignment)
// Idempotent (upsert on batch_id, week, day). Also sets the batch class days.
// Usage: node scripts/seed-videography-curriculum.js [batchId]
require('dotenv').config();
const supabase = require('../lib/supabase');

const WEEKS = [
  { week: 1,
    wed: { topic: 'Orientation, Camera Safety & Camera Handling',
      subtopics: [
        'Cinematography is making the viewer feel something, not just recording',
        'Sony A7 IV: body controls, lens mount, battery, memory cards, safe handheld posture',
        'Blackmagic 6K: controls, media setup, tripod mount, menu basics, safe packing',
        'Gear discipline: carrying during events, lens cleaning, dust/sensor safety',
        'Practical: mount/unmount a lens; shoot 10 stable shots (wide, medium, close-up, low & high angle)',
      ],
      objectives: 'Goal: set up and safely handle the Sony A7 IV and Blackmagic 6K, and shoot 10 stable, well-framed shots.',
      resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K', 'Tripod'] },
    thu: { topic: 'First Edit: Import, Cut & Export',
      subtopics: ['Create a new editing project', 'Import the day’s clips', 'Arrange clips on a timeline', 'Make basic cuts and a simple export', 'Assignment briefing'],
      objectives: 'Goal: complete a full shoot-to-export cycle. Deliverable: 30-second "My Environment" video using a wide, medium, close-up, low-angle and high-angle shot.',
      resources: ['Editing software'] } },

  { week: 2,
    wed: { topic: 'Manual Camera Settings, Exposure & Focus',
      subtopics: [
        'Aperture, ISO, shutter speed/angle, frame rate, white balance, focus',
        'Sony A7 IV: manual exposure, autofocus & tracking, white balance, 4K',
        'Blackmagic 6K: resolution, shutter angle, ISO, false colour, focus peaking, BRAW',
        'Shoot correct vs over/under exposure; correct vs wrong white balance',
        'Manual focus vs autofocus; slow-motion test footage',
      ],
      objectives: 'Goal: shoot manually with control instead of relying on automatic settings.',
      resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K'] },
    thu: { topic: 'Settings Comparison Edit',
      subtopics: ['Organise clips by camera and setting', 'Build a comparison timeline', 'Add text labels to identify settings', 'Export a 1-minute comparison', 'Assignment briefing'],
      objectives: 'Goal: see how each setting changes the image. Deliverable: 1-minute camera-settings exercise explaining aperture, ISO, shutter speed, white balance and focus.',
      resources: ['Editing software'] } },

  { week: 3,
    wed: { topic: 'Composition, Shot Types & Visual Storytelling',
      subtopics: [
        'Rule of thirds, headroom, lead room, depth, leading lines, clean background',
        'Shot types: extreme wide, wide, medium, close-up, extreme close-up, OTS, insert, cutaway, establishing, reaction',
        'Every shot answers a story question (where, who, what, feel, detail)',
        'Build a shot list; layer foreground, middle ground and background',
        'Shoot a simple silent story using at least 10 shot types',
      ],
      objectives: 'Goal: frame professional shots that communicate meaning.',
      resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K', 'Tripod'] },
    thu: { topic: 'Continuity Editing',
      subtopics: ['Edit for continuity', 'Order wide, medium and close-up shots properly', 'Use cutaways to cover edits', 'Avoid jump cuts and confusing flow', 'Assignment briefing'],
      objectives: 'Goal: assemble a clear visual story. Deliverable: 1-minute silent story with no dialogue.',
      resources: ['Editing software'] } },

  { week: 4,
    wed: { topic: 'Camera Movement & Stabilization',
      subtopics: [
        'Movement must have meaning: reveal, follow action, suspense, beauty, emotion, energy',
        'Static, tripod pan/tilt, handheld, gimbal-style, slow motion',
        'Push-in, pull-out, tracking, orbit, reveal',
        'Drill: 3 each of tripod, handheld, reveal, slow-motion and tracking shots',
      ],
      objectives: 'Goal: move the camera smoothly and intentionally.',
      resources: ['Tripod', 'Gimbal', 'Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K'] },
    thu: { topic: 'Cutting to Music',
      subtopics: ['Cut to music; match movement to beats', 'Use speed ramps and slow motion', 'Apply transitions only when they support the edit', 'Avoid unnecessary effects', 'Assignment briefing'],
      objectives: 'Goal: edit movement with rhythm. Deliverable: 45-second cinematic movement montage cut to music.',
      resources: ['Editing software'] } },

  { week: 5,
    wed: { topic: 'Lighting for Film, Interviews, Events & Weddings',
      subtopics: [
        'Natural vs artificial, hard vs soft, side, back, practical and window light',
        'Three-point lighting: key, key+fill, key+backlight; low-key vs high-key',
        'Light setups: interview, dramatic scene, wedding prep, product advert, window portrait',
        'Shoot each setup with corrected, intentional lighting',
      ],
      objectives: 'Goal: shape light for different production situations.',
      resources: ['LED lighting', 'Reflector', 'Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K'] },
    thu: { topic: 'Colour Correction Basics',
      subtopics: ['Correct exposure, contrast and brightness', 'Fix white balance', 'Match shots from different lighting setups', 'Apply basic colour correction', 'Assignment briefing'],
      objectives: 'Goal: balance and match shots in post. Deliverable: 1-minute lighting exercise showing three moods - soft/beautiful, dramatic and corporate/interview.',
      resources: ['Editing software'] } },

  { week: 6,
    wed: { topic: 'Sound Recording & Interviews',
      subtopics: [
        'Mic placement, levels, clipping, room tone, echo, syncing, voice-over, music balance',
        'Interview planning: framing, lighting, sound, good questions, B-roll',
        'Bad vs good audio; mic too far vs close to subject',
        'Record a lavalier/wireless interview; capture 10+ B-roll shots and room tone',
      ],
      objectives: 'Goal: capture clean sound and record story-driven interviews.',
      resources: ['Lavalier/wireless microphone', 'Headphones', 'Sony A7 IV'] },
    thu: { topic: 'Documentary Editing',
      subtopics: ['Cut interview answers into a clear story; remove pauses and mistakes', 'Lay B-roll over interview sections', 'Add lower thirds', 'Balance voice, music and room tone', 'Assignment briefing'],
      objectives: 'Goal: edit a documentary-style piece. Deliverable: 2-minute mini documentary.',
      resources: ['Editing software'] } },

  { week: 7,
    wed: { topic: 'Photography Basics for Cinematographers',
      subtopics: [
        'Photography trains the eye: composition, exposure, timing, light direction, detail',
        'Portrait composition good vs bad; harsh vs soft light',
        'Event moments, product detail and environmental frames',
        'Shoot 5 each: portraits, candids, product/detail, environmental and event photos',
      ],
      objectives: 'Goal: strengthen visual discipline through stills.',
      resources: ['Sony A7 IV', 'Prime lens'] },
    thu: { topic: 'Photo Editing & Sequencing',
      subtopics: ['Crop and straighten; adjust exposure and contrast', 'Correct colour temperature', 'Sequence photos to tell a story', 'Export for web and print', 'Assignment briefing'],
      objectives: 'Goal: edit and sequence stills into a story. Deliverable: 10-photo story.',
      resources: ['Photo editing software'] } },

  { week: 8,
    wed: { topic: 'Event Coverage & Field Production',
      subtopics: [
        'Events cannot be repeated: preparation, speed, attention, discipline',
        'Read the programme; client expectations; shot checklist; gear/battery/card prep',
        'Camera A / B / C thinking; placement for speeches, reactions and details',
        'Team roles: operator, audio, director, drone (if safe), editor',
        'Cover a simulated/real event: venue, arrivals, speakers, reactions, details, closing',
      ],
      objectives: 'Goal: plan and shoot professional event coverage in teams.',
      resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K', 'Microphone', 'Extra batteries & memory cards'] },
    thu: { topic: 'Event Highlight Editing',
      subtopics: ['Select key moments from long footage', 'Build an opening montage', 'Use music and natural sound', 'Add titles and simple lower thirds', 'Assignment briefing'],
      objectives: 'Goal: edit a fast, clean highlight. Deliverable: 2-minute event highlight video.',
      resources: ['Editing software'] } },

  { week: 9,
    wed: { topic: 'Wedding Film Coverage',
      subtopics: [
        'A wedding film is emotional storytelling, not just documentation',
        'Prep, ceremony, reception; entrance, first dance, cake, toasts, blessings',
        'Details: rings, dress, bouquet, shoes, hands, smiles, family reactions',
        'Slow motion, soft lighting, close-ups, elegant movement, romantic framing',
        'Stage and shoot prep, ring/bouquet details, couple walk, family reaction, slow-mo entrance',
      ],
      objectives: 'Goal: shoot wedding-style footage with beauty and emotion.',
      resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K', 'Gimbal', 'LED lighting'] },
    thu: { topic: 'Emotional Wedding Edit',
      subtopics: ['Select emotional shots', 'Cut to music rhythm with proper pacing', 'Use slow motion and natural-sound moments', 'Colour grade for a soft wedding feel; add clean titles', 'Assignment briefing'],
      objectives: 'Goal: edit with emotion and pacing. Deliverable: 1-minute wedding teaser or montage.',
      resources: ['Editing software'] } },

  { week: 10,
    wed: { topic: 'Drone Cinematography & Advert Production',
      subtopics: [
        'Drone shots add scale - use with purpose (location, space, movement, emotion)',
        'DJI Mavic 2 Pro safety: weather, battery, propellers, compass, GPS, take-off/landing',
        'Moves: forward, pull-away, rising reveal, orbit, tracking, establishing',
        'Advert structure: hook, problem/desire, solution, benefits, call to action',
        'Shoot drone establishing/reveal/pull-away (if safe) plus a product or business promo',
      ],
      objectives: 'Goal: capture drone shots safely and shoot a commercial promo.',
      resources: ['DJI Mavic 2 Pro', 'Sony A7 IV', 'Microphone'] },
    thu: { topic: 'Advert & Reel Editing',
      subtopics: ['Edit a 30-second advert', 'Create a 15-second vertical reel from the same footage', 'Add text overlays, music, logo, voice-over and call-to-action', 'Export horizontal and vertical versions', 'Assignment briefing'],
      objectives: 'Goal: edit commercial videos for brand and social. Deliverable: 30-second advert plus a 15-second social-media reel.',
      resources: ['Editing software'] } },

  { week: 11,
    wed: { topic: 'Final Project Planning & Production',
      subtopics: [
        'Apply everything learned; the instructor acts as production supervisor',
        'Choose a type: short film, documentary, event highlight, wedding teaser, advert, montage, promo',
        'Submit treatment, shot list, equipment/location/cast plan and shooting schedule',
        'Use at least two major gear categories; capture 10+ strong B-roll shots',
      ],
      objectives: 'Goal: plan and begin shooting the demo-day project under supervision.',
      resources: ['Sony A7 IV', 'Blackmagic Pocket Cinema Camera 6K', 'DJI Mavic 2 Pro', 'Microphone', 'Tripod/Gimbal', 'LED lighting'] },
    thu: { topic: 'Production & Rough Cut',
      subtopics: ['Continue shooting the final project', 'Review footage at the end of the day', 'Organise final-project folders; back up properly', 'Begin the rough cut; identify and reshoot missing shots', 'Assignment briefing'],
      objectives: 'Goal: finish shooting and start editing. Deliverable: organised footage, a rough cut and a missing-shots list.',
      resources: ['Editing software'] } },

  { week: 12,
    wed: { topic: 'Final Editing & Colour Grading',
      subtopics: [
        'Editing is storytelling: move from rough cut to fine cut',
        'Balance dialogue, room tone, sound effects and music',
        'Colour correct (exposure, contrast, white balance) then apply a consistent grade',
        'Add titles, logo and credits',
        'Prepare horizontal (Full HD/4K) and vertical (1080x1920) exports',
      ],
      objectives: 'Goal: complete, polish and export the final film.',
      resources: ['Editing software', 'Colour grading tools', 'Headphones', 'Speakers'] },
    thu: { topic: 'Demo Day',
      subtopics: ['Final polish; check sound on speakers and headphones', 'Screen the project before presentation', 'Present: title, type, team, equipment, planning, challenges and lessons', 'Certificate presentation and awards'],
      objectives: 'Goal: present the finished film. Deliverable: demo-day project plus a social-media version, presented on demo day.',
      resources: ['Projector/Screen', 'Speakers'] } },
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

  // Classes run Wednesday + Thursday every week.
  await supabase.from('batches').update({ class_days: ['Wednesday', 'Thursday'] }).eq('id', batchId);

  const rows = [];
  for (const w of WEEKS) {
    rows.push({ batch_id: batchId, week: w.week, day: 'Wednesday', topic: w.wed.topic, subtopics: w.wed.subtopics, objectives: w.wed.objectives, resources: w.wed.resources });
    rows.push({ batch_id: batchId, week: w.week, day: 'Thursday',  topic: w.thu.topic, subtopics: w.thu.subtopics, objectives: w.thu.objectives, resources: w.thu.resources });
  }

  const { error } = await supabase.from('curriculum_entries')
    .upsert(rows, { onConflict: 'batch_id,week,day' });
  if (error) { console.error('SEED ERROR:', error.message); process.exit(1); }

  console.log(`Set class days to Wednesday + Thursday and seeded ${rows.length} sessions (${WEEKS.length} weeks x 2 days).`);
  process.exit(0);
})().catch(e => { console.error('SEED ERROR:', e.message); process.exit(1); });
