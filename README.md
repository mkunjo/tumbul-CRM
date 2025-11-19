# Tumbul CRM  
A modern, multi-tenant CRM built for contractors and handymen — manage clients, projects, invoices, expenses, time tracking, and client communications in one platform.  

---

## 📌 Features  
- **Client & project management**  
- **Invoices, payments, and expenses** (with receipt uploads to S3)  
- **Time tracking with live timers**  
- **Analytics dashboard** with revenue/expense insights  
- **Client portal** (read-only)  
- **Multi-tenant security** with row-level isolation  
- **OAuth login** (Google/Apple) & optional **2FA**  

---

## 🧱 Technology Stack  
**Backend:**  
- Node.js, Express, PostgreSQL (with RLS)  
- Passport.js for authentication  
- AWS S3 for file storage  

**Frontend:**  
- React, Vite, Axios  
- Recharts for data visualization  

**Testing:**  
- Jest + Supertest  

**Architecture:**  
- Multi-tenant, modular services  
- Built-in migration system  

---

## 🚀 Quick Start  

### 📌 Requirements  
- Node.js 14+  
- PostgreSQL 12+  
- AWS account (for S3 uploads)  

---

### 🛠️ Installation  

```bash
git clone https://github.com/mkunjo/tumbul-CRM.git
cd tumbul-CRM
npm install
cp .env.example .env   # Fill in your environment variables

🗄️ Database Setup
createdb crm_db
npm run migrate:up

🧪 Run the App
npm run dev          # Backend (port 3000)
cd frontend
npm install
npm run dev          # Frontend (port 3003)

📁 Project Structure
backend/
  routes/
  services/
  migrations/
  middleware/
frontend/
  src/