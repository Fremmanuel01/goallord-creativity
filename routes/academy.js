const router = require('express').Router();
const AcademySettings = require('../models/AcademySettings');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /api/academy/settings — public
router.get('/settings', async (req, res) => {
    try {
        const settings = await AcademySettings.get();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/academy/settings — admin only
router.put('/settings', requireAuth, requireAdmin, async (req, res) => {
    try {
        const settings = await AcademySettings.get();
        const fields = [
            'heroHeadline', 'heroSubtext', 'tracks', 'tuition',
            'schedule', 'stats', 'faqs', 'nextBatchDate'
        ];
        fields.forEach(f => {
            if (req.body[f] !== undefined) settings[f] = req.body[f];
        });
        settings.updatedAt = new Date();
        await settings.save();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Seed function
async function seedAcademySettings() {
    const count = await AcademySettings.countDocuments();
    if (count > 0) return;
    await AcademySettings.create({
        heroHeadline: 'Launch Your Career in Web Design & Development',
        heroSubtext: 'Hands-on, practical training in Onitsha, Nigeria. Learn web design, WordPress development, and digital marketing from real practitioners \u2014 not textbooks.',
        tracks: [
            {
                name: 'Web Design',
                description: 'Master Figma, HTML/CSS, and responsive design. Build 4 real portfolio projects. Graduate with a portfolio that gets you hired.',
                duration: '12 Weeks',
                topics: ['Figma & UI Design', 'HTML & CSS Fundamentals', 'Responsive Web Design', 'GSAP Animations', 'Portfolio Project'],
                icon: 'code'
            },
            {
                name: 'WordPress Developer',
                description: 'Build professional WordPress sites and WooCommerce stores from scratch. Learn to charge clients and run your own web business.',
                duration: '12 Weeks',
                topics: ['WordPress Setup', 'Theme Development', 'WooCommerce', 'SEO Fundamentals', 'Client Management'],
                icon: 'globe'
            },
            {
                name: 'Digital Marketing',
                description: 'Learn SEO, Google Ads, social media strategy, and analytics. Get certified and start generating results for businesses.',
                duration: '12 Weeks',
                topics: ['SEO Strategy', 'Google Ads', 'Social Media Marketing', 'Analytics & Reporting', 'Content Strategy'],
                icon: 'search'
            },
            {
                name: 'Brand Identity & Graphics',
                description: 'Learn logo design, visual identity systems, brand guidelines, social media graphics, and print design using Adobe Creative Suite and Canva.',
                duration: '12 Weeks',
                topics: ['Logo Design', 'Brand Guidelines', 'Typography & Color Theory', 'Social Media Graphics', 'Print Design'],
                icon: 'palette'
            }
        ],
        tuition: {
            inPerson: 150000,
            inPersonInstallment: '3 monthly payments of \u20A650,000',
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
        nextBatchDate: 'Contact us for next batch date'
    });
    console.log('Academy settings seeded');
}

module.exports = router;
module.exports.seedAcademySettings = seedAcademySettings;
