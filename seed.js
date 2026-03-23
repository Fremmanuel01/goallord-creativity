require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const Batch          = require('./models/Batch');
const Lecturer       = require('./models/Lecturer');
const Student        = require('./models/Student');
const FlashcardSet   = require('./models/FlashcardSet');
const Flashcard      = require('./models/Flashcard');
const Material       = require('./models/Material');
const Assignment     = require('./models/Assignment');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // ── 1. BATCHES ───────────────────────────────────────────────
  console.log('\n── Seeding Batches…');
  await Batch.deleteMany({ name: { $in: ['Batch Alpha 2026', 'Batch Beta 2026', 'Batch Gamma 2025'] } });

  const [batchA, batchB, batchC] = await Batch.insertMany([
    {
      name:       'Batch Alpha 2026',
      number:     1,
      track:      'Web Design',
      isActive:   true,
      startDate:  new Date('2026-01-06'),
      endDate:    new Date('2026-04-06'),
      totalWeeks: 12,
      classDays:  ['Tuesday', 'Wednesday', 'Thursday'],
      notes:      'First cohort of 2026. Focus on HTML, CSS, Figma, and WordPress.'
    },
    {
      name:       'Batch Beta 2026',
      number:     2,
      track:      'Digital Marketing',
      isActive:   false,
      startDate:  new Date('2026-04-07'),
      endDate:    new Date('2026-06-07'),
      totalWeeks: 8,
      classDays:  ['Wednesday'],
      notes:      'Digital marketing cohort. Covers SEO, social media, and paid ads.'
    },
    {
      name:       'Batch Gamma 2025',
      number:     3,
      track:      'Brand Identity',
      isActive:   false,
      startDate:  new Date('2025-09-01'),
      endDate:    new Date('2025-12-01'),
      totalWeeks: 12,
      classDays:  ['Tuesday', 'Thursday'],
      notes:      'Completed cohort — Brand Identity track.'
    }
  ]);
  console.log(`  ✓ Created: ${batchA.name}, ${batchB.name}, ${batchC.name}`);

  // ── 2. LECTURERS ─────────────────────────────────────────────
  console.log('\n── Seeding Lecturers…');
  await Lecturer.deleteMany({ email: { $in: ['chidi@goallordcreativity.com','amaka@goallordcreativity.com','emeka@goallordcreativity.com'] } });

  const pw = await bcrypt.hash('Goallord2026', 12);
  const [lec1, lec2, lec3] = await Lecturer.insertMany([
    {
      fullName:       'Chidi Okonkwo',
      email:          'chidi@goallordcreativity.com',
      password:       pw,
      phone:          '08012345601',
      bio:            'UI/UX designer and front-end developer with 6 years of experience building web products for startups across Africa.',
      specialization: 'Web Design & Frontend Development',
      batches:        [batchA._id],
      status:         'Active'
    },
    {
      fullName:       'Amaka Eze',
      email:          'amaka@goallordcreativity.com',
      password:       pw,
      phone:          '08012345602',
      bio:            'Digital marketing strategist with expertise in SEO, content strategy, and paid advertising campaigns.',
      specialization: 'Digital Marketing & SEO',
      batches:        [batchB._id],
      status:         'Active'
    },
    {
      fullName:       'Emeka Nwosu',
      email:          'emeka@goallordcreativity.com',
      password:       pw,
      phone:          '08012345603',
      bio:            'Brand identity designer with a passion for African aesthetics and visual storytelling.',
      specialization: 'Brand Identity & Graphic Design',
      batches:        [batchC._id],
      status:         'Active'
    }
  ]);
  console.log(`  ✓ Created: ${lec1.fullName}, ${lec2.fullName}, ${lec3.fullName}`);
  console.log(`  Password for all lecturers: Goallord2026`);

  // ── 3. STUDENTS ──────────────────────────────────────────────
  console.log('\n── Seeding Students…');
  await Student.deleteMany({ email: { $in: [
    'tunde@student.com','ngozi@student.com','david@student.com',
    'blessing@student.com','ifeanyi@student.com'
  ]}});

  const spw = async plain => bcrypt.hash(plain, 12);
  const [stu1, stu2, stu3, stu4, stu5] = await Student.insertMany([
    {
      fullName:  'Tunde Adeleke',
      email:     'tunde@student.com',
      password:  await spw('Student2026'),
      phone:     '08091234501',
      track:     'Web Design',
      batch:     batchA._id,
      status:    'Active',
      paymentPlan: 'monthly'
    },
    {
      fullName:  'Ngozi Obi',
      email:     'ngozi@student.com',
      password:  await spw('Student2026'),
      phone:     '08091234502',
      track:     'Web Design',
      batch:     batchA._id,
      status:    'Active',
      paymentPlan: 'full_upfront'
    },
    {
      fullName:  'David Lawal',
      email:     'david@student.com',
      password:  await spw('Student2026'),
      phone:     '08091234503',
      track:     'Web Design',
      batch:     batchA._id,
      status:    'Active',
      paymentPlan: 'monthly'
    },
    {
      fullName:  'Blessing Okoro',
      email:     'blessing@student.com',
      password:  await spw('Student2026'),
      phone:     '08091234504',
      track:     'Digital Marketing',
      batch:     batchB._id,
      status:    'Active',
      paymentPlan: 'monthly'
    },
    {
      fullName:  'Ifeanyi Chukwu',
      email:     'ifeanyi@student.com',
      password:  await spw('Student2026'),
      phone:     '08091234505',
      track:     'Brand Identity',
      batch:     batchC._id,
      status:    'Graduated',
      paymentPlan: 'full_upfront'
    }
  ]);
  console.log(`  ✓ Created: ${stu1.fullName}, ${stu2.fullName}, ${stu3.fullName}, ${stu4.fullName}, ${stu5.fullName}`);
  console.log(`  Password for all students: Student2026`);

  // ── 4. MATERIALS ─────────────────────────────────────────────
  console.log('\n── Seeding Materials…');
  await Material.deleteMany({ batch: batchA._id });

  await Material.insertMany([
    {
      batch:       batchA._id,
      lecturer:    lec1._id,
      title:       'Introduction to HTML5',
      description: 'Core HTML elements, semantic tags, forms, and document structure.',
      type:        'url',
      linkUrl:     'https://developer.mozilla.org/en-US/docs/Learn/HTML/Introduction_to_HTML',
      week:        1,
      topic:       'HTML Fundamentals',
      published:   true
    },
    {
      batch:       batchA._id,
      lecturer:    lec1._id,
      title:       'CSS Flexbox & Grid — Visual Guide',
      description: 'Complete guide to modern CSS layout systems with live examples.',
      type:        'url',
      linkUrl:     'https://css-tricks.com/snippets/css/a-guide-to-flexbox/',
      week:        2,
      topic:       'CSS Layouts',
      published:   true
    },
    {
      batch:       batchA._id,
      lecturer:    lec1._id,
      title:       'Figma for Beginners',
      description: 'Getting started with Figma — frames, components, auto-layout, and prototyping.',
      type:        'video',
      linkUrl:     'https://www.youtube.com/watch?v=FTFaQWZBqQ8',
      week:        3,
      topic:       'UI Design with Figma',
      published:   true
    }
  ]);
  console.log(`  ✓ Created 3 materials for Batch Alpha`);

  // ── 5. ASSIGNMENTS ───────────────────────────────────────────
  console.log('\n── Seeding Assignments…');
  await Assignment.deleteMany({ batch: batchA._id });

  await Assignment.insertMany([
    {
      batch:       batchA._id,
      lecturer:    lec1._id,
      title:       'Build a Personal Bio Page',
      description: 'Using only HTML5 semantic elements, build a personal bio page that includes a header, navigation, about section, skills list, and footer. Submit your GitHub repo link.',
      week:        1,
      topic:       'HTML Fundamentals',
      deadline:    new Date('2026-03-20T23:59:00Z'),
      maxScore:    100,
      published:   true
    },
    {
      batch:       batchA._id,
      lecturer:    lec1._id,
      title:       'Responsive Card Layout',
      description: 'Create a responsive card grid using CSS Flexbox or Grid. Cards should stack on mobile and show 3 columns on desktop. Include hover effects.',
      week:        2,
      topic:       'CSS Layouts',
      deadline:    new Date('2026-03-27T23:59:00Z'),
      maxScore:    100,
      published:   true
    },
    {
      batch:       batchA._id,
      lecturer:    lec1._id,
      title:       'Figma Landing Page Design',
      description: 'Design a landing page for an imaginary product in Figma. Must include a hero section, features section, testimonial, and CTA. Share your Figma link.',
      week:        3,
      topic:       'UI Design with Figma',
      deadline:    new Date('2026-04-03T23:59:00Z'),
      maxScore:    100,
      published:   true
    }
  ]);
  console.log(`  ✓ Created 3 assignments for Batch Alpha`);

  // ── 6. FLASHCARD SETS + CARDS ────────────────────────────────
  console.log('\n── Seeding Flashcard Sets…');
  await FlashcardSet.deleteMany({ batch: batchA._id });
  await Flashcard.deleteMany({ batch: batchA._id });

  // Set 1 — HTML Basics (MCQ)
  const set1 = await FlashcardSet.create({
    batch:     batchA._id,
    lecturer:  lec1._id,
    title:     'HTML Basics',
    topic:     'HTML Fundamentals',
    week:      1,
    published: true
  });
  await Flashcard.insertMany([
    { set: set1._id, batch: batchA._id, week: 1, topic: 'HTML Fundamentals', order: 1,
      question:      'Which HTML tag is used to define a hyperlink?',
      correctAnswer: '<a>',
      options:       ['<link>', '<a>', '<href>', '<url>'],
      explanation:   'The <a> (anchor) tag defines a hyperlink. The href attribute specifies the URL of the page the link goes to.' },
    { set: set1._id, batch: batchA._id, week: 1, topic: 'HTML Fundamentals', order: 2,
      question:      'What does HTML stand for?',
      correctAnswer: 'HyperText Markup Language',
      options:       ['HyperText Markup Language', 'Hyperlink and Text Markup Language', 'High Tech Modern Language', 'HyperText Making Language'],
      explanation:   'HTML stands for HyperText Markup Language — it is the standard markup language for creating web pages.' },
    { set: set1._id, batch: batchA._id, week: 1, topic: 'HTML Fundamentals', order: 3,
      question:      'Which tag defines the largest heading in HTML?',
      correctAnswer: '<h1>',
      options:       ['<heading>', '<h6>', '<h1>', '<head>'],
      explanation:   '<h1> defines the most important heading. <h6> defines the least important heading.' },
    { set: set1._id, batch: batchA._id, week: 1, topic: 'HTML Fundamentals', order: 4,
      question:      'Which HTML attribute specifies an alternate text for an image, if the image cannot be displayed?',
      correctAnswer: 'alt',
      options:       ['title', 'src', 'alt', 'longdesc'],
      explanation:   'The alt attribute provides alternative information for an image if a user for some reason cannot view it.' },
    { set: set1._id, batch: batchA._id, week: 1, topic: 'HTML Fundamentals', order: 5,
      question:      'Which HTML element is used to specify a footer for a document or section?',
      correctAnswer: '<footer>',
      options:       ['<bottom>', '<footer>', '<section>', '<div>'],
      explanation:   'The <footer> element defines a footer for a document or section, typically containing authorship, copyright, or navigation links.' }
  ]);
  console.log(`  ✓ Set 1: HTML Basics — 5 MCQ cards`);

  // Set 2 — CSS Layouts (MCQ)
  const set2 = await FlashcardSet.create({
    batch:     batchA._id,
    lecturer:  lec1._id,
    title:     'CSS Flexbox & Grid',
    topic:     'CSS Layouts',
    week:      2,
    published: true
  });
  await Flashcard.insertMany([
    { set: set2._id, batch: batchA._id, week: 2, topic: 'CSS Layouts', order: 1,
      question:      'Which CSS property is used to make a container a Flexbox container?',
      correctAnswer: 'display: flex',
      options:       ['display: block', 'display: flex', 'flex: 1', 'display: inline-flex'],
      explanation:   'Setting display: flex on a container enables Flexbox. display: inline-flex does the same but makes the container inline.' },
    { set: set2._id, batch: batchA._id, week: 2, topic: 'CSS Layouts', order: 2,
      question:      'Which Flexbox property aligns items along the main axis?',
      correctAnswer: 'justify-content',
      options:       ['align-items', 'align-self', 'justify-content', 'flex-direction'],
      explanation:   'justify-content aligns flex items along the main axis (horizontal by default). align-items aligns them along the cross axis.' },
    { set: set2._id, batch: batchA._id, week: 2, topic: 'CSS Layouts', order: 3,
      question:      'In CSS Grid, what does "fr" unit stand for?',
      correctAnswer: 'Fraction',
      options:       ['Frame', 'Fragment', 'Fraction', 'Free space'],
      explanation:   'The fr unit represents a fraction of the available space in the grid container. For example, 1fr 2fr gives columns a 1:2 ratio.' },
    { set: set2._id, batch: batchA._id, week: 2, topic: 'CSS Layouts', order: 4,
      question:      'Which CSS Grid property defines the column structure?',
      correctAnswer: 'grid-template-columns',
      options:       ['grid-columns', 'column-template', 'grid-template-columns', 'grid-layout'],
      explanation:   'grid-template-columns defines the number and size of columns in a grid container. Example: grid-template-columns: 1fr 1fr 1fr' },
    { set: set2._id, batch: batchA._id, week: 2, topic: 'CSS Layouts', order: 5,
      question:      'Which property reverses the direction of flex items?',
      correctAnswer: 'flex-direction: row-reverse',
      options:       ['flex-wrap: reverse', 'flex-direction: row-reverse', 'justify-content: reverse', 'order: -1'],
      explanation:   'flex-direction: row-reverse places flex items from right to left. Similarly, column-reverse stacks them bottom to top.' }
  ]);
  console.log(`  ✓ Set 2: CSS Flexbox & Grid — 5 MCQ cards`);

  // Set 3 — UI Design Concepts (open answer)
  const set3 = await FlashcardSet.create({
    batch:     batchA._id,
    lecturer:  lec1._id,
    title:     'UI Design Principles',
    topic:     'UI Design with Figma',
    week:      3,
    published: true
  });
  await Flashcard.insertMany([
    { set: set3._id, batch: batchA._id, week: 3, topic: 'UI Design with Figma', order: 1,
      question:      'What is the purpose of whitespace in UI design?',
      correctAnswer: 'To improve readability and visual hierarchy by giving elements room to breathe',
      options:       [],
      explanation:   'Whitespace (negative space) helps reduce cognitive load, improves readability, and makes a layout feel clean and professional.' },
    { set: set3._id, batch: batchA._id, week: 3, topic: 'UI Design with Figma', order: 2,
      question:      'What does "visual hierarchy" mean in design?',
      correctAnswer: 'The arrangement of elements to show their order of importance',
      options:       [],
      explanation:   'Visual hierarchy guides the viewer\'s eye through a design in order of importance, using size, colour, contrast, and placement.' },
    { set: set3._id, batch: batchA._id, week: 3, topic: 'UI Design with Figma', order: 3,
      question:      'What is an 8px grid system?',
      correctAnswer: 'A design system where spacing and sizes use multiples of 8px',
      options:       [],
      explanation:   'The 8px grid keeps designs consistent and visually harmonious. Common spacings: 8, 16, 24, 32, 48, 64px.' },
    { set: set3._id, batch: batchA._id, week: 3, topic: 'UI Design with Figma', order: 4,
      question:      'What is the difference between UI and UX?',
      correctAnswer: 'UI is the visual look and feel; UX is the overall experience and usability',
      options:       [],
      explanation:   'UI (User Interface) focuses on visual design — buttons, colours, typography. UX (User Experience) focuses on how the product feels to use.' },
    { set: set3._id, batch: batchA._id, week: 3, topic: 'UI Design with Figma', order: 5,
      question:      'Name three key colour properties in design.',
      correctAnswer: 'Hue, Saturation, and Brightness (HSB)',
      options:       [],
      explanation:   'Hue is the actual colour (red, blue, etc), Saturation is the intensity of the colour, and Brightness is how light or dark it is.' }
  ]);
  console.log(`  ✓ Set 3: UI Design Principles — 5 open-answer cards`);

  console.log('\n══════════════════════════════════════════');
  console.log('SEED COMPLETE. Summary:');
  console.log('  Batches  : Batch Alpha 2026 (ACTIVE), Batch Beta 2026, Batch Gamma 2025');
  console.log('  Lecturers: chidi@goallordcreativity.com / amaka@ / emeka@  (pw: Goallord2026)');
  console.log('  Students : tunde@ / ngozi@ / david@ / blessing@ / ifeanyi@student.com  (pw: Student2026)');
  console.log('  Materials: 3 published (Batch Alpha, Week 1-3)');
  console.log('  Assignments: 3 published (Batch Alpha, Week 1-3)');
  console.log('  Flashcard sets: 3 published, 15 total cards (Batch Alpha)');
  console.log('══════════════════════════════════════════\n');

  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
