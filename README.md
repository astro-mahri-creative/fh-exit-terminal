# Future Hooman: Exit Terminal

A full-stack interactive web application for the Future Hooman art exhibit. Visitors enter codes discovered throughout the exhibit to see their impact on iFLU case numbers across interconnected universes.

## 🎮 Features

- **User Authentication**: 6-character user IDs with once-per-day usage enforcement
- **Code Entry System**: On-screen keyboard with real-time validation
- **Universe Tracking**: Persistent iFLU case numbers across 10 universes
- **Dynamic Status Visualization**: Universe statuses change based on case thresholds
- **PHAX Alert Messages**: Context-aware narrative feedback
- **Alignment System**: PHAX vs FHEELS impact scoring
- **Email Reports**: Send personalized impact summaries
- **Admin Controls**: User ID generation and system reset
- **Cure Mechanics**: Discoverable cure system that modifies code effects

## 🏗️ Tech Stack

### Frontend
- React 18
- Axios for API calls
- CSS3 with responsive design
- Optimized for 8" tablets

### Backend
- Node.js + Express
- MongoDB with Mongoose
- RESTful API architecture
- Rate limiting and CORS

### Deployment
- Frontend: Netlify
- Backend: Render/Railway (recommended)
- Database: MongoDB Atlas (free tier)

## 📦 Quick Start

### Prerequisites
- Node.js 16+ installed
- MongoDB Atlas account (free tier)
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/fh-exit-terminal.git
cd fh-exit-terminal
```

### 2. Set Up MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Get your connection string
5. Whitelist your IP (or use 0.0.0.0/0 for development)

### 3. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env and add your MongoDB URI
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/exit-terminal

# Initialize database with sample data
npm run init-db

# Start development server
npm run dev
```

Backend will run on `http://localhost:5000`

### 4. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env to point to your backend
# REACT_APP_API_URL=http://localhost:5000/api

# Start development server
npm start
```

Frontend will run on `http://localhost:3000`

## 🚀 Deployment

### Backend Deployment (Render)

1. Go to [Render.com](https://render.com)
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Configure:
   - **Name**: exit-terminal-api
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
6. Add Environment Variable:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
7. Click "Create Web Service"
8. Copy your service URL (e.g., `https://exit-terminal-api.onrender.com`)

### Frontend Deployment (Netlify)

1. Go to [Netlify.com](https://www.netlify.com)
2. Sign up with GitHub
3. Click "Add new site" → "Import an existing project"
4. Connect your GitHub repository
5. Configure:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/build`
6. Add Environment Variable:
   - `REACT_APP_API_URL`: Your Render backend URL + `/api`
   - Example: `https://exit-terminal-api.onrender.com/api`
7. Click "Deploy site"
8. Your site will be live at a Netlify URL

### Custom Domain (Optional)

In Netlify settings, you can add a custom domain for the frontend.

## 🎯 Admin User IDs

After running `npm run init-db`, the following admin user IDs are created:

- `admin1`
- `admin2`
- `admin3`
- `fhadmn`
- `phaxad`

20 random visitor user IDs are also generated. Check the console output after database initialization.

## 🎮 Using the Application

### For Visitors

1. Enter your 6-character user ID on the welcome screen
2. Enter codes discovered in the exhibit using the on-screen keyboard
3. Click "ACTIVATE CODE" after each code
4. When finished, click "FINALIZE TERMINAL CODE ENTRY"
5. View your impact on the universe map
6. Optionally enter email to receive impact report
7. System auto-resets after 30 seconds

### For Admins

1. Log in with an admin user ID
2. Admin controls appear on the code entry screen
3. **Generate User ID**: Creates new visitor user IDs
4. **Reset Universe Statistics**: Resets all data for new phase

## 📊 Database Management

### Reinitialize Database

To reset all data and repopulate with fresh sample data:

```bash
cd backend
npm run init-db
```

This will:
- Clear all existing data
- Create 10 universes with random case numbers
- Create 50+ codes across all tiers
- Generate PHAX alert messages
- Create admin and visitor user IDs
- Set up initial phase

### Backup Database

Use MongoDB Atlas built-in backup features or:

```bash
mongodump --uri="YOUR_MONGODB_URI"
```

## 🔧 Configuration

### Backend Environment Variables

```
MONGODB_URI=mongodb+srv://...          # Required
PORT=5000                               # Optional (default: 5000)
```

### Frontend Environment Variables

```
REACT_APP_API_URL=http://localhost:5000/api  # Required
```

## 🎨 Customization

### Update Universe Names

Edit `backend/scripts/initDatabase.js`:

```javascript
const universeData = [
  { name: 'Your Universe Name', initCases: 45230 },
  // ... add more
];
```

Then run `npm run init-db`

### Update PHAX Messages

Add/edit messages in `backend/scripts/initDatabase.js`:

```javascript
const messagesData = [
  { text: 'Your custom message', trigger: 'condition_name' },
  // ... add more
];
```

### Add Codes

Add codes in `backend/scripts/initDatabase.js`:

```javascript
const codesData = [
  { code: 'ABCD', tier: 1, name: 'Code Name', alignment: 'PHAX' },
  // ... add more
];
```

Then define effects in `codeEffectsData` section.

## 🐛 Troubleshooting

### Backend won't start
- Check MongoDB URI is correct
- Ensure IP is whitelisted in MongoDB Atlas
- Verify Node.js version (16+)

### Frontend can't connect to backend
- Check `REACT_APP_API_URL` in `.env`
- Verify backend is running
- Check for CORS errors in console

### Database initialization fails
- Verify MongoDB connection
- Check for sufficient permissions
- Ensure database is empty or ready to be cleared

### Codes not validating
- Check if codes exist in database
- Run `npm run init-db` to populate sample codes
- Verify `isActive` is true for codes

## 📱 Tablet Optimization

The app is optimized for 8" tablets (1280x800 or 1920x1200):
- Large touch targets (44px minimum)
- On-screen keyboard
- Responsive layout
- No hover-dependent interactions
- Auto-reset functionality

## 🔒 Security Notes

### Production Checklist

- [ ] Change all admin user IDs
- [ ] Enable MongoDB authentication
- [ ] Whitelist specific IPs in MongoDB Atlas
- [ ] Set up rate limiting (already configured)
- [ ] Use HTTPS (automatic with Netlify/Render)
- [ ] Add email service credentials for SendGrid
- [ ] Set up monitoring and logging
- [ ] Regular database backups

## 📈 Analytics

Session data and analytics are logged automatically:
- Session starts
- Code entries
- Code validation errors
- Email sends
- Admin actions

Query analytics via admin endpoint:
```
GET /api/admin/analytics?session_token=ADMIN_SESSION_TOKEN
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

Copyright © 2026 Future Hooman. All rights reserved.

## 🆘 Support

For issues or questions:
- Create a GitHub issue
- Contact: [your-email@example.com]

---

## 📚 API Documentation

### Core Endpoints

**POST /api/session/start**
```json
Request: { "user_id": "abc123" }
Response: { 
  "success": true, 
  "session_token": "sess_...", 
  "is_admin": false 
}
```

**POST /api/codes/validate**
```json
Request: { "session_token": "sess_...", "code": "TECH" }
Response: { 
  "success": true, 
  "valid": true, 
  "code": "TECH",
  "code_tier": 1
}
```

**POST /api/codes/finalize**
```json
Request: { "session_token": "sess_..." }
Response: { 
  "success": true,
  "universes": [...],
  "phax_alert": "...",
  "alignment_narrative": "...",
  "alignment_score": -950
}
```

Full API documentation in `exit-terminal-functional-spec.md`

---

Built with ❤️ for Future Hooman
