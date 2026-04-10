# Future Hooman: Exit Terminal

A full-stack interactive web application for the Future Hooman art exhibit. Visitors enter codes discovered throughout the exhibit to see their impact on iFLU case numbers across interconnected universes.

## Features

- **User Authentication**: 6-character user IDs with once-per-day usage enforcement
- **Choice Screen**: Visitors choose between iFLU CONTAINMENT PROTOCOL or iFLU PROLIFERATION PROTOCOL before entering codes
- **Code Entry System**: On-screen terminal keyboard with real-time validation and activation flash feedback
- **Universe Tracking**: Persistent iFLU case numbers across 10 universes
- **XDIM Topology View**: Animated 3D network visualization of universe interconnections shown on the results screen
- **Dynamic Status Visualization**: Universe statuses change based on case thresholds
- **PHAX Alert Messages**: Context-aware narrative feedback
- **Alignment System**: PHAX vs FHEELS impact scoring
- **Impact Reports**: Personalized session summaries delivered via email (SendGrid)
- **Admin Controls**: User ID generation and system reset
- **Cure Mechanics**: Discoverable cure system that modifies code effects
- **Idle Auto-Reset**: Two-stage idle detection resets the terminal for the next visitor

## Tech Stack

### Frontend
- React 18
- Axios for API calls
- CSS3 with hacker/terminal aesthetic
- Optimized for 8" tablets (1280x800 / 1920x1200)

### Backend
- Node.js + Express
- MongoDB with Mongoose
- RESTful API architecture
- Rate limiting and CORS

### Deployment
- Frontend: Netlify
- Backend: Render
- Database: MongoDB Atlas (free tier)

## Setup

### Prerequisites
- Node.js 16+
- MongoDB Atlas account (free tier)
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/astro-mahri-creative/fh-exit-terminal.git
cd fh-exit-terminal
```

### 2. Set Up MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Get your connection string
5. Whitelist your IP (or use `0.0.0.0/0` for development)

### 3. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your MongoDB URI
npm run init-db   # Initialize database with universes, codes, and user IDs
npm run dev
```

Backend runs on `http://localhost:5000`

### 4. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env: REACT_APP_API_URL=http://localhost:5000/api
npm start
```

Frontend runs on `http://localhost:3000`

## Deployment

### Backend (Render)

1. Create a new Web Service on [Render](https://render.com), connected to this repo
2. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Add environment variable: `MONGODB_URI` (your MongoDB Atlas connection string)

### Frontend (Netlify)

1. Create a new site on [Netlify](https://www.netlify.com), connected to this repo
2. Configure:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/build`
3. Add environment variable: `REACT_APP_API_URL` (your Render backend URL + `/api`)

SPA routing is handled via `netlify.toml` — no additional redirect configuration needed.

## Remaining Setup

### Email / Impact Reports (SendGrid)

The only component not yet configured for production is the email impact report feature. To enable it:

1. Create a [SendGrid](https://sendgrid.com) account and generate an API key
2. Verify a sender email address in SendGrid
3. Add the following environment variables to your Render backend service:
   - `SENDGRID_API_KEY` — your SendGrid API key
   - `SENDGRID_FROM_EMAIL` — your verified sender address

Once set, visitors can enter their email on the results screen to receive a personalized impact summary.

## Admin User IDs

After running `npm run init-db`, the following admin user IDs are created:

- `admin1`, `admin2`, `admin3`, `fhadmn`, `phaxad`

20 random visitor user IDs are also generated — check the console output after initialization.

## Using the Application

### Visitors

1. Enter your 6-character user ID on the welcome screen
2. Choose a protocol: **iFLU CONTAINMENT** or **iFLU PROLIFERATION**
3. Enter codes from the exhibit using the on-screen keyboard
4. Click **TRANSMIT** after each code
5. When finished, click **FINALIZE TERMINAL CODE ENTRY**
6. View your impact on the XDIM Topology View
7. Optionally enter your email to receive an impact report
8. Terminal auto-resets after idle timeout

### Admins

1. Log in with an admin user ID
2. Admin controls appear on the code entry screen
3. **Generate User ID** — creates new visitor IDs
4. **Reset Universe Statistics** — resets all data for a new phase

## Database Management

To reset all data and repopulate:

```bash
cd backend
npm run init-db
```

This clears existing data and creates: 10 universes, 50+ codes across all tiers, PHAX alert messages, admin and visitor user IDs, and an initial phase.

## Configuration

### Backend Environment Variables

```
MONGODB_URI=mongodb+srv://...           # Required
PORT=5000                               # Optional (default: 5000)
SENDGRID_API_KEY=SG....                 # Required for email impact reports
SENDGRID_FROM_EMAIL=you@yourdomain.com  # Required for email impact reports
```

### Frontend Environment Variables

```
REACT_APP_API_URL=http://localhost:5000/api
```

## Troubleshooting

**Backend won't start** — Check MongoDB URI and ensure your IP is whitelisted in Atlas.

**Frontend can't connect** — Verify `REACT_APP_API_URL` and check for CORS errors in the browser console.

**Database init fails** — Verify MongoDB connection and that the database is empty or ready to clear.

**Codes not validating** — Ensure codes exist in the database (`npm run init-db`) and `isActive` is `true`.

**Render cold starts** — The backend includes retry logic for MongoDB connections on Render's free tier. First request after inactivity may be slow.

## Security

Production checklist:
- [ ] Rotate all admin user IDs
- [ ] Whitelist specific IPs in MongoDB Atlas
- [ ] Add SendGrid credentials for email reports
- [ ] Rate limiting is pre-configured
- [ ] HTTPS is automatic via Netlify and Render

## API Reference

**POST /api/session/start**
```json
{ "user_id": "abc123" }
→ { "success": true, "session_token": "sess_...", "is_admin": false }
```

**POST /api/codes/validate**
```json
{ "session_token": "sess_...", "code": "TECH" }
→ { "success": true, "valid": true, "code": "TECH", "code_tier": 1 }
```

**POST /api/codes/finalize**
```json
{ "session_token": "sess_..." }
→ { "success": true, "universes": [...], "phax_alert": "...", "alignment_score": -950 }
```

**GET /api/health**
```json
{ "status": "ok", "message": "Exit Terminal API running", "db_status": "connected" }
```

Full API documentation in `exit-terminal-functional-spec.md`

---

Copyright © 2026 Future Hooman. All rights reserved.
