-- =============================================
-- CRM Database Schema - Initial Migration
-- Multi-tenant architecture with row-level security
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TENANTS & SUBSCRIPTIONS
-- =============================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  phone VARCHAR(20),
  subscription_plan VARCHAR(50) DEFAULT 'free' CHECK (subscription_plan IN ('free', 'basic', 'pro')),
  stripe_customer_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  plan VARCHAR(50) NOT NULL CHECK (plan IN ('free', 'basic', 'pro')),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- First day of the month
  projects_count INT DEFAULT 0,
  clients_count INT DEFAULT 0,
  photos_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, month)
);

-- =============================================
-- CLIENTS
-- =============================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT false
);

CREATE INDEX idx_clients_tenant ON clients(tenant_id);
CREATE INDEX idx_clients_tenant_active ON clients(tenant_id) WHERE is_archived = false;

-- =============================================
-- PROJECTS
-- =============================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'canceled')),
  start_date DATE,
  estimated_completion DATE,
  actual_completion DATE,
  total_amount DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(tenant_id, status);

-- =============================================
-- PHOTOS
-- =============================================

CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  s3_key VARCHAR(500) NOT NULL,
  s3_url TEXT NOT NULL,
  thumbnail_s3_key VARCHAR(500),
  caption TEXT,
  file_size INT, -- in bytes
  uploaded_at TIMESTAMP DEFAULT NOW(),
  auto_shared BOOLEAN DEFAULT true -- Visible in client portal
);

CREATE INDEX idx_photos_project ON photos(project_id);
CREATE INDEX idx_photos_uploaded ON photos(project_id, uploaded_at DESC);

-- =============================================
-- INVOICES
-- =============================================

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'canceled')),
  stripe_payment_intent_id VARCHAR(255),
  due_date DATE,
  paid_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invoices_project ON invoices(project_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- =============================================
-- EXPENSES
-- =============================================

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  category VARCHAR(100), -- e.g., 'materials', 'labor', 'equipment'
  receipt_photo_s3_key VARCHAR(500),
  receipt_photo_url TEXT,
  date DATE NOT NULL,
  client_approved BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_expenses_project ON expenses(project_id);
CREATE INDEX idx_expenses_date ON expenses(project_id, date DESC);

-- =============================================
-- TIME ENTRIES
-- =============================================

CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_minutes INT, -- Calculated field
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP -- For offline sync tracking
);

CREATE INDEX idx_time_entries_project ON time_entries(project_id);
CREATE INDEX idx_time_entries_start ON time_entries(project_id, start_time DESC);

-- =============================================
-- NOTIFICATION QUEUE
-- =============================================

CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'canceled')),
  message_content TEXT NOT NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  twilio_message_sid VARCHAR(100),
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_scheduled ON notification_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_notifications_project ON notification_queue(project_id);

-- =============================================
-- OAUTH PROVIDERS
-- =============================================

CREATE TABLE oauth_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_account_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX idx_oauth_tenant ON oauth_accounts(tenant_id);

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- Create policies for tenant isolation
-- Note: These assume your application sets session variables
-- Example: SET LOCAL app.current_tenant_id = 'uuid-here';

CREATE POLICY tenant_isolation_clients ON clients
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation_projects ON projects
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Photos inherit tenant through project
CREATE POLICY tenant_isolation_photos ON photos
  USING (
    project_id IN (
      SELECT id FROM projects 
      WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
    )
  );

-- Invoices inherit tenant through project
CREATE POLICY tenant_isolation_invoices ON invoices
  USING (
    project_id IN (
      SELECT id FROM projects 
      WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
    )
  );

-- Expenses inherit tenant through project
CREATE POLICY tenant_isolation_expenses ON expenses
  USING (
    project_id IN (
      SELECT id FROM projects 
      WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
    )
  );

-- Time entries inherit tenant through project
CREATE POLICY tenant_isolation_time_entries ON time_entries
  USING (
    project_id IN (
      SELECT id FROM projects 
      WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
    )
  );

-- Notifications inherit tenant through project
CREATE POLICY tenant_isolation_notifications ON notification_queue
  USING (
    project_id IN (
      SELECT id FROM projects 
      WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
    )
  );

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Calculate duration for time entries
CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_time IS NOT NULL THEN
    NEW.duration_minutes = EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_duration BEFORE INSERT OR UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION calculate_time_entry_duration();

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- Project summary with client info
CREATE VIEW project_summary AS
SELECT 
  p.id,
  p.tenant_id,
  p.title,
  p.status,
  p.start_date,
  p.estimated_completion,
  p.total_amount,
  c.name as client_name,
  c.phone as client_phone,
  COUNT(DISTINCT ph.id) as photo_count,
  COUNT(DISTINCT i.id) as invoice_count,
  SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END) as paid_amount,
  SUM(te.duration_minutes) as total_time_minutes
FROM projects p
JOIN clients c ON p.client_id = c.id
LEFT JOIN photos ph ON p.id = ph.project_id
LEFT JOIN invoices i ON p.id = i.project_id
LEFT JOIN time_entries te ON p.id = te.project_id
GROUP BY p.id, c.name, c.phone;

-- Recent activity feed
CREATE VIEW recent_activity AS
SELECT 
  'photo' as activity_type,
  ph.id,
  ph.project_id,
  p.tenant_id,
  ph.uploaded_at as activity_time,
  'Photo uploaded' as description
FROM photos ph
JOIN projects p ON ph.project_id = p.id
UNION ALL
SELECT 
  'invoice' as activity_type,
  i.id,
  i.project_id,
  p.tenant_id,
  i.created_at as activity_time,
  'Invoice created' as description
FROM invoices i
JOIN projects p ON i.project_id = p.id
UNION ALL
SELECT 
  'project' as activity_type,
  pr.id,
  pr.id as project_id,
  pr.tenant_id,
  pr.created_at as activity_time,
  'Project created' as description
FROM projects pr
ORDER BY activity_time DESC;

-- =============================================
-- SEED DATA FOR DEVELOPMENT
-- =============================================

-- Note: Run this only in development
-- INSERT INTO tenants (email, password_hash, company_name, subscription_plan)
-- VALUES ('demo@example.com', '$2b$10$...', 'Demo Handyman Services', 'basic');