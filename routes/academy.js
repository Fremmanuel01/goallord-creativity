const router = require('express').Router();
const academyDb = require('../db/academySettings');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /api/academy/settings — public
router.get('/settings', async (req, res) => {
    try {
        const settings = await academyDb.get();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/academy/settings — admin only
router.put('/settings', requireAuth, requireAdmin, async (req, res) => {
    try {
        const settings = await academyDb.get();
        const fieldMap = {
            heroHeadline: 'hero_headline',
            heroSubtext: 'hero_subtext',
            tracks: 'tracks',
            tuition: 'tuition',
            schedule: 'schedule',
            stats: 'stats',
            faqs: 'faqs',
            instructors: 'instructors',
            nextBatchDate: 'next_batch_date'
        };
        const updates = {};
        for (const [camel, snake] of Object.entries(fieldMap)) {
            if (req.body[camel] !== undefined) updates[snake] = req.body[camel];
        }
        updates.updated_at = new Date().toISOString();
        const updated = await academyDb.update(settings.id, updates);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Seed function
async function seedAcademySettings() {
    const count = await academyDb.count();
    if (count > 0) return;
    await academyDb.create({
        hero_headline: 'Launch Your Career in AI, Design & Development',
        hero_subtext: 'Hands-on, practical training in Onitsha, Nigeria. Learn AI software development, UI/UX design, WordPress, AI app development, and videography from real practitioners \u2014 not textbooks.',
        tracks: [
            {
                name: 'AI Software Development',
                description: 'Build production AI-powered software using Python, LLMs, vector databases, and modern agent frameworks. Graduate ready to ship intelligent applications.',
                duration: '12 Weeks',
                topics: ['Python Fundamentals', 'LLM APIs & Prompt Engineering', 'Vector Databases', 'AI Agent Frameworks', 'Deployment'],
                icon: 'code'
            },
            {
                name: 'UI/UX Design',
                description: 'Learn user research, wireframing, prototyping, and interface design with Figma. Ship production-ready product experiences.',
                duration: '12 Weeks',
                topics: ['User Research', 'Wireframing', 'Figma Prototyping', 'Design Systems', 'Usability Testing'],
                icon: 'palette'
            },
            {
                name: 'WordPress Development',
                description: 'Build professional WordPress sites and WooCommerce stores from scratch. Learn to charge clients and run your own web business.',
                duration: '12 Weeks',
                topics: ['WordPress Setup', 'Theme Development', 'WooCommerce', 'SEO Fundamentals', 'Client Management'],
                icon: 'globe'
            },
            {
                name: 'AI App Development',
                description: 'Build mobile and web apps powered by AI. Learn React Native, API integration, and how to ship AI-driven products users love.',
                duration: '12 Weeks',
                topics: ['React & React Native', 'API Integration', 'AI Feature Integration', 'App Deployment', 'Product Design'],
                icon: 'search'
            },
            {
                name: 'Videography',
                description: 'Master video production from pre-production to post. Learn cinematography, editing, colour grading, and content creation for brands.',
                duration: '12 Weeks',
                topics: ['Cinematography', 'Video Editing', 'Colour Grading', 'Sound Design', 'Content Strategy'],
                icon: 'video'
            }
        ],
        instructors: [
            { name: 'Emmanuel K. Nwabufo', role: 'Founder & Lead Instructor', photo: 'assets/images/section/ceo.webp', teaches: 'AI Software Development, Custom Development', bio: '5+ years building websites and web apps for businesses across Nigeria and internationally. Founded Goallord in 2020.' },
            { name: 'Nnaemego Ifeanyi', role: 'Senior Developer & Instructor', photo: 'assets/images/team members/Mr Ifeanyi.webp', teaches: 'WordPress, AI App Development', bio: 'Full-stack developer specializing in WordPress and React. Has built 20+ production websites.' },
            { name: 'Felicitas K. Ogbachalu', role: 'WordPress Developer & Instructor', photo: 'assets/images/team members/Kosi.webp', teaches: 'WordPress Track', bio: 'WordPress specialist with experience building sites for schools, churches, and businesses.' }
        ],
        tuition: {
            inPerson: 300000,
            inPersonInstallment: '3 monthly payments of \u20A6100,000',
            online: 80000,
            onlineNote: 'One-time payment',
            duration: '12 weeks'
        },
        schedule: {
            weekday: 'Tue / Wed / Thu, 4:00 PM \u2013 7:00 PM',
            weekend: 'Saturday, 10:00 AM \u2013 3:00 PM'
        },
        stats: {
            students: 50,
            jobRate: 85,
            programWeeks: 12,
            batchesRun: 5
        },
        faqs: [
            { question: 'When does the next batch start?', answer: 'We run new batches every 3 months. Contact us or follow our social media for the next start date.' },
            { question: 'What if I miss a class?', answer: 'All sessions are recorded. You can catch up through our student portal. But we encourage attendance since the value is in live interaction and feedback.' },
            { question: 'Can I switch tracks mid-course?', answer: 'Yes, within the first 2 weeks. After that, we recommend completing your current track first.' },
            { question: 'Is there a refund policy?', answer: 'If you withdraw within the first week, we refund 80% of your fees. After the first week, fees are non-refundable but you can defer to the next batch.' },
            { question: 'What happens after graduation?', answer: 'You get a certificate, access to our alumni network, job referrals, and ongoing mentorship. We also connect you with freelance opportunities.' },
            { question: 'Do I need a laptop?', answer: 'Yes, for in-person training you need your own laptop. For online, any computer with a browser works.' },
            { question: 'Can I pay in installments?', answer: 'Yes. In-person training (\u20A6150,000) can be paid in 3 monthly installments of \u20A650,000. Online training (\u20A680,000) is a one-time payment.' },
            { question: "What's the class size?", answer: 'We keep batches small, usually 10-15 students per track. This ensures everyone gets personal attention and feedback.' }
        ],
        next_batch_date: 'Contact us for next batch date'
    });
    console.log('Academy settings seeded');
}

module.exports = router;
module.exports.seedAcademySettings = seedAcademySettings;
