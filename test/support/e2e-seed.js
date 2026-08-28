// Shared seed for the full-stack E2E harness (academy.e2e.test.js and the
// browser walkthrough). Passwords are real bcrypt hashes so the actual login
// endpoints work. Everything here is synthetic test data.
'use strict';

const bcrypt = require('bcryptjs');

// One hash reused for every account: password "Passw0rd!".
const PW = 'Passw0rd!';
const HASH = bcrypt.hashSync(PW, 4);

function seed() {
  const soon = new Date(Date.now() + 7 * 86400000).toISOString();
  const today = new Date(Date.now() + 3600000).toISOString().slice(0, 10); // WAT-ish

  const publishedSlides = [
    { slide_number: 1, slide_title: 'Intro', on_slide_text: 'Welcome', main_explanation: 'First slide', layout_type: 'title', animation_type: 'fade' },
    { slide_number: 2, slide_title: 'Body', on_slide_text: 'Details', main_explanation: 'Second slide', layout_type: 'cards_grid', animation_type: 'fade', image_url: 'https://res.cloudinary.com/demo/x.png' },
  ];
  const workingSlides = [
    { slide_number: 1, slide_title: 'Draft Intro', on_slide_text: 'wip', main_explanation: 'draft', layout_type: 'title', animation_type: 'fade' },
  ];

  return {
    users: [
      { id: 'admin1-t', name: 'Test Admin', email: 'admin@test.local', password: HASH, role: 'admin', permissions: {} },
    ],
    batches: [
      { id: 'b1-t', name: 'Batch Alpha', number: 1, track: 'AI Development', is_active: true, start_date: '2026-01-05' },
      { id: 'b2-t', name: 'Batch Beta', number: 2, track: 'UI/UX', is_active: true, start_date: '2026-01-05' },
    ],
    students: [
      { id: 's1-t', full_name: 'Ada Alpha', email: 'ada@test.local', password: HASH, batch_id: 'b1-t', track: 'AI Development', status: 'Active', application_fee_paid: true },
      { id: 's2-t', full_name: 'Ben Beta', email: 'ben@test.local', password: HASH, batch_id: 'b2-t', track: 'UI/UX', status: 'Active', application_fee_paid: true },
      { id: 's3-t', full_name: 'Unpaid Uma', email: 'uma@test.local', password: HASH, batch_id: 'b1-t', track: 'AI Development', status: 'Active', application_fee_paid: false },
      { id: 's4-t', full_name: 'Sara Suspended', email: 'sara@test.local', password: HASH, batch_id: 'b1-t', track: 'AI Development', status: 'Suspended', application_fee_paid: true },
    ],
    lecturers: [
      { id: 'L1-t', full_name: 'Lex Alpha', email: 'lex@test.local', password: HASH, specialization: 'AI', status: 'Active' },
      { id: 'L2-t', full_name: 'Lena Beta', email: 'lena@test.local', password: HASH, specialization: 'Design', status: 'Active' },
    ],
    lecturer_batches: [
      { lecturer_id: 'L1-t', batch_id: 'b1-t' },
      { lecturer_id: 'L2-t', batch_id: 'b2-t' },
    ],
    curriculum_entries: [
      { id: 'cur1-t', batch_id: 'b1-t', week: 1, day: 'Wednesday', topic: 'Variables', description: 'Basics', objectives: 'Learn vars', resources: '', subtopics: '' },
      { id: 'cur2-t', batch_id: 'b2-t', week: 1, day: 'Wednesday', topic: 'Color Theory', description: 'Basics', objectives: 'Learn color', resources: '', subtopics: '' },
    ],
    materials: [
      { id: 'm1-t', batch_id: 'b1-t', lecturer_id: 'L1-t', title: 'Slides Wk1', type: 'link', link_url: 'https://x', published: true, week: 1 },
      { id: 'm2-t', batch_id: 'b1-t', lecturer_id: 'L1-t', title: 'Draft material', type: 'link', link_url: 'https://x', published: false, week: 1 },
    ],
    assignments: [
      { id: 'as1-t', batch_id: 'b1-t', lecturer_id: 'L1-t', title: 'HW1', description: 'do it', published: true, deadline: soon, week: 1, max_score: 100 },
      { id: 'as2-t', batch_id: 'b1-t', lecturer_id: 'L1-t', title: 'Draft HW', description: 'wip', published: false, deadline: soon, week: 1, max_score: 100 },
    ],
    submissions: [],
    attendance: [
      { id: 'att1-t', batch_id: 'b1-t', week: 1, day: 'Wednesday', class_date: soon, is_open: true, check_in_code: null, auto_close_at: null, topic: 'Variables' },
    ],
    attendance_students: [],
    flashcard_sets: [
      { id: 'fs1-t', batch_id: 'b1-t', lecturer_id: 'L1-t', title: 'Wk1 Cards', topic: 'Variables', week: 1, published: true, generated_by: 'ai' },
      { id: 'fs2-t', batch_id: 'b1-t', lecturer_id: 'L1-t', title: 'Draft Cards', topic: 'Variables', week: 1, published: false, generated_by: 'ai' },
    ],
    flashcards: [
      { id: 'c1-t', set_id: 'fs1-t', batch_id: 'b1-t', question: 'What is a variable?', correct_answer: 'A container', options: ['A container', 'A loop'], order: 0 },
      { id: 'c2-t', set_id: 'fs1-t', batch_id: 'b1-t', question: '2+2?', correct_answer: '4', options: ['3', '4'], order: 1 },
    ],
    flashcard_responses: [],
    lectures: [
      { id: 'lec_pub-t', batch_id: 'b1-t', lecturer_id: 'L1-t', week: 1, day: 'Wednesday', lecture_date: today,
        course_type: 'Programming', course_title: 'AI Dev', lecture_title: 'Intro to Vars',
        status: 'published', published_slides: publishedSlides, published_notes: { summary: 'notes' },
        slides: publishedSlides, lesson_notes: { summary: 'notes' }, published_at: soon },
      { id: 'lec_draft-t', batch_id: 'b1-t', lecturer_id: 'L1-t', week: 2, day: 'Thursday', lecture_date: null,
        course_type: 'Programming', course_title: 'AI Dev', lecture_title: 'Draft Lecture',
        status: 'pending_review', published_slides: null, published_notes: null,
        slides: workingSlides, lesson_notes: {} },
      { id: 'lec_b2-t', batch_id: 'b2-t', lecturer_id: 'L2-t', week: 1, day: 'Wednesday', lecture_date: today,
        course_type: 'Programming', course_title: 'UX', lecture_title: 'Beta Lecture',
        status: 'published', published_slides: publishedSlides, published_notes: {},
        slides: publishedSlides, lesson_notes: {}, published_at: soon },
    ],
    lecture_views: [],
    payments: [],
    notifications: [],
    push_subscriptions: [],
    academy_settings: [],
    chat_threads: [], chat_participants: [], chat_messages: [],
  };
}

module.exports = { seed, PW };
