/**
 * MongoDB → Supabase Data Migration Script
 *
 * Reads all documents from MongoDB, transforms them to snake_case with UUIDs,
 * and inserts into Supabase in dependency order.
 *
 * Usage: node scripts/migrate-data.js
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Map old MongoDB ObjectId → new UUID
const idMap = {};

function newUUID() {
  return crypto.randomUUID();
}

function mapId(oldId) {
  if (!oldId) return null;
  const key = oldId.toString();
  if (!idMap[key]) {
    idMap[key] = newUUID();
  }
  return idMap[key];
}

function toISO(date) {
  if (!date) return null;
  return new Date(date).toISOString();
}

// Strip undefined/null values for optional fields, keep required ones
function clean(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}

async function migrate() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  console.log('Connected to MongoDB\n');

  // First, clear existing Supabase data (in reverse dependency order)
  console.log('Clearing existing Supabase data...');
  const tablesToClear = [
    'reminder_logs', 'reminder_settings',
    'affiliate_clicks', 'affiliate_links',
    'conversation_messages', 'conversations',
    'check_ins',
    'task_dependencies', 'task_comments', 'tasks',
    'project_members', 'projects',
    'contact_replies', 'contacts',
    'client_logos', 'clients', 'team_members',
    'orders', 'products',
    'blog_comments', 'blog_posts', 'content',
    'notifications',
    'flashcard_responses', 'flashcards', 'flashcard_sets',
    'curriculum_entries',
    'attendance_students', 'attendance',
    'materials', 'submissions', 'assignments',
    'payments',
    'lecturer_batches', 'lecturers',
    'students', 'applicants', 'batches',
    'academy_settings',
    'users'
  ];
  for (const table of tablesToClear) {
    await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }
  console.log('Cleared.\n');

  // ──────────────────────────────────────────────────
  // PHASE A: Independent tables
  // ──────────────────────────────────────────────────

  // Users
  const users = await db.collection('users').find().toArray();
  if (users.length) {
    console.log(`Migrating ${users.length} users...`);
    for (const u of users) {
      const id = mapId(u._id);
      await supabase.from('users').insert(clean({
        id,
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role || 'staff',
        permissions: u.permissions || {},
        avatar: u.avatar || '',
        reset_token: u.resetToken,
        reset_expires: toISO(u.resetExpires),
        created_at: toISO(u.createdAt)
      }));
    }
    console.log('  ✓ users');
  }

  // Batches
  const batches = await db.collection('batches').find().toArray();
  if (batches.length) {
    console.log(`Migrating ${batches.length} batches...`);
    for (const b of batches) {
      const id = mapId(b._id);
      await supabase.from('batches').insert(clean({
        id,
        name: b.name,
        number: b.number,
        track: b.track,
        is_active: b.isActive || false,
        start_date: b.startDate ? new Date(b.startDate).toISOString().split('T')[0] : null,
        end_date: b.endDate ? new Date(b.endDate).toISOString().split('T')[0] : null,
        total_weeks: b.totalWeeks || 12,
        class_days: b.classDays || [],
        notes: b.notes || '',
        created_by: b.createdBy ? mapId(b.createdBy) : null,
        created_at: toISO(b.createdAt)
      }));
    }
    console.log('  ✓ batches');
  }

  // Applicants
  const applicants = await db.collection('applicants').find().toArray();
  if (applicants.length) {
    console.log(`Migrating ${applicants.length} applicants...`);
    for (const a of applicants) {
      const id = mapId(a._id);
      await supabase.from('applicants').insert(clean({
        id,
        full_name: a.fullName,
        email: a.email,
        phone: a.phone,
        location: a.location,
        track: a.track,
        experience: a.experience,
        schedule: a.schedule,
        how_found: a.howFound,
        goal: a.goal,
        why: a.why,
        background: a.background,
        status: a.status || 'Pending',
        notes: a.notes || '',
        email_verified: a.emailVerified || false,
        email_verify_token: a.emailVerifyToken,
        email_verify_expires: toISO(a.emailVerifyExpires),
        application_fee_paid: a.applicationFeePaid || false,
        application_fee_ref: a.applicationFeeRef || '',
        pending_payment_plan: a.pendingPaymentPlan || '',
        profile_photo: a.profilePhoto || '',
        created_at: toISO(a.createdAt)
      }));
    }
    console.log('  ✓ applicants');
  }

  // Products
  const products = await db.collection('products').find().toArray();
  if (products.length) {
    console.log(`Migrating ${products.length} products...`);
    for (const p of products) {
      const id = mapId(p._id);
      await supabase.from('products').insert(clean({
        id,
        name: p.name,
        category: p.category,
        price: p.price,
        currency: p.currency || 'USD',
        description: p.description,
        type: p.type || '',
        demo_url: p.demoUrl || '',
        features: p.features || [],
        download_url: p.downloadUrl || '',
        stock: p.stock !== undefined ? p.stock : -1,
        active: p.active !== undefined ? p.active : true,
        image: p.image || '',
        created_at: toISO(p.createdAt)
      }));
    }
    console.log('  ✓ products');
  }

  // Content
  const contents = await db.collection('contents').find().toArray();
  if (contents.length) {
    console.log(`Migrating ${contents.length} content sections...`);
    for (const c of contents) {
      await supabase.from('content').insert(clean({
        id: mapId(c._id),
        section: c.section,
        data: c.data || {},
        updated_at: toISO(c.updatedAt)
      }));
    }
    console.log('  ✓ content');
  }

  // Academy Settings
  const acSettings = await db.collection('academysettings').find().toArray();
  if (acSettings.length) {
    console.log(`Migrating academy settings...`);
    const s = acSettings[0];
    await supabase.from('academy_settings').insert(clean({
      id: mapId(s._id),
      hero_headline: s.heroHeadline,
      hero_subtext: s.heroSubtext,
      tracks: s.tracks || [],
      tuition: s.tuition || {},
      schedule: s.schedule || {},
      stats: s.stats || {},
      instructors: s.instructors || [],
      faqs: s.faqs || [],
      next_batch_date: s.nextBatchDate || 'Contact us for next batch date',
      updated_at: toISO(s.updatedAt)
    }));
    console.log('  ✓ academy_settings');
  }

  // Reminder Settings
  const remSettings = await db.collection('remindersettings').find().toArray();
  if (remSettings.length) {
    console.log(`Migrating reminder settings...`);
    const rs = remSettings[0];
    await supabase.from('reminder_settings').insert(clean({
      id: mapId(rs._id),
      frequency: rs.frequency || 2,
      enabled: rs.enabled !== undefined ? rs.enabled : true,
      send_time: rs.sendTime || '08:00'
    }));
    console.log('  ✓ reminder_settings');
  }

  // Affiliate Links
  const affLinks = await db.collection('affiliatelinks').find().toArray();
  if (affLinks.length) {
    console.log(`Migrating ${affLinks.length} affiliate links...`);
    for (const l of affLinks) {
      await supabase.from('affiliate_links').insert(clean({
        id: mapId(l._id),
        slug: l.slug,
        name: l.name,
        destination: l.destination,
        category: l.category || 'General',
        description: l.description || '',
        total_clicks: l.totalClicks || 0,
        active: l.active !== undefined ? l.active : true,
        created_at: toISO(l.createdAt),
        updated_at: toISO(l.updatedAt)
      }));
    }
    console.log('  ✓ affiliate_links');
  }

  // Team Members
  const teamMembers = await db.collection('teammembers').find().toArray();
  if (teamMembers.length) {
    console.log(`Migrating ${teamMembers.length} team members...`);
    for (const t of teamMembers) {
      await supabase.from('team_members').insert(clean({
        id: mapId(t._id),
        name: t.name,
        role: t.role,
        photo: t.photo || '',
        photo_id: t.photoId || '',
        linkedin: t.linkedin || '',
        github: t.github || '',
        twitter: t.twitter || '',
        order: t.order || 0,
        visible: t.visible !== undefined ? t.visible : true,
        created_at: toISO(t.createdAt),
        updated_at: toISO(t.updatedAt)
      }));
    }
    console.log('  ✓ team_members');
  }

  // Client Logos
  const logos = await db.collection('clientlogos').find().toArray();
  if (logos.length) {
    console.log(`Migrating ${logos.length} client logos...`);
    for (const l of logos) {
      await supabase.from('client_logos').insert(clean({
        id: mapId(l._id),
        name: l.name,
        image: l.image,
        image_id: l.imageId || '',
        order: l.order || 0,
        visible: l.visible !== undefined ? l.visible : true,
        created_at: toISO(l.createdAt),
        updated_at: toISO(l.updatedAt)
      }));
    }
    console.log('  ✓ client_logos');
  }

  // Clients
  const clients = await db.collection('clients').find().toArray();
  if (clients.length) {
    console.log(`Migrating ${clients.length} clients...`);
    for (const c of clients) {
      await supabase.from('clients').insert(clean({
        id: mapId(c._id),
        name: c.name,
        email: c.email,
        phone: c.phone,
        company: c.company,
        service: c.service,
        budget: c.budget,
        timeline: c.timeline,
        message: c.message,
        status: c.status || 'Pending',
        notes: c.notes || '',
        created_at: toISO(c.createdAt)
      }));
    }
    console.log('  ✓ clients');
  }

  // ──────────────────────────────────────────────────
  // PHASE B: Tables with FK to Phase A
  // ──────────────────────────────────────────────────

  // Students
  const students = await db.collection('students').find().toArray();
  if (students.length) {
    console.log(`Migrating ${students.length} students...`);
    for (const s of students) {
      await supabase.from('students').insert(clean({
        id: mapId(s._id),
        full_name: s.fullName,
        email: s.email,
        password: s.password,
        phone: s.phone,
        track: s.track,
        batch_id: s.batch ? mapId(s.batch) : null,
        profile_picture: s.profilePicture || '',
        payment_plan: s.paymentPlan || 'monthly',
        payment_status: s.paymentStatus || 'pending',
        application_fee_paid: s.applicationFeePaid || false,
        total_tuition_months: s.totalTuitionMonths || 3,
        status: s.status || 'Active',
        applicant_ref: s.applicantRef ? mapId(s.applicantRef) : null,
        notes: s.notes || '',
        enrolled_at: toISO(s.enrolledAt),
        reset_token: s.resetToken,
        reset_expires: toISO(s.resetExpires)
      }));
    }
    console.log('  ✓ students');
  }

  // Lecturers
  const lecturers = await db.collection('lecturers').find().toArray();
  if (lecturers.length) {
    console.log(`Migrating ${lecturers.length} lecturers...`);
    for (const l of lecturers) {
      const id = mapId(l._id);
      await supabase.from('lecturers').insert(clean({
        id,
        full_name: l.fullName,
        email: l.email,
        password: l.password,
        phone: l.phone || '',
        profile_picture: l.profilePicture || '',
        bio: l.bio || '',
        specialization: l.specialization || '',
        status: l.status || 'Active',
        created_by: l.createdBy ? mapId(l.createdBy) : null,
        created_at: toISO(l.createdAt),
        reset_token: l.resetToken,
        reset_expires: toISO(l.resetExpires)
      }));
      // Junction: lecturer_batches
      if (l.batches && l.batches.length) {
        for (const bId of l.batches) {
          await supabase.from('lecturer_batches').insert({
            lecturer_id: id,
            batch_id: mapId(bId)
          });
        }
      }
    }
    console.log('  ✓ lecturers + lecturer_batches');
  }

  // Blog Posts
  const blogPosts = await db.collection('blogposts').find().toArray();
  if (blogPosts.length) {
    console.log(`Migrating ${blogPosts.length} blog posts...`);
    for (const p of blogPosts) {
      await supabase.from('blog_posts').insert(clean({
        id: mapId(p._id),
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt || '',
        content: p.content || '',
        cover_image: p.coverImage || '',
        category: p.category || 'General',
        tags: p.tags || [],
        author: p.author || 'The Goallord Team',
        author_avatar: p.authorAvatar || '',
        read_time: p.readTime || '5 min read',
        featured: p.featured || false,
        published: p.published !== undefined ? p.published : true,
        published_at: toISO(p.publishedAt),
        views: p.views || 0,
        has_affiliate: p.hasAffiliate || false,
        affiliate_cta: p.affiliateCta || { text: '', url: '', label: '' },
        reactions: p.reactions || { like: 0, love: 0, fire: 0, clap: 0, think: 0 },
        created_at: toISO(p.createdAt),
        updated_at: toISO(p.updatedAt)
      }));
    }
    console.log('  ✓ blog_posts');
  }

  // Projects
  const projects = await db.collection('projects').find().toArray();
  if (projects.length) {
    console.log(`Migrating ${projects.length} projects...`);
    for (const p of projects) {
      const id = mapId(p._id);
      await supabase.from('projects').insert(clean({
        id,
        name: p.name,
        client: p.client || '',
        description: p.description || '',
        status: p.status || 'not-started',
        priority: p.priority || 'medium',
        deadline: toISO(p.deadline),
        color: p.color || '#D66A1F',
        budget: p.budget || 0,
        spent: p.spent || 0,
        created_by: p.createdBy ? mapId(p.createdBy) : null,
        created_at: toISO(p.createdAt),
        updated_at: toISO(p.updatedAt)
      }));
      // Junction: project_members
      if (p.members && p.members.length) {
        for (const uid of p.members) {
          await supabase.from('project_members').insert({
            project_id: id,
            user_id: mapId(uid)
          });
        }
      }
    }
    console.log('  ✓ projects + project_members');
  }

  // ──────────────────────────────────────────────────
  // PHASE C: Tables with deeper FKs
  // ──────────────────────────────────────────────────

  // Assignments
  const assignments = await db.collection('assignments').find().toArray();
  if (assignments.length) {
    console.log(`Migrating ${assignments.length} assignments...`);
    for (const a of assignments) {
      await supabase.from('assignments').insert(clean({
        id: mapId(a._id),
        batch_id: mapId(a.batch),
        lecturer_id: mapId(a.lecturer),
        title: a.title,
        description: a.description,
        week: a.week,
        topic: a.topic || '',
        deadline: toISO(a.deadline),
        max_score: a.maxScore || 100,
        published: a.published || false,
        created_at: toISO(a.createdAt)
      }));
    }
    console.log('  ✓ assignments');
  }

  // Materials
  const materials = await db.collection('materials').find().toArray();
  if (materials.length) {
    console.log(`Migrating ${materials.length} materials...`);
    for (const m of materials) {
      await supabase.from('materials').insert(clean({
        id: mapId(m._id),
        batch_id: mapId(m.batch),
        lecturer_id: mapId(m.lecturer),
        title: m.title,
        description: m.description || '',
        type: m.type,
        file_url: m.fileUrl || '',
        link_url: m.linkUrl || '',
        week: m.week,
        topic: m.topic || '',
        published: m.published || false,
        created_at: toISO(m.createdAt)
      }));
    }
    console.log('  ✓ materials');
  }

  // Flashcard Sets
  const fcSets = await db.collection('flashcardsets').find().toArray();
  if (fcSets.length) {
    console.log(`Migrating ${fcSets.length} flashcard sets...`);
    for (const s of fcSets) {
      await supabase.from('flashcard_sets').insert(clean({
        id: mapId(s._id),
        batch_id: mapId(s.batch),
        lecturer_id: mapId(s.lecturer),
        title: s.title,
        topic: s.topic || '',
        week: s.week,
        generated_by: s.generatedBy || 'manual',
        published: s.published || false,
        created_at: toISO(s.createdAt)
      }));
    }
    console.log('  ✓ flashcard_sets');
  }

  // Flashcards
  const flashcards = await db.collection('flashcards').find().toArray();
  if (flashcards.length) {
    console.log(`Migrating ${flashcards.length} flashcards...`);
    for (const f of flashcards) {
      await supabase.from('flashcards').insert(clean({
        id: mapId(f._id),
        set_id: mapId(f.set),
        batch_id: mapId(f.batch),
        question: f.question,
        correct_answer: f.correctAnswer,
        options: f.options || [],
        explanation: f.explanation || '',
        topic: f.topic || '',
        week: f.week,
        order: f.order || 0,
        created_at: toISO(f.createdAt)
      }));
    }
    console.log('  ✓ flashcards');
  }

  // Tasks
  const tasks = await db.collection('tasks').find().toArray();
  if (tasks.length) {
    console.log(`Migrating ${tasks.length} tasks...`);
    for (const t of tasks) {
      const id = mapId(t._id);
      await supabase.from('tasks').insert(clean({
        id,
        title: t.title,
        description: t.description || '',
        project_id: t.project ? mapId(t.project) : null,
        assignee_id: t.assignee ? mapId(t.assignee) : null,
        status: t.status || 'todo',
        priority: t.priority || 'medium',
        due_date: toISO(t.dueDate),
        estimated: t.estimated || 0,
        spent: t.spent || 0,
        created_by: t.createdBy ? mapId(t.createdBy) : null,
        created_at: toISO(t.createdAt),
        updated_at: toISO(t.updatedAt)
      }));
      // Child: task_comments
      if (t.comments && t.comments.length) {
        for (const c of t.comments) {
          await supabase.from('task_comments').insert(clean({
            task_id: id,
            user_id: c.user ? mapId(c.user) : null,
            text: c.text,
            created_at: toISO(c.createdAt)
          }));
        }
      }
      // Junction: task_dependencies (blockedBy)
      if (t.blockedBy && t.blockedBy.length) {
        for (const bId of t.blockedBy) {
          await supabase.from('task_dependencies').insert({
            task_id: id,
            blocked_by_id: mapId(bId)
          });
        }
      }
    }
    console.log('  ✓ tasks + comments + dependencies');
  }

  // Orders
  const orders = await db.collection('orders').find().toArray();
  if (orders.length) {
    console.log(`Migrating ${orders.length} orders...`);
    for (const o of orders) {
      await supabase.from('orders').insert(clean({
        id: mapId(o._id),
        order_id: o.orderId,
        product_id: o.productId ? mapId(o.productId) : null,
        buyer_name: o.buyerName,
        buyer_email: o.buyerEmail,
        amount: o.amount,
        currency: o.currency || 'USD',
        category: o.category,
        status: o.status || 'Pending',
        download_token: o.downloadToken,
        download_expires: toISO(o.downloadExpires),
        created_at: toISO(o.createdAt)
      }));
    }
    console.log('  ✓ orders');
  }

  // Contacts + replies
  const contacts = await db.collection('contacts').find().toArray();
  if (contacts.length) {
    console.log(`Migrating ${contacts.length} contacts...`);
    for (const c of contacts) {
      const id = mapId(c._id);
      await supabase.from('contacts').insert(clean({
        id,
        name: c.name,
        email: c.email,
        service: c.service || '',
        budget: c.budget || '',
        message: c.message || '',
        source: c.source || 'Contact Form',
        status: c.status || 'New',
        created_at: toISO(c.createdAt),
        updated_at: toISO(c.updatedAt)
      }));
      // Child: contact_replies
      if (c.replies && c.replies.length) {
        for (const r of c.replies) {
          await supabase.from('contact_replies').insert(clean({
            contact_id: id,
            body: r.body,
            sent_by: r.sentBy || 'Admin',
            sent_at: toISO(r.sentAt)
          }));
        }
      }
    }
    console.log('  ✓ contacts + replies');
  }

  // Blog Comments
  const blogComments = await db.collection('blogcomments').find().toArray();
  if (blogComments.length) {
    console.log(`Migrating ${blogComments.length} blog comments...`);
    for (const c of blogComments) {
      await supabase.from('blog_comments').insert(clean({
        id: mapId(c._id),
        post_id: mapId(c.post),
        name: c.name,
        email: c.email,
        content: c.content,
        approved: c.approved !== undefined ? c.approved : true,
        token: c.token,
        created_at: toISO(c.createdAt),
        updated_at: toISO(c.updatedAt)
      }));
    }
    console.log('  ✓ blog_comments');
  }

  // Conversations + messages
  const conversations = await db.collection('conversations').find().toArray();
  if (conversations.length) {
    console.log(`Migrating ${conversations.length} conversations...`);
    for (const c of conversations) {
      const id = mapId(c._id);
      await supabase.from('conversations').insert(clean({
        id,
        session_id: c.sessionId,
        mode: c.mode || 'ai',
        status: c.status || 'active',
        agent_id: c.agentId ? mapId(c.agentId) : null,
        agent_name: c.agentName,
        unread_by_agent: c.unreadByAgent || 0,
        visitor_page: c.visitorPage || '/',
        visitor_name: c.visitorName || '',
        visitor_email: c.visitorEmail || '',
        created_at: toISO(c.createdAt),
        updated_at: toISO(c.updatedAt)
      }));
      // Child: conversation_messages
      if (c.messages && c.messages.length) {
        for (const m of c.messages) {
          await supabase.from('conversation_messages').insert(clean({
            conversation_id: id,
            role: m.role,
            content: m.content,
            agent_name: m.agentName,
            timestamp: toISO(m.timestamp)
          }));
        }
      }
    }
    console.log('  ✓ conversations + messages');
  }

  // Check-ins
  const checkins = await db.collection('checkins').find().toArray();
  if (checkins.length) {
    console.log(`Migrating ${checkins.length} check-ins...`);
    for (const c of checkins) {
      await supabase.from('check_ins').insert(clean({
        id: mapId(c._id),
        user_id: mapId(c.user),
        date: c.date,
        yesterday: c.yesterday || '',
        today: c.today || '',
        blockers: c.blockers || '',
        created_at: toISO(c.createdAt),
        updated_at: toISO(c.updatedAt)
      }));
    }
    console.log('  ✓ check_ins');
  }

  // Notifications
  const notifications = await db.collection('notifications').find().toArray();
  if (notifications.length) {
    console.log(`Migrating ${notifications.length} notifications...`);
    for (const n of notifications) {
      await supabase.from('notifications').insert(clean({
        id: mapId(n._id),
        recipient_id: mapId(n.recipient),
        recipient_type: n.recipientType,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link || '',
        read: n.read || false,
        created_at: toISO(n.createdAt)
      }));
    }
    console.log('  ✓ notifications');
  }

  // Flashcard Responses
  const fcResponses = await db.collection('flashcardresponses').find().toArray();
  if (fcResponses.length) {
    console.log(`Migrating ${fcResponses.length} flashcard responses...`);
    for (const r of fcResponses) {
      await supabase.from('flashcard_responses').insert(clean({
        id: mapId(r._id),
        set_id: mapId(r.set),
        flashcard_id: mapId(r.flashcard),
        student_id: mapId(r.student),
        batch_id: mapId(r.batch),
        answer: r.answer,
        is_correct: r.isCorrect,
        attempted_at: toISO(r.attemptedAt)
      }));
    }
    console.log('  ✓ flashcard_responses');
  }

  // Curriculum Entries
  const curriculum = await db.collection('curriculumentries').find().toArray();
  if (curriculum.length) {
    console.log(`Migrating ${curriculum.length} curriculum entries...`);
    for (const c of curriculum) {
      await supabase.from('curriculum_entries').insert(clean({
        id: mapId(c._id),
        batch_id: mapId(c.batch),
        week: c.week,
        day: c.day,
        topic: c.topic,
        subtopics: c.subtopics || [],
        objectives: c.objectives || '',
        resources: c.resources || [],
        created_by: c.createdBy ? mapId(c.createdBy) : null,
        updated_at: toISO(c.updatedAt)
      }));
    }
    console.log('  ✓ curriculum_entries');
  }

  // Reminder Logs
  const remLogs = await db.collection('reminderlogs').find().toArray();
  if (remLogs.length) {
    console.log(`Migrating ${remLogs.length} reminder logs...`);
    for (const l of remLogs) {
      await supabase.from('reminder_logs').insert(clean({
        id: mapId(l._id),
        task_id: l.task ? mapId(l.task) : null,
        task_title: l.taskTitle,
        recipient: l.recipient,
        recipient_name: l.recipientName,
        project: l.project,
        sent_at: toISO(l.sentAt),
        status: l.status || 'sent',
        error: l.error
      }));
    }
    console.log('  ✓ reminder_logs');
  }

  // Affiliate Clicks
  const affClicks = await db.collection('affiliateclicks').find().toArray();
  if (affClicks.length) {
    console.log(`Migrating ${affClicks.length} affiliate clicks...`);
    for (const c of affClicks) {
      await supabase.from('affiliate_clicks').insert(clean({
        id: mapId(c._id),
        link_slug: c.linkSlug,
        post_slug: c.postSlug || '',
        device: c.device || 'desktop',
        country: c.country || '',
        created_at: toISO(c.createdAt),
        updated_at: toISO(c.updatedAt)
      }));
    }
    console.log('  ✓ affiliate_clicks');
  }

  // Payments
  const payments = await db.collection('payments').find().toArray();
  if (payments.length) {
    console.log(`Migrating ${payments.length} payments...`);
    for (const p of payments) {
      await supabase.from('payments').insert(clean({
        id: mapId(p._id),
        student_id: mapId(p.student),
        batch_id: p.batch ? mapId(p.batch) : null,
        category: p.category,
        amount_due: p.amountDue,
        amount_paid: p.amountPaid || 0,
        status: p.status || 'pending',
        due_date: toISO(p.dueDate),
        paid_at: toISO(p.paidAt),
        method: p.method || '',
        reference: p.reference || '',
        notes: p.notes || '',
        recorded_by: p.recordedBy || 'Admin',
        reminder_sent_at: toISO(p.reminderSentAt),
        receipt_number: p.receiptNumber || '',
        receipt_issued_at: toISO(p.receiptIssuedAt),
        created_at: toISO(p.createdAt)
      }));
    }
    console.log('  ✓ payments');
  }

  // Submissions
  const submissions = await db.collection('submissions').find().toArray();
  if (submissions.length) {
    console.log(`Migrating ${submissions.length} submissions...`);
    for (const s of submissions) {
      await supabase.from('submissions').insert(clean({
        id: mapId(s._id),
        assignment_id: mapId(s.assignment),
        student_id: mapId(s.student),
        batch_id: mapId(s.batch),
        content: s.content || '',
        file_url: s.fileUrl || '',
        submitted_at: toISO(s.submittedAt),
        is_late: s.isLate || false,
        score: s.score,
        feedback: s.feedback || '',
        scored_by: s.scoredBy ? mapId(s.scoredBy) : null,
        scored_at: toISO(s.scoredAt)
      }));
    }
    console.log('  ✓ submissions');
  }

  // Attendance
  const attendance = await db.collection('attendances').find().toArray();
  if (attendance.length) {
    console.log(`Migrating ${attendance.length} attendance records...`);
    for (const a of attendance) {
      const id = mapId(a._id);
      await supabase.from('attendance').insert(clean({
        id,
        batch_id: mapId(a.batch),
        week: a.week,
        day: a.day,
        class_date: a.classDate ? new Date(a.classDate).toISOString().split('T')[0] : null,
        topic: a.topic || '',
        session_opened_at: toISO(a.sessionOpenedAt),
        session_closed_at: toISO(a.sessionClosedAt),
        is_open: a.isOpen || false,
        taken_by: a.takenBy ? mapId(a.takenBy) : null,
        notes: a.notes || '',
        created_at: toISO(a.createdAt)
      }));
      // Junction: attendance_students
      if (a.presentStudents && a.presentStudents.length) {
        for (const sid of a.presentStudents) {
          await supabase.from('attendance_students').insert({
            attendance_id: id, student_id: mapId(sid), status: 'present'
          });
        }
      }
      if (a.absentStudents && a.absentStudents.length) {
        for (const sid of a.absentStudents) {
          await supabase.from('attendance_students').insert({
            attendance_id: id, student_id: mapId(sid), status: 'absent'
          });
        }
      }
    }
    console.log('  ✓ attendance + attendance_students');
  }

  console.log('\n✅ Migration complete!');
  console.log(`Total IDs mapped: ${Object.keys(idMap).length}`);
  await client.close();
}

migrate().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
