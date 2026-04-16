-- ============================================================
-- Goallord Creativity Website — Full PostgreSQL Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Helper: auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- CORE USER TABLES
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'agent')),
  permissions JSONB NOT NULL DEFAULT '{"projects":true,"tasks":true,"checkins":true,"cms":false,"blog":false,"analytics":false,"clients":false,"store":false,"affiliate":false,"settings":false,"applicants":false,"academy":false}',
  avatar TEXT NOT NULL DEFAULT '',
  reset_token TEXT,
  reset_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE applicants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  location TEXT,
  track TEXT CHECK (track IN ('Web Design', 'WordPress', 'Brand Identity', 'Other')),
  experience TEXT,
  schedule TEXT,
  how_found TEXT,
  goal TEXT,
  why TEXT,
  background TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Reviewed', 'Accepted', 'Rejected')),
  notes TEXT NOT NULL DEFAULT '',
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verify_token TEXT,
  email_verify_expires TIMESTAMPTZ,
  application_fee_paid BOOLEAN NOT NULL DEFAULT false,
  application_fee_ref TEXT NOT NULL DEFAULT '',
  pending_payment_plan TEXT NOT NULL DEFAULT '',
  profile_photo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  number INT NOT NULL UNIQUE,
  track TEXT CHECK (track IN ('Web Design', 'WordPress', 'Brand Identity', 'Other')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,
  total_weeks INT NOT NULL DEFAULT 12,
  class_days TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone TEXT,
  track TEXT NOT NULL CHECK (track IN ('Web Design', 'WordPress', 'Brand Identity', 'Other')),
  batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
  profile_picture TEXT NOT NULL DEFAULT '',
  payment_plan TEXT NOT NULL DEFAULT 'monthly' CHECK (payment_plan IN ('monthly', 'full_upfront')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'partially_paid', 'overdue', 'failed', 'fully_paid')),
  application_fee_paid BOOLEAN NOT NULL DEFAULT false,
  total_tuition_months INT NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Graduated')),
  applicant_ref UUID REFERENCES applicants(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reset_token TEXT,
  reset_expires TIMESTAMPTZ
);

CREATE TABLE lecturers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  profile_picture TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  specialization TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reset_token TEXT,
  reset_expires TIMESTAMPTZ
);

-- Junction: Lecturer <-> Batch (many-to-many)
CREATE TABLE lecturer_batches (
  lecturer_id UUID NOT NULL REFERENCES lecturers(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  PRIMARY KEY (lecturer_id, batch_id)
);

-- ============================================================
-- ACADEMY TABLES
-- ============================================================

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  lecturer_id UUID NOT NULL REFERENCES lecturers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  week INT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  deadline TIMESTAMPTZ NOT NULL,
  max_score INT NOT NULL DEFAULT 100,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  file_url TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_late BOOLEAN NOT NULL DEFAULT false,
  score NUMERIC,
  feedback TEXT NOT NULL DEFAULT '',
  scored_by UUID REFERENCES lecturers(id) ON DELETE SET NULL,
  scored_at TIMESTAMPTZ,
  UNIQUE(assignment_id, student_id)
);

CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  week INT NOT NULL,
  day TEXT NOT NULL CHECK (day IN ('Tuesday', 'Wednesday', 'Thursday')),
  class_date DATE NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  session_opened_at TIMESTAMPTZ,
  session_closed_at TIMESTAMPTZ,
  is_open BOOLEAN NOT NULL DEFAULT false,
  taken_by UUID REFERENCES lecturers(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, week, day)
);

-- Junction: Attendance <-> Student (replaces presentStudents[] and absentStudents[])
CREATE TABLE attendance_students (
  attendance_id UUID NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  PRIMARY KEY (attendance_id, student_id)
);
CREATE INDEX idx_attendance_students_student ON attendance_students(student_id);

CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  lecturer_id UUID NOT NULL REFERENCES lecturers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('pdf', 'image', 'url', 'video')),
  file_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  week INT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_materials_batch_week ON materials(batch_id, week);

CREATE TABLE flashcard_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  lecturer_id UUID NOT NULL REFERENCES lecturers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  week INT NOT NULL,
  generated_by TEXT NOT NULL DEFAULT 'manual' CHECK (generated_by IN ('manual', 'ai')),
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE flashcards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  set_id UUID NOT NULL REFERENCES flashcard_sets(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  options TEXT[] NOT NULL DEFAULT '{}',
  explanation TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  week INT,
  "order" INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE flashcard_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  set_id UUID NOT NULL REFERENCES flashcard_sets(id) ON DELETE CASCADE,
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_flashcard_responses_set_student ON flashcard_responses(set_id, student_id);

CREATE TABLE curriculum_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  week INT NOT NULL,
  day TEXT NOT NULL CHECK (day IN ('Tuesday', 'Wednesday', 'Thursday')),
  topic TEXT NOT NULL,
  subtopics TEXT[] NOT NULL DEFAULT '{}',
  objectives TEXT NOT NULL DEFAULT '',
  resources TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES lecturers(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, week, day)
);

-- ============================================================
-- PAYMENT TABLES
-- ============================================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('application_fee', 'tuition_month_1', 'tuition_month_2', 'tuition_month_3', 'full_tuition_payment')),
  amount_due NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partially_paid', 'overdue', 'failed', 'fully_paid')),
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  method TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL DEFAULT 'Admin',
  reminder_sent_at TIMESTAMPTZ,
  receipt_number TEXT NOT NULL DEFAULT '',
  receipt_issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, category)
);

-- ============================================================
-- NOTIFICATION TABLE
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('Student', 'Lecturer', 'Admin')),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_id, read);

-- ============================================================
-- BLOG & CONTENT TABLES
-- ============================================================

CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  cover_image TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  tags TEXT[] NOT NULL DEFAULT '{}',
  author TEXT NOT NULL DEFAULT 'The Goallord Team',
  author_avatar TEXT NOT NULL DEFAULT '',
  read_time TEXT NOT NULL DEFAULT '5 min read',
  featured BOOLEAN NOT NULL DEFAULT false,
  published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  views INT NOT NULL DEFAULT 0,
  has_affiliate BOOLEAN NOT NULL DEFAULT false,
  affiliate_cta JSONB NOT NULL DEFAULT '{"text":"","url":"","label":""}',
  reactions JSONB NOT NULL DEFAULT '{"like":0,"love":0,"fire":0,"clap":0,"think":0}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE blog_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  content TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT true,
  token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_blog_comments_post ON blog_comments(post_id);

CREATE TABLE content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- E-COMMERCE TABLES
-- ============================================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Application Fee', 'Template', 'Plugin', 'Web App', 'Course')),
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'NGN')),
  description TEXT,
  type TEXT NOT NULL DEFAULT '',
  demo_url TEXT NOT NULL DEFAULT '',
  features TEXT[] NOT NULL DEFAULT '{}',
  download_url TEXT NOT NULL DEFAULT '',
  stock INT NOT NULL DEFAULT -1,
  active BOOLEAN NOT NULL DEFAULT true,
  image TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id TEXT UNIQUE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  category TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Paid', 'Pending', 'Refunded')),
  download_token TEXT,
  download_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONTACT & CLIENT TABLES
-- ============================================================

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  service TEXT NOT NULL DEFAULT '',
  budget TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'Contact Form',
  status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Read', 'Replied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Child table for Contact.replies[]
CREATE TABLE contact_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  sent_by TEXT NOT NULL DEFAULT 'Admin',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  service TEXT,
  budget TEXT,
  timeline TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_logos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  image_id TEXT NOT NULL DEFAULT '',
  "order" INT NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  photo TEXT NOT NULL DEFAULT '',
  photo_id TEXT NOT NULL DEFAULT '',
  linkedin TEXT NOT NULL DEFAULT '',
  github TEXT NOT NULL DEFAULT '',
  twitter TEXT NOT NULL DEFAULT '',
  "order" INT NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROJECT MANAGEMENT TABLES
-- ============================================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not-started' CHECK (status IN ('not-started', 'in-progress', 'review', 'completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  deadline TIMESTAMPTZ,
  color TEXT NOT NULL DEFAULT '#D66A1F',
  budget NUMERIC NOT NULL DEFAULT 0,
  spent NUMERIC NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_by ON projects(created_by);

-- Junction: Project <-> User (members)
CREATE TABLE project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'review', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date TIMESTAMPTZ,
  estimated NUMERIC NOT NULL DEFAULT 0,
  spent NUMERIC NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- Child table for Task.comments[]
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Junction: Task <-> Task (blockedBy)
CREATE TABLE task_dependencies (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_by_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, blocked_by_id)
);

CREATE TABLE check_ins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  yesterday TEXT NOT NULL DEFAULT '',
  today TEXT NOT NULL DEFAULT '',
  blockers TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ============================================================
-- CHAT TABLES
-- ============================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'human')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_name TEXT,
  unread_by_agent INT NOT NULL DEFAULT 0,
  visitor_page TEXT NOT NULL DEFAULT '/',
  visitor_name TEXT NOT NULL DEFAULT '',
  visitor_email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Child table for Conversation.messages[]
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'agent')),
  content TEXT NOT NULL,
  agent_name TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_conversation_messages_convo ON conversation_messages(conversation_id);

-- ============================================================
-- AFFILIATE TABLES
-- ============================================================

CREATE TABLE affiliate_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL DEFAULT '',
  total_clicks INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_slug TEXT NOT NULL,
  post_slug TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop' CHECK (device IN ('desktop', 'mobile', 'tablet')),
  country TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_affiliate_clicks_link_slug ON affiliate_clicks(link_slug);

-- ============================================================
-- REMINDER TABLES
-- ============================================================

CREATE TABLE reminder_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  frequency INT NOT NULL DEFAULT 2,
  enabled BOOLEAN NOT NULL DEFAULT true,
  send_time TEXT NOT NULL DEFAULT '08:00'
);

CREATE TABLE reminder_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  task_title TEXT,
  recipient TEXT,
  recipient_name TEXT,
  project TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error TEXT
);
CREATE INDEX idx_reminder_logs_sent_at ON reminder_logs(sent_at DESC);

-- ============================================================
-- ACADEMY SETTINGS (singleton)
-- ============================================================

CREATE TABLE academy_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hero_headline TEXT NOT NULL DEFAULT 'Launch Your Career in Web Design & Development',
  hero_subtext TEXT NOT NULL DEFAULT 'Hands-on, practical training in Onitsha, Nigeria. Learn web design, WordPress development, and digital marketing from real practitioners — not textbooks.',
  tracks JSONB NOT NULL DEFAULT '[]',
  tuition JSONB NOT NULL DEFAULT '{"inPerson":150000,"inPersonInstallment":"3 monthly payments of ₦50,000","online":80000,"onlineNote":"One-time payment","duration":"12 weeks"}',
  schedule JSONB NOT NULL DEFAULT '{"weekday":"Tue / Wed / Thu, 4:00 PM – 7:00 PM","weekend":"Saturday, 10:00 AM – 3:00 PM"}',
  stats JSONB NOT NULL DEFAULT '{"students":50,"jobRate":85,"programWeeks":12,"batchesRun":5}',
  instructors JSONB NOT NULL DEFAULT '[]',
  faqs JSONB NOT NULL DEFAULT '[]',
  next_batch_date TEXT NOT NULL DEFAULT 'Contact us for next batch date',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRIGGERS for updated_at
-- ============================================================

CREATE TRIGGER trg_blog_posts_updated_at BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_blog_comments_updated_at BEFORE UPDATE ON blog_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_client_logos_updated_at BEFORE UPDATE ON client_logos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_team_members_updated_at BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_check_ins_updated_at BEFORE UPDATE ON check_ins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_affiliate_links_updated_at BEFORE UPDATE ON affiliate_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_affiliate_clicks_updated_at BEFORE UPDATE ON affiliate_clicks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_content_updated_at BEFORE UPDATE ON content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_curriculum_entries_updated_at BEFORE UPDATE ON curriculum_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_academy_settings_updated_at BEFORE UPDATE ON academy_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Increment blog post views
CREATE OR REPLACE FUNCTION increment_blog_views(post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE blog_posts SET views = views + 1 WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

-- Increment blog reaction (JSONB field)
CREATE OR REPLACE FUNCTION increment_blog_reaction(p_slug TEXT, p_emoji TEXT)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  UPDATE blog_posts
    SET reactions = jsonb_set(
      reactions,
      ARRAY[p_emoji],
      to_jsonb(COALESCE((reactions->>p_emoji)::int, 0) + 1)
    )
    WHERE slug = p_slug
    RETURNING reactions INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Increment affiliate link click count
CREATE OR REPLACE FUNCTION increment_affiliate_clicks(p_slug TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE affiliate_links SET total_clicks = total_clicks + 1 WHERE slug = p_slug;
END;
$$ LANGUAGE plpgsql;

-- Get flashcard progress for a student
CREATE OR REPLACE FUNCTION get_flashcard_progress(p_student_id UUID)
RETURNS TABLE(set_id UUID, total BIGINT, correct BIGINT) AS $$
BEGIN
  RETURN QUERY
    SELECT fr.set_id, COUNT(*)::BIGINT AS total, SUM(CASE WHEN fr.is_correct THEN 1 ELSE 0 END)::BIGINT AS correct
    FROM flashcard_responses fr
    WHERE fr.student_id = p_student_id
    GROUP BY fr.set_id;
END;
$$ LANGUAGE plpgsql;

-- Get total blog views
CREATE OR REPLACE FUNCTION get_total_blog_views()
RETURNS BIGINT AS $$
DECLARE
  result BIGINT;
BEGIN
  SELECT COALESCE(SUM(views), 0) INTO result FROM blog_posts WHERE published = true;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
