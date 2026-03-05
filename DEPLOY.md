# Goallord Creativity — Heroku Deployment Guide

## Prerequisites
- Node.js 18+ installed locally
- Git installed
- Heroku CLI installed (`brew install heroku/brew/heroku` on Mac)
- MongoDB Atlas free account: https://cloud.mongodb.com
- Cloudinary free account: https://cloudinary.com

---

## Step 1: MongoDB Atlas Setup
1. Create a free cluster at cloud.mongodb.com
2. Create a database user (Database Access > Add new user)
3. Whitelist all IPs: Network Access > Add IP Address > `0.0.0.0/0`
4. Get your connection string: Clusters > Connect > Connect your application
   - Format: `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/goallord`

---

## Step 2: Cloudinary Setup
1. Sign up at cloudinary.com (free tier)
2. Go to Dashboard and copy:
   - Cloud Name
   - API Key
   - API Secret

---

## Step 3: Local Test (optional but recommended)
```bash
cd /path/to/davies

# Create your .env file
cp .env.example .env
# Edit .env with real values

npm install
npm start
# Visit http://localhost:3000
# Login at http://localhost:3000/login.html
```

---

## Step 4: Heroku Deploy
```bash
# Login
heroku login

# Create app
heroku create goallord-creativity
# (or pick your own name)

# Set environment variables
heroku config:set MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/goallord"
heroku config:set JWT_SECRET="paste-a-long-random-string-here-minimum-32-chars"
heroku config:set ADMIN_EMAIL="admin@goallordcreativity.com"
heroku config:set ADMIN_PASSWORD="YourSecurePassword2026!"
heroku config:set CLOUDINARY_CLOUD_NAME="your-cloud-name"
heroku config:set CLOUDINARY_API_KEY="your-api-key"
heroku config:set CLOUDINARY_API_SECRET="your-api-secret"

# Initialize git if not already
git init
git add .
git commit -m "Initial deployment"

# Deploy
heroku git:remote -a goallord-creativity
git push heroku main

# Open your site
heroku open
```

---

## Step 5: Verify
- **Website:** `https://goallord-creativity.herokuapp.com`
- **Login:** `https://goallord-creativity.herokuapp.com/login.html`
- **Dashboard:** `https://goallord-creativity.herokuapp.com/dashboard.html`
- **API health:** `https://goallord-creativity.herokuapp.com/api/auth/me`

---

## Default Admin Credentials
- **Email:** value of `ADMIN_EMAIL` env var
- **Password:** value of `ADMIN_PASSWORD` env var

The admin user is automatically created on first server start.

---

## Useful Heroku Commands
```bash
heroku logs --tail          # View live logs
heroku ps                   # Check dynos
heroku config               # View all env vars
heroku restart              # Restart app
heroku run node -e "require('./server')"  # Run one-off command
```

---

## Project Structure
```
davies/
├── server.js              # Express entry point
├── middleware/
│   └── auth.js            # JWT auth middleware
├── models/
│   ├── User.js
│   ├── Applicant.js
│   ├── Client.js
│   ├── Product.js
│   ├── Order.js
│   └── Content.js
├── routes/
│   ├── auth.js
│   ├── applicants.js
│   ├── clients.js
│   ├── products.js
│   ├── orders.js
│   ├── content.js
│   └── upload.js
├── dashboard.html          # Admin dashboard (auth-protected)
├── login.html              # Admin login
├── apply.html              # Academy application form
├── contact.html            # Client contact form
├── index.html              # Public website
└── package.json
```
