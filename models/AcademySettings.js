const mongoose = require('mongoose');

const academySettingsSchema = new mongoose.Schema({
    heroHeadline: { type: String, default: 'Launch Your Career in Web Design & Development' },
    heroSubtext: { type: String, default: 'Hands-on, practical training in Onitsha, Nigeria. Learn web design, WordPress development, and digital marketing from real practitioners \u2014 not textbooks.' },
    tracks: [{
        name: { type: String, required: true },
        description: { type: String },
        duration: { type: String, default: '12 Weeks' },
        topics: [String],
        icon: { type: String, default: 'code' }
    }],
    tuition: {
        inPerson: { type: Number, default: 150000 },
        inPersonInstallment: { type: String, default: '3 monthly payments of \u20A650,000' },
        online: { type: Number, default: 80000 },
        onlineNote: { type: String, default: 'One-time payment' },
        duration: { type: String, default: '12 weeks' }
    },
    schedule: {
        weekday: { type: String, default: 'Tue / Wed / Thu, 4:00 PM \u2013 7:00 PM' },
        weekend: { type: String, default: 'Saturday, 10:00 AM \u2013 3:00 PM' }
    },
    stats: {
        students: { type: Number, default: 50 },
        jobRate: { type: Number, default: 85 },
        programWeeks: { type: Number, default: 12 },
        batchesRun: { type: Number, default: 5 }
    },
    faqs: [{
        question: String,
        answer: String
    }],
    nextBatchDate: { type: String, default: 'Contact us for next batch date' },
    updatedAt: { type: Date, default: Date.now }
});

academySettingsSchema.statics.get = async function() {
    let doc = await this.findOne();
    if (!doc) doc = await this.create({});
    return doc;
};

module.exports = mongoose.model('AcademySettings', academySettingsSchema);
