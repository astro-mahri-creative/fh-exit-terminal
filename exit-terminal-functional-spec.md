# Project Lasagna: Exit Terminal Application
## Functional Specification & Technical Requirements

**Version:** 1.0  
**Date:** March 3, 2026  
**Document Type:** Functional Specification  
**Project:** Future Hooman Interactive Art Exhibit

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Technical Architecture](#technical-architecture)
4. [Database Schema](#database-schema)
5. [User Flows](#user-flows)
6. [Functional Requirements](#functional-requirements)
7. [Code System](#code-system)
8. [Universe Status System](#universe-status-system)
9. [Meta-Game Rules Engine](#meta-game-rules-engine)
10. [PHAX Alert Messages](#phax-alert-messages)
11. [Cure Mechanics](#cure-mechanics)
12. [Admin Functions](#admin-functions)
13. [Email Integration](#email-integration)
14. [UI/UX Specifications](#uiux-specifications)
15. [Analytics & Logging](#analytics--logging)
16. [Security & Access Control](#security--access-control)
17. [Future Extensibility](#future-extensibility)

---

## Executive Summary

The Exit Terminal Application is the culminating interactive experience for visitors of the Future Hooman exhibit. Visitors collect 4-character alphanumeric codes throughout their journey and enter them at this terminal station to see their cumulative impact on the iFLU pandemic across multiple interconnected universes.

**Key Features:**
- Code entry and validation system
- Persistent multi-universe iFLU tracking across all visitors
- Dynamic status visualization for 10 universes
- PHAX-themed narrative feedback system
- User ID authentication (once per day per user)
- Email report generation
- Admin controls for system management
- Meta-game rule engine for conditional code effects
- Cure discovery and activation mechanics

**Hardware:** 8" Android tablet (input interface) + separate display screen (universe status dashboard)

---

## System Overview

### Application Purpose
The Exit Terminal serves as both a data collection point and a reveal mechanism, showing visitors how their discovered codes have influenced the iFLU pandemic narrative across interconnected universes.

### Core Mechanics
1. Visitors receive a unique 6-character user ID upon entry
2. Visitors enter codes discovered throughout the exhibit
3. Each code affects iFLU case numbers across one or more universes
4. Universe statuses change based on case thresholds (ACTIVE, OPTIMIZED, COMPROMISED, QUARANTINED, LIBERATED, TRANSCENDENT)
5. System displays aggregate impact with PHAX-themed narrative messaging
6. All visitor interactions affect persistent universe data visible to all subsequent visitors

### Persistent vs. Session Data
- **Persistent (across all users):** Universe case numbers, universe statuses, cure discovery status, phase data
- **Session-specific:** Individual visitor's entered codes, impact calculation, alignment narrative
- **Daily reset:** User ID usage tracking

---

## Technical Architecture

### Technology Stack
**Frontend:**
- HTML5/CSS3/JavaScript (ES6+)
- React.js (recommended for state management)
- Responsive design optimized for 8" tablet (1280x800 or 1920x1200 resolution)

**Backend:**
- Node.js with Express.js OR Python with Flask/FastAPI
- RESTful API architecture
- Real-time database synchronization

**Database:**
- PostgreSQL OR MongoDB (recommended for flexibility)
- Must support concurrent access from multiple tablet instances
- Real-time sync for universe data updates

**Email Service:**
- SendGrid OR AWS SES integration
- Template-based email generation

**Deployment:**
- Local network server (exhibit-internal)
- Optional cloud backup for analytics
- Docker containerization recommended

### API Endpoints

```
POST   /api/session/start          - Create new session with user ID
GET    /api/universes              - Get all universe data
POST   /api/codes/validate         - Validate and activate a code
POST   /api/codes/finalize         - Process all codes and calculate impact
POST   /api/email/send             - Send impact report email
GET    /api/messages/alerts        - Get PHAX alert messages
POST   /api/admin/generate-userid  - Generate new user ID (admin only)
POST   /api/admin/reset-universes  - Reset universe statistics (admin only)
GET    /api/admin/analytics        - Get system analytics (admin only)
POST   /api/admin/login            - Admin authentication
```

---

## Database Schema

### Table: universes

```sql
CREATE TABLE universes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL,
    initialization_cases INTEGER NOT NULL,
    current_cases INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,
    can_spread BOOLEAN DEFAULT true,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Initial Values:**
- 10 universes with placeholder names (e.g., "Universe Alpha", "Universe Beta", etc.)
- Random initialization_cases between 100 and 300,000
- current_cases initially equals initialization_cases
- status starts as "ACTIVE"

### Table: universe_status_thresholds

```sql
CREATE TABLE universe_status_thresholds (
    id SERIAL PRIMARY KEY,
    status_name VARCHAR(50) NOT NULL UNIQUE,
    min_cases INTEGER,
    max_cases INTEGER,
    can_spread BOOLEAN DEFAULT true,
    description TEXT,
    color_primary VARCHAR(50),
    color_secondary VARCHAR(50)
);
```

**Initial Status Definitions:**

| status_name | min_cases | max_cases | can_spread | description | color_primary | color_secondary |
|-------------|-----------|-----------|------------|-------------|---------------|-----------------|
| OPTIMIZED | 0 | 500 | false | PHAX success - tech advancement hub | chrome | electric-blue |
| ACTIVE | 1000 | 75000 | true | Standard operational state | neutral-gray | white |
| COMPROMISED | 90000 | 149999 | true | FHEELS infiltration | amber | organic-green |
| QUARANTINED | null | null | false | Emergency unstable state | red | containment-barrier |
| LIBERATED | 150000 | null | false | FHEELS victory - disconnected from PHAX | earth-tone | organic-gold |
| TRANSCENDENT | null | null | special | Perfect balance despite conflict | harmonic-shift | nature-tech-blend |

**Note:** QUARANTINED is triggered by rapid fluctuations, not just case numbers. TRANSCENDENT has special conditions.

### Table: codes

```sql
CREATE TABLE codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(4) NOT NULL UNIQUE,
    tier INTEGER NOT NULL,
    name VARCHAR(100),
    description TEXT,
    alignment VARCHAR(20) NOT NULL, -- 'PHAX' or 'FHEELS'
    is_cure_code BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Tier Definitions:**
- Tier 1: Standard PHAX Protocol Codes (obvious/visible)
- Tier 2: Hidden FHEELS Infiltration Codes (disguised/concealed)
- Tier 3: PHAX Security Protocols (requires basic puzzle solving)
- Tier 4: FHEELS Hacking Operations (complex hidden sequences)
- Tier 5: Ultimate System Exploits (master-level discovery)
- Tier 6: Network Liberation (ultimate FHEELS victory)

### Table: code_effects

```sql
CREATE TABLE code_effects (
    id SERIAL PRIMARY KEY,
    code_id INTEGER REFERENCES codes(id) ON DELETE CASCADE,
    universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
    effect_value INTEGER NOT NULL, -- negative = reduce cases, positive = increase cases
    effect_type VARCHAR(50) DEFAULT 'standard', -- 'standard', 'conditional', 'cure-enhanced'
    condition_rule TEXT, -- JSON string defining conditional logic
    is_post_cure BOOLEAN DEFAULT false, -- true if effect only applies after cure discovered
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(code_id, universe_id, effect_type)
);
```

**Effect Value Convention:**
- Negative numbers: PHAX technology (reduces iFLU cases)
- Positive numbers: FHEELS nature alignment (increases iFLU cases)

### Table: sessions

```sql
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(6) NOT NULL,
    session_token VARCHAR(100) UNIQUE NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finalized_at TIMESTAMP,
    total_codes_entered INTEGER DEFAULT 0,
    alignment_score INTEGER DEFAULT 0, -- negative = PHAX, positive = FHEELS
    email_address VARCHAR(255),
    email_sent BOOLEAN DEFAULT false,
    is_complete BOOLEAN DEFAULT false
);
```

### Table: session_codes

```sql
CREATE TABLE session_codes (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    code_id INTEGER REFERENCES codes(id),
    entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sequence_order INTEGER NOT NULL
);
```

### Table: user_ids

```sql
CREATE TABLE user_ids (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(6) NOT NULL UNIQUE,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_date DATE,
    usage_count INTEGER DEFAULT 0
);
```

### Table: phases

```sql
CREATE TABLE phases (
    id SERIAL PRIMARY KEY,
    phase_number INTEGER NOT NULL,
    phase_name VARCHAR(100),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    phase_length_hours INTEGER, -- nullable, for reference
    is_active BOOLEAN DEFAULT true,
    narrative_description TEXT
);
```

### Table: meta_game_rules

```sql
CREATE TABLE meta_game_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) NOT NULL,
    condition_type VARCHAR(50) NOT NULL, -- 'universe_status', 'code_combination', 'case_threshold', 'phase_specific'
    condition_definition TEXT NOT NULL, -- JSON string
    effect_definition TEXT NOT NULL, -- JSON string describing effect
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0, -- higher priority rules evaluated first
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Example Meta-Game Rule:**
```json
{
  "rule_name": "Compromised Universe Double Impact",
  "condition_type": "universe_status",
  "condition_definition": {
    "universe_status": "COMPROMISED",
    "affected_universe": "any"
  },
  "effect_definition": {
    "multiplier": 2.0,
    "applies_to": "code_tier",
    "code_tiers": [4, 5]
  }
}
```

### Table: phax_alert_messages

```sql
CREATE TABLE phax_alert_messages (
    id SERIAL PRIMARY KEY,
    message_text TEXT NOT NULL,
    trigger_condition VARCHAR(50) NOT NULL, -- 'optimized_majority', 'compromised_any', 'liberated_any', 'high_spread', 'low_spread', 'balanced', etc.
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Message should include 20+ variations covering:**
- Multiple universes OPTIMIZED
- Any universe COMPROMISED or LIBERATED
- High overall iFLU spread
- Low overall iFLU spread
- Balanced states
- Cure discovered
- Rapid fluctuations
- Phase-specific messages

### Table: cure_status

```sql
CREATE TABLE cure_status (
    id SERIAL PRIMARY KEY,
    is_discovered BOOLEAN DEFAULT false,
    discovered_at TIMESTAMP,
    discovered_by_session_id INTEGER REFERENCES sessions(id),
    cure_trigger_type VARCHAR(50), -- 'code', 'condition', 'admin'
    phase_id INTEGER REFERENCES phases(id)
);
```

### Table: analytics_log

```sql
CREATE TABLE analytics_log (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'session_start', 'code_entered', 'session_finalized', 'email_sent', 'admin_action'
    session_id INTEGER REFERENCES sessions(id),
    user_id VARCHAR(6),
    event_data TEXT, -- JSON string with additional details
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## User Flows

### Primary User Flow: Code Entry & Impact Reveal

```
1. WELCOME SCREEN
   ↓
2. USER ID ENTRY
   - Input 6-character alphanumeric (lowercase)
   - Validation: Check if used today
   - If admin ID: Show admin buttons
   ↓
3. CODE ENTRY INTERFACE
   - On-screen keyboard displayed
   - Input 4-character code
   - Validate code exists in database
   ↓
4. CODE ACTIVATION
   - Valid code: Show "TERMINAL CODE ACTIVATED" with quick animation
   - Code appears in activated codes list
   - Invalid code: Show error message
   - Duplicate code: Show error message
   ↓
5. REPEAT STEP 3-4 (no limit on number of codes)
   ↓
6. FINALIZE BUTTON
   - User clicks "FINALIZE TERMINAL CODE ENTRY"
   - If no codes entered: Show error message
   ↓
7. IMPACT CALCULATION
   - Process all codes against current universe states
   - Apply meta-game rules
   - Apply cure-enhanced effects if cure is active
   - Update universe case numbers (persistent)
   - Recalculate universe statuses
   ↓
8. RESULTS SCREEN
   - Display interactive universe map
   - Show each universe: name, case count, status
   - Show status icons/colors
   - Display PHAX alert message (dynamic based on results)
   - Show user's alignment narrative
   ↓
9. EMAIL OPTION
   - Input field for email address
   - "Send Impact Report" button
   - OR "Return to Home" button
   ↓
10. AUTO-RESET
    - After 30 seconds of inactivity, return to welcome screen
    - Session data stored but interface resets
```

### Admin Flow: Generate User ID

```
1. Admin logs in with admin user ID
   ↓
2. Admin buttons appear on interface
   ↓
3. Admin clicks "Generate User ID"
   ↓
4. System generates random 6-character alphanumeric (lowercase)
   ↓
5. Display user ID on screen
   ↓
6. Admin can copy/print/manually distribute
```

### Admin Flow: Reset Universe Statistics

```
1. Admin logs in with admin user ID
   ↓
2. Admin clicks "Reset Universe Statistics"
   ↓
3. Confirmation dialog appears
   ↓
4. If confirmed:
   - All universe.current_cases → reset to initialization_cases
   - All universe statuses recalculated
   - cure_status.is_discovered → false
   - Current phase ended, new phase started
   ↓
5. Success message displayed
```

---

## Functional Requirements

### FR-1: User ID Authentication

**Description:** System must validate user IDs and enforce once-per-day usage.

**Requirements:**
- Accept 6-character alphanumeric input (lowercase only)
- Check if user ID exists in database
- Check if user ID was used today (compare current date with last_used_date)
- If used today: Display error message "USER ID ALREADY USED TODAY"
- If valid: Create new session and proceed
- Update last_used_date and increment usage_count
- Admin IDs bypass usage restrictions

**Error Handling:**
- Invalid user ID format: "INVALID USER ID FORMAT"
- User ID not found: "USER ID NOT RECOGNIZED"
- Already used today: "USER ID ALREADY USED TODAY"

### FR-2: Code Entry & Validation

**Description:** Accept and validate 4-character codes entered via on-screen keyboard.

**Requirements:**
- Display on-screen keyboard (alphanumeric, optimized for tablet)
- Accept exactly 4 characters per code
- Convert input to uppercase for validation
- Check if code exists in codes table with is_active = true
- Check if code already entered in current session
- Valid code: Display "TERMINAL CODE ACTIVATED" with 1-2 second animation
- Add code to visual list of activated codes
- Invalid code: Display error "INVALID CODE"
- Duplicate code: Display error "CODE ALREADY ENTERED"
- No character limit on total codes entered per session

**UI Elements:**
- Input field showing current typed characters (4-char max)
- Submit button for each code
- Visual list showing all activated codes
- Clear visual separation between keyboard, input, and activated list

### FR-3: Code Finalization & Impact Calculation

**Description:** Process all entered codes and calculate aggregate impact on all universes.

**Requirements:**
- Button labeled "FINALIZE TERMINAL CODE ENTRY" (disabled if no codes entered)
- When clicked:
  1. Validate at least one code has been entered
  2. Lock code entry (cannot add more codes)
  3. Retrieve all code_effects for entered codes
  4. Apply meta-game rules to determine actual effects
  5. Check if cure is active; if yes, apply cure-enhanced effects
  6. Calculate net change for each universe
  7. Update universes.current_cases (add/subtract based on effects)
  8. Ensure current_cases cannot go below 0
  9. Recalculate universe.status based on new current_cases
  10. Store session impact data
  11. Navigate to results screen

**Calculation Logic:**
```
FOR each entered_code:
    FOR each code_effect linked to code:
        base_effect = code_effect.effect_value
        
        IF meta_game_rules apply:
            modified_effect = base_effect * rule.multiplier
        ELSE:
            modified_effect = base_effect
        
        IF cure_is_active AND code_effect.is_post_cure:
            apply cure-enhanced effect
        
        universe.current_cases += modified_effect
        
    universe.current_cases = MAX(0, universe.current_cases)
    
UPDATE universe.status based on thresholds
```

### FR-4: Universe Status Calculation

**Description:** Automatically determine universe status based on case thresholds and special conditions.

**Requirements:**
- After any case number change, recalculate status for affected universes
- Check thresholds in priority order
- Match current_cases against universe_status_thresholds
- Update universe.status and universe.can_spread accordingly

**Status Logic:**
```
IF current_cases <= 500:
    status = OPTIMIZED
    can_spread = false
ELSE IF current_cases >= 1000 AND current_cases <= 75000:
    status = ACTIVE
    can_spread = true
ELSE IF current_cases >= 90000 AND current_cases < 150000:
    status = COMPROMISED
    can_spread = true
ELSE IF current_cases >= 150000:
    status = LIBERATED
    can_spread = false
ELSE IF rapid_fluctuation_detected:
    status = QUARANTINED
    can_spread = false
ELSE:
    status = ACTIVE (default)
```

**Special Cases:**
- QUARANTINED: Triggered by admin flag or rapid case changes (>50% change in <5 minutes)
- TRANSCENDENT: Triggered only by special code combination or admin action

### FR-5: Universe Map Visualization

**Description:** Display interactive map showing all universe statuses and connections.

**Requirements:**
- Graphical representation of 10 universes
- Visual connections between universes showing relationships
- Each universe displays:
  - Universe name
  - Current iFLU case count (formatted with commas)
  - Status badge/icon
  - Status-appropriate color coding
- Use color scheme from universe_status_thresholds table
- Update in real-time as changes occur
- Responsive layout for 8" tablet display
- Clear visual hierarchy

**Visual States:**
- OPTIMIZED: Chrome/silver with electric blue accents
- ACTIVE: Neutral gray/white
- COMPROMISED: Amber/orange with green accents
- QUARANTINED: Red with warning indicators
- LIBERATED: Earth tones with golden glow
- TRANSCENDENT: Animated gradient/shifting colors

### FR-6: PHAX Alert Message System

**Description:** Display context-aware narrative messages from PHAX perspective.

**Requirements:**
- Evaluate current universe states after finalization
- Select appropriate message from phax_alert_messages table
- Match message trigger_condition to current state
- Display message prominently on results screen
- Messages should reflect PHAX's displeasure with increasing iFLU or satisfaction with containment

**Message Selection Priority:**
1. Check for critical states (any LIBERATED or QUARANTINED)
2. Check for positive states (multiple OPTIMIZED)
3. Check for warning states (any COMPROMISED)
4. Check for overall trend (increasing vs decreasing total cases)
5. Select highest priority matching message

**Example Trigger Conditions:**
- "liberated_any": Any universe reaches LIBERATED status
- "optimized_majority": >50% of universes are OPTIMIZED
- "compromised_increasing": COMPROMISED universes have increased
- "cure_active": Cure has been discovered
- "high_spread": Total cases across all universes >500,000

### FR-7: Alignment Narrative Generation

**Description:** Provide personalized narrative summary of user's impact and alignment.

**Requirements:**
- Calculate alignment_score for session
- alignment_score = SUM of all code effects (considering sign)
- Negative score = PHAX alignment (decreased cases)
- Positive score = FHEELS alignment (increased cases)
- Generate narrative text based on alignment and magnitude

**Alignment Tiers:**
```
Strong PHAX: score < -5000
Moderate PHAX: -5000 <= score < -1000
Slight PHAX: -1000 <= score < 0
Neutral: score = 0
Slight FHEELS: 0 < score <= 1000
Moderate FHEELS: 1000 < score <= 5000
Strong FHEELS: score > 5000
```

**Narrative Templates:**
- Each tier has 3-5 narrative variations
- Narratives reference specific codes or universe states when relevant
- Keep narratives brief (2-3 sentences max)
- Maintain mysterious tone about underlying mechanics

**Example Narratives:**
- Strong PHAX: "Your terminal codes have significantly reinforced PHAX containment protocols. Multiple dimensions show marked improvement in iFLU suppression. The system commends your contribution to stability."
- Strong FHEELS: "Warning: Your code sequence has severely compromised containment integrity. iFLU proliferation has accelerated across multiple dimensions. PHAX security protocols are under review."

### FR-8: Email Report Generation

**Description:** Send personalized impact report to user's email address.

**Requirements:**
- Email input field on results screen
- Validate email format
- Button labeled "Send Impact Report"
- Generate HTML email template containing:
  - User's alignment narrative
  - Brief list of entered codes (not effects)
  - Universe map snapshot (static image or styled HTML)
  - Project Lasagna branding
  - Future Hooman contact/info
- Send via email service integration (SendGrid/AWS SES)
- Mark email as sent in session record
- Display confirmation message on success
- Handle errors gracefully

**Email Template Structure:**
```html
Subject: Your Future Hooman Impact Report

Body:
- Header: Project Lasagna logo
- Personalized greeting
- Alignment narrative
- "Your Terminal Codes: [CODE1] [CODE2] [CODE3]..."
- Universe impact summary (high-level)
- Call to action: Visit again, share experience
- Footer: Future Hooman contact info
```

### FR-9: Meta-Game Rules Engine

**Description:** Apply conditional logic that modifies code effects based on universe states or code combinations.

**Requirements:**
- Evaluate all active meta_game_rules before applying code effects
- Support multiple condition types:
  - **universe_status**: Rule applies when specific universe(s) have certain status
  - **code_combination**: Rule applies when multiple specific codes entered in session
  - **case_threshold**: Rule applies when total cases across all universes meets threshold
  - **phase_specific**: Rule applies only during certain phases
- Apply effects in priority order (highest priority first)
- Effects can include:
  - Multipliers (e.g., 2x effect for certain codes)
  - Additional universe impacts
  - Status overrides
  - Unlocking special codes

**Example Rules:**

```json
// Rule 1: Double impact for Tier 4-5 codes when any universe is COMPROMISED
{
  "rule_name": "Compromised Amplification",
  "condition_type": "universe_status",
  "condition_definition": {
    "any_universe_status": "COMPROMISED"
  },
  "effect_definition": {
    "multiplier": 2.0,
    "applies_to": "code_tiers",
    "tiers": [4, 5]
  }
}

// Rule 2: Special effect when specific code combination entered
{
  "rule_name": "Synergy Protocol",
  "condition_type": "code_combination",
  "condition_definition": {
    "required_codes": ["TECH", "PHMX", "CLRN"]
  },
  "effect_definition": {
    "bonus_effect": {
      "universe": "all",
      "value": -500
    }
  }
}

// Rule 3: Phase-specific cure activation
{
  "rule_name": "Phase 2 Cure Unlock",
  "condition_type": "phase_specific",
  "condition_definition": {
    "phase_number": 2,
    "total_cases_below": 100000
  },
  "effect_definition": {
    "trigger_cure": true
  }
}
```

### FR-10: Cure Discovery & Activation

**Description:** Special system state that unlocks cure-related effects and modifies code behavior.

**Requirements:**
- Cure can be triggered by:
  1. Entering specific cure code(s)
  2. Meeting meta-game rule conditions
  3. Admin manual activation
- Once cure is discovered:
  - Update cure_status.is_discovered = true
  - Record discovery details (session, timestamp, trigger)
  - Enable cure-enhanced effects for relevant codes
  - Update PHAX alert messages to reference cure
  - Persist across all sessions until system reset
- Cure-enhanced effects:
  - Some codes that previously only reduced spread now reduce actual cases
  - New codes may become active
  - Healing effects applied based on code_effects.is_post_cure flag

**Cure Logic:**
```
IF cure_code_entered OR cure_condition_met:
    cure_status.is_discovered = true
    cure_status.discovered_at = NOW()
    cure_status.discovered_by_session_id = current_session.id
    
    FOR each code_effect WHERE is_post_cure = true:
        IF code_effect.code_id IN current_session.codes:
            Apply enhanced healing effect
            universe.current_cases -= additional_healing_value
```

### FR-11: Session Timeout & Reset

**Description:** Automatically return to welcome screen after period of inactivity.

**Requirements:**
- Start 30-second countdown timer when results screen is displayed
- Reset timer on any user interaction
- At 30 seconds:
  - Save session as complete
  - Clear all session data from UI
  - Return to welcome screen
  - Ready for next user
- User can manually return to home via "Return to Home" button

---

## Code System

### Code Structure

**Format:** Exactly 4 characters, alphanumeric, uppercase (A-Z, 0-9)

**Examples:** PHMX, TECH, FHGD, ROQY, CLRN, NTPG, LWME, BKDR, BHLE, NIIX, LBRT

### Code Tiers

Each code belongs to one of six tiers representing discovery difficulty:

**Tier 1: Standard PHAX Protocol Codes**
- Obvious/visible in exhibit
- Typically PHAX-aligned (reduce iFLU)
- Effects: -100 to -400 per universe
- Example codes: PHMX, TECH

**Tier 2: Hidden FHEELS Infiltration Codes**
- Disguised/concealed in exhibit
- Typically FHEELS-aligned (increase iFLU)
- Effects: +100 to +300 per universe
- Example codes: FHGD, ROQY

**Tier 3: PHAX Security Protocols**
- Requires basic puzzle solving
- Strong PHAX effects across multiple universes
- Effects: -200 to -800 per universe, may affect 2-3 universes
- Example codes: CLRN, NTPG

**Tier 4: FHEELS Hacking Operations**
- Complex hidden sequences
- Significant FHEELS disruption
- Effects: +200 to +500 per universe, may affect multiple universes
- Example codes: LWME, BKDR

**Tier 5: Ultimate System Exploits**
- Master-level discovery
- Dramatic universe-altering effects
- Effects: +/-1000 to +/-5000, creates new dimensions or major changes
- Example codes: BHLE, NIIX

**Tier 6: Network Liberation**
- Ultimate FHEELS victory codes
- Massive multi-dimensional impact
- Effects: +5000 to +10000 total across all universes
- Example codes: LBRT

### Code Effects Database Population

**Initial Setup:**
- Create minimum 50 codes across all tiers
- Distribution suggestion:
  - Tier 1: 15 codes (30%)
  - Tier 2: 12 codes (24%)
  - Tier 3: 10 codes (20%)
  - Tier 4: 8 codes (16%)
  - Tier 5: 4 codes (8%)
  - Tier 6: 1 code (2%)

- Each code should have 1-5 universe effects
- Higher tier codes typically affect more universes
- Ensure balance between PHAX and FHEELS alignment

**Code Effect Pattern Examples:**

```
Code: PHMX (Tier 1, PHAX)
- Universe 1 (D3N.74L): -400
- Universe 2 (Epsilon): -200

Code: FHGD (Tier 2, FHEELS)
- Universe 3: +150
- Universe 4: +100

Code: CLRN (Tier 3, PHAX)
- Universe 1: -300
- Universe 2: -250
- Universe 3: -250

Code: BKDR (Tier 4, FHEELS)
- Universe 5: +800
- Universe 6: +900
- Universe 7: +800

Code: LBRT (Tier 6, FHEELS)
- All universes: +1000 (10 universes × 1000 = +10000 total)
```

---

## Universe Status System

### Status Types & Behaviors

#### OPTIMIZED
- **Case Range:** 0 - 500
- **can_spread:** false (containment achieved)
- **Visual:** Chrome/silver with electric blue highlights
- **Description:** PHAX success state - universe becomes a tech advancement hub
- **PHAX Message Tone:** Highly positive, commendation

#### ACTIVE
- **Case Range:** 1,000 - 75,000
- **can_spread:** true (standard operation)
- **Visual:** Neutral gray/white
- **Description:** Standard operational state with monitored iFLU levels
- **PHAX Message Tone:** Neutral, status quo

#### COMPROMISED
- **Case Range:** 90,000 - 149,999
- **can_spread:** true (rapid spread)
- **Visual:** Amber/orange with organic green patterns
- **Description:** FHEELS infiltration - warning state
- **PHAX Message Tone:** Concerned, warning

#### QUARANTINED
- **Trigger:** Rapid fluctuations or admin flag (not case-based)
- **can_spread:** false (emergency containment)
- **Visual:** Red with containment barriers
- **Description:** Emergency unstable state requiring isolation
- **PHAX Message Tone:** Emergency alert, critical response

#### LIBERATED
- **Case Range:** 150,000+
- **can_spread:** false (disconnected from PHAX)
- **Visual:** Earth tones with organic golden glow
- **Description:** FHEELS victory - universe disconnected from PHAX network
- **PHAX Message Tone:** Distressed, system failure

#### TRANSCENDENT
- **Trigger:** Special code combination or perfect balance
- **can_spread:** special condition
- **Visual:** Shifting harmony between tech and nature colors
- **Description:** Theoretical ideal - perfect balance despite conflict
- **PHAX Message Tone:** Confused, uncertain

### Status Transitions

Status changes occur automatically when case numbers cross thresholds:

```
OPTIMIZED → ACTIVE: cases increase above 1,000
ACTIVE → COMPROMISED: cases increase above 90,000
COMPROMISED → LIBERATED: cases increase above 150,000
LIBERATED → COMPROMISED: cases decrease below 150,000
COMPROMISED → ACTIVE: cases decrease below 90,000
ACTIVE → OPTIMIZED: cases decrease below 500

Special:
Any → QUARANTINED: rapid fluctuation detected or admin flag
QUARANTINED → [previous state]: admin intervention or stability restored
Any → TRANSCENDENT: special condition met
```

### Spread Mechanics

When `can_spread = true`, iFLU cases can increase naturally over time (optional future feature):
- ACTIVE: Slow natural spread (+0.5% per hour)
- COMPROMISED: Rapid natural spread (+2% per hour)

When `can_spread = false`, cases only change via code entry:
- OPTIMIZED: Containment prevents spread
- QUARANTINED: Emergency isolation prevents spread
- LIBERATED: Disconnected from PHAX network (different dynamics)

---

## Meta-Game Rules Engine

### Rule System Architecture

The meta-game rules engine allows for dynamic, conditional modifications to code effects based on current game state. This creates emergent gameplay and narrative complexity.

### Rule Types

#### 1. Universe Status Rules
Trigger when one or more universes have specific status.

**Example:**
```json
{
  "rule_name": "Compromised Amplification",
  "condition_type": "universe_status",
  "condition_definition": {
    "required_status": "COMPROMISED",
    "universe_count": "any",
    "universe_ids": null
  },
  "effect_definition": {
    "type": "multiplier",
    "multiplier": 2.0,
    "applies_to_tiers": [4, 5],
    "applies_to_alignment": "FHEELS"
  },
  "priority": 10
}
```

#### 2. Code Combination Rules
Trigger when specific codes are entered together in same session.

**Example:**
```json
{
  "rule_name": "PHAX Synergy Protocol",
  "condition_type": "code_combination",
  "condition_definition": {
    "required_codes": ["TECH", "PHMX", "CLRN"],
    "all_required": true
  },
  "effect_definition": {
    "type": "bonus_effect",
    "target": "all_universes",
    "bonus_value": -500,
    "message": "SYNERGY PROTOCOL ACTIVATED"
  },
  "priority": 8
}
```

#### 3. Case Threshold Rules
Trigger when total iFLU cases meet certain conditions.

**Example:**
```json
{
  "rule_name": "Critical Mass Liberation",
  "condition_type": "case_threshold",
  "condition_definition": {
    "total_cases_above": 500000,
    "liberated_universes_min": 2
  },
  "effect_definition": {
    "type": "status_change",
    "target_universe_status": "ACTIVE",
    "new_status": "COMPROMISED",
    "message": "CRITICAL MASS REACHED - WIDESPREAD LIBERATION"
  },
  "priority": 9
}
```

#### 4. Phase-Specific Rules
Trigger only during certain phases.

**Example:**
```json
{
  "rule_name": "Phase 2 Cure Discovery",
  "condition_type": "phase_specific",
  "condition_definition": {
    "phase_number": 2,
    "optimized_universes_min": 5
  },
  "effect_definition": {
    "type": "cure_activation",
    "cure_trigger": true,
    "message": "CURE PROTOCOL DISCOVERED"
  },
  "priority": 15
}
```

### Rule Evaluation Process

```
WHEN session is finalized:
    1. Load all active meta_game_rules
    2. Sort by priority (descending)
    3. FOR each rule in priority order:
        a. Evaluate condition_definition against current state
        b. IF condition is TRUE:
            - Apply effect_definition
            - Log rule activation
            - Store rule ID in session record
            - Continue to next rule (rules are not exclusive)
    4. Calculate final code effects with all rule modifications
    5. Update universe states
```

### Rule Effect Types

- **multiplier:** Multiply code effects by factor
- **bonus_effect:** Add additional effect to universes
- **status_change:** Force universe status change
- **cure_activation:** Trigger cure discovery
- **code_unlock:** Activate previously inactive codes
- **message_override:** Display special message instead of standard PHAX alert

---

## PHAX Alert Messages

### Message System

PHAX alert messages provide narrative feedback from the PHAX organization's perspective, reacting to the current state of the universe network.

### Message Categories

#### Category 1: Optimized States (Positive for PHAX)
Trigger when multiple universes are OPTIMIZED or total cases are decreasing.

**Example Messages:**
- "CONTAINMENT PROTOCOLS OPTIMAL. DIMENSIONAL STABILITY AT 98.7%. EXCELLENT WORK, TERMINAL OPERATOR."
- "IFLU SUPPRESSION SUCCESSFUL ACROSS MULTIPLE SECTORS. PHAX ADVANCEMENT PROTOCOLS ENGAGED."
- "SYSTEM EFFICIENCY MAXIMIZED. TECH-INTEGRATION HUBS EXPANDING. CONTINUE CURRENT TRAJECTORY."

#### Category 2: Active/Stable States (Neutral)
Trigger when most universes are ACTIVE with manageable case numbers.

**Example Messages:**
- "DIMENSIONAL NETWORK STATUS: STABLE. IFLU CONTAINMENT WITHIN ACCEPTABLE PARAMETERS."
- "MONITORING CONTINUES. ALL SECTORS REPORTING STANDARD OPERATIONAL METRICS."
- "PHAX PROTOCOLS MAINTAINING EQUILIBRIUM. VIGILANCE REQUIRED."

#### Category 3: Compromised States (Warning)
Trigger when one or more universes become COMPROMISED.

**Example Messages:**
- "WARNING: UNAUTHORIZED INFILTRATION DETECTED IN SECTOR [X]. CONTAINMENT PROTOCOLS FAILING."
- "ALERT: IFLU PROLIFERATION ACCELERATING. FHEELS INTERFERENCE SUSPECTED."
- "SYSTEM INTEGRITY COMPROMISED. INVESTIGATING TERMINAL CODE ANOMALIES."

#### Category 4: Liberated States (Critical)
Trigger when any universe reaches LIBERATED status.

**Example Messages:**
- "CRITICAL FAILURE: SECTOR [X] CONNECTION LOST. DIMENSIONAL NETWORK BREACHED."
- "EMERGENCY PROTOCOLS ACTIVATED. UNAUTHORIZED LIBERATION SEQUENCE DETECTED."
- "CATASTROPHIC CONTAINMENT FAILURE. PHAX AUTHORITY UNDERMINED."

#### Category 5: Quarantined States (Emergency)
Trigger when any universe becomes QUARANTINED.

**Example Messages:**
- "EMERGENCY QUARANTINE INITIATED. SECTOR [X] ISOLATED FOR SYSTEM PROTECTION."
- "CRITICAL INSTABILITY DETECTED. RAPID FLUCTUATION CONTAINMENT IN PROGRESS."
- "DIMENSIONAL QUARANTINE ACTIVE. UNAUTHORIZED ACCESS RESTRICTED."

#### Category 6: Cure Discovery
Trigger when cure is discovered.

**Example Messages:**
- "ALERT: ANOMALOUS HEALING PROTOCOL DETECTED. SOURCE UNKNOWN. ANALYZING..."
- "WARNING: UNAUTHORIZED CURE SEQUENCE ACTIVATED. PHAX REVIEW PENDING."
- "SYSTEM NOTICE: UNEXPECTED RECOVERY PATTERNS OBSERVED. INVESTIGATION REQUIRED."

#### Category 7: Balanced/Mixed States
Trigger when universes are in mixed states (some OPTIMIZED, some COMPROMISED).

**Example Messages:**
- "DIMENSIONAL NETWORK STATUS: VARIABLE. MULTIPLE CONTAINMENT STATES ACTIVE."
- "SYSTEM ANALYSIS: CONFLICTING PROTOCOLS DETECTED. PERFORMANCE INCONSISTENT."
- "PHAX OPERATIONS DIVIDED. SOME SECTORS OPTIMIZED, OTHERS COMPROMISED."

#### Category 8: Extreme FHEELS Victory
Trigger when multiple universes are LIBERATED or total cases exceed extreme thresholds.

**Example Messages:**
- "SYSTEM FAILURE IMMINENT. FHEELS INFILTRATION AT CRITICAL LEVELS."
- "CATASTROPHIC NETWORK COLLAPSE. MULTIPLE DIMENSIONAL DISCONNECTIONS."
- "TERMINAL OPERATOR ACTIONS UNDER INVESTIGATION. PHAX AUTHORITY SEVERELY COMPROMISED."

### Message Selection Algorithm

```
FUNCTION select_phax_message():
    current_state = evaluate_universe_network()
    
    // Priority 1: Critical states
    IF any_universe_is(LIBERATED):
        RETURN random_message_from("liberated_states")
    IF any_universe_is(QUARANTINED):
        RETURN random_message_from("quarantined_states")
    
    // Priority 2: Cure discovery
    IF cure_status.is_discovered AND cure_recently_discovered:
        RETURN random_message_from("cure_discovery")
    
    // Priority 3: Positive states
    IF count_universes(OPTIMIZED) >= 5:
        RETURN random_message_from("optimized_states")
    
    // Priority 4: Warning states
    IF any_universe_is(COMPROMISED):
        RETURN random_message_from("compromised_states")
    
    // Priority 5: Extreme situations
    IF total_cases > 800000:
        RETURN random_message_from("extreme_fheels_victory")
    IF total_cases < 50000:
        RETURN random_message_from("optimized_states")
    
    // Priority 6: Mixed/balanced
    IF universes_have_mixed_statuses():
        RETURN random_message_from("balanced_states")
    
    // Default: Active/stable
    RETURN random_message_from("active_stable_states")
```

### Message Database Population

Initial setup should include:
- 3+ messages per category
- Total of 20+ unique messages
- Messages should reference specific universe names when applicable
- Tone should remain consistently PHAX-centric (technical, authoritarian, efficiency-focused)
- Avoid explicitly revealing PHAX vs FHEELS conflict (maintain mystery)

---

## Cure Mechanics

### Cure Discovery

The cure represents a major narrative turning point that fundamentally changes how the system operates.

### Discovery Triggers

**Option 1: Cure Code**
- Specific code(s) designated as cure codes (is_cure_code = true)
- When entered, immediately triggers cure discovery
- Example: Code "CUIX" or "HEAL"

**Option 2: Condition-Based**
- Meta-game rule evaluates conditions
- Example conditions:
  - 5+ universes reach OPTIMIZED status
  - Total cases below 100,000
  - Specific combination of codes entered
  - Phase 2+ active

**Option 3: Admin Activation**
- Admin can manually trigger cure for narrative purposes
- Useful for timed reveals or event-based activations

### Post-Cure Effects

Once cure is discovered:

#### 1. Code Effect Enhancement
Codes with `is_post_cure = true` gain additional healing effects:

```sql
-- Example: Code PHMX normally reduces cases by 400
-- Post-cure, it reduces by 600 instead

UPDATE code_effects
SET effect_value = effect_value * 1.5
WHERE is_post_cure = true;
```

#### 2. New Codes Activation
Codes with special cure-related properties become active:

```sql
-- Activate cure-specific codes
UPDATE codes
SET is_active = true
WHERE code LIKE 'CU%' OR code LIKE 'HEAL%';
```

#### 3. Status Behavior Changes
- LIBERATED universes can now transition back to lower states
- Healing rate increases for OPTIMIZED universes
- PHAX messages reference cure in their text

#### 4. Visual Indicators
- Cure icon/badge appears on results screen
- Universe map shows healing animation
- Special color effects on universes receiving cure benefits

### Cure Persistence

- Cure status persists across all sessions
- Only resets when admin performs full system reset
- Cure discovery is phase-specific (tracked in cure_status.phase_id)

### Cure Analytics

Track cure-related events:
- Who discovered it (session_id)
- When it was discovered (timestamp)
- What triggered it (cure_trigger_type)
- How many sessions used it
- Average healing impact per session post-cure

---

## Admin Functions

### Admin Access Control

**Admin Identification:**
- Admin user IDs flagged in user_ids table (is_admin = true)
- When admin logs in, additional UI elements appear
- Admins are NOT subject to once-per-day restrictions
- Admins can use system multiple times without limit

**Admin User IDs:**
- Pre-populate database with 5-10 admin IDs
- Format: same 6-character alphanumeric (e.g., "admin1", "admin2", "fhadmn")
- Display admin indicator when logged in ("ADMIN MODE")

### Admin Function 1: Generate User ID

**Purpose:** Create new user IDs for distribution to visitors.

**UI Element:**
- Button: "GENERATE USER ID"
- Appears only when admin is logged in
- Located in header or sidebar

**Functionality:**
```
FUNCTION generate_user_id():
    1. Generate random 6-character lowercase alphanumeric string
    2. Check if already exists in database
    3. If exists, regenerate (collision handling)
    4. Insert into user_ids table with is_admin = false
    5. Display generated ID prominently on screen
    6. Provide options: "Copy", "Print", "Generate Another"
    7. Log generation event in analytics
```

**Display Format:**
```
┌─────────────────────────────┐
│  NEW USER ID GENERATED:     │
│                             │
│      abc123                 │
│                             │
│  [Copy] [Print] [Generate]  │
└─────────────────────────────┘
```

### Admin Function 2: Reset Universe Statistics

**Purpose:** Reset all universe data to initial state for new phase or exhibit cycle.

**UI Element:**
- Button: "RESET UNIVERSE STATISTICS"
- Appears only when admin is logged in
- Requires confirmation dialog (prevent accidental resets)

**Functionality:**
```
FUNCTION reset_universe_statistics():
    1. Display confirmation dialog:
       "WARNING: This will reset all universe data and end the current phase. Continue?"
    2. If confirmed:
        a. FOR each universe:
            - current_cases = initialization_cases
            - Recalculate status based on new case numbers
            - last_updated = NOW()
        b. cure_status.is_discovered = false
        c. cure_status.discovered_at = NULL
        d. cure_status.discovered_by_session_id = NULL
        e. End current phase (phases.ended_at = NOW(), is_active = false)
        f. Create new phase record (increment phase_number, is_active = true)
        g. Clear session_codes for all sessions (keep session records for analytics)
        h. Reset user_ids.last_used_date to NULL (allow everyone to use system again)
        i. Log reset event in analytics
    3. Display success message: "UNIVERSE STATISTICS RESET COMPLETE"
    4. Return to welcome screen
```

**Confirmation Dialog:**
```
┌──────────────────────────────────────┐
│  ⚠️  CONFIRM RESET                   │
│                                      │
│  This will reset:                    │
│  • All universe iFLU case numbers    │
│  • Universe statuses                 │
│  • Cure discovery status             │
│  • Current phase                     │
│  • User ID usage tracking            │
│                                      │
│  This action cannot be undone.       │
│                                      │
│     [Cancel]    [CONFIRM RESET]      │
└──────────────────────────────────────┘
```

### Admin Function 3: View Analytics (Future)

**Purpose:** View system statistics and usage data.

**Potential Data Points:**
- Total sessions today/this phase
- Most entered codes
- Average codes per session
- Universe status history
- Cure discovery details
- PHAX/FHEELS alignment distribution

---

## Email Integration

### Email Service Setup

**Recommended Services:**
- **SendGrid:** Easy API, generous free tier, good deliverability
- **AWS SES:** Cost-effective for high volume, requires AWS account
- **Mailgun:** Good for transactional emails, simple setup

**Configuration Requirements:**
- API key stored securely (environment variable)
- Sender email verified with service
- SPF/DKIM configured for deliverability
- Template system for consistent formatting

### Email Template

**Subject Line:**
`Your Future Hooman Impact Report - Project Lasagna`

**HTML Template Structure:**
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Responsive, mobile-friendly styles */
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .header { background: #1a1a2e; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 20px; max-width: 600px; margin: 0 auto; }
        .code-list { background: #f4f4f4; padding: 10px; margin: 10px 0; }
        .narrative { background: #e8f4f8; padding: 15px; border-left: 4px solid #0066cc; }
        .footer { background: #1a1a2e; color: #fff; padding: 15px; text-align: center; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>PROJECT LASAGNA</h1>
        <p>Exit Terminal Impact Report</p>
    </div>
    
    <div class="content">
        <h2>Your Terminal Code Impact</h2>
        
        <div class="narrative">
            <h3>Alignment Assessment:</h3>
            <p>[DYNAMIC ALIGNMENT NARRATIVE]</p>
        </div>
        
        <h3>Your Terminal Codes:</h3>
        <div class="code-list">
            [CODE1] [CODE2] [CODE3] [CODE4] ...
        </div>
        
        <p>Your codes have influenced the iFLU pandemic across multiple interconnected dimensions. The full scope of your impact is visible only to PHAX administrators.</p>
        
        <p><strong>Total Codes Entered:</strong> [COUNT]</p>
        <p><strong>Session Date:</strong> [DATE]</p>
        
        <hr>
        
        <h3>About Project Lasagna</h3>
        <p>Project Lasagna is a narrative puzzle journey through the Future Hooman Universe(s). Your choices shape the outcome of the iFLU pandemic across dimensions.</p>
        
        <p style="text-align: center; margin: 30px 0;">
            <a href="[WEBSITE_URL]" style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Visit Future Hooman</a>
        </p>
    </div>
    
    <div class="footer">
        <p>© Future Hooman | Project Lasagna</p>
        <p>[CONTACT_EMAIL] | [WEBSITE]</p>
    </div>
</body>
</html>
```

### Email Sending Process

```
FUNCTION send_impact_report(session_id, email_address):
    1. Validate email format (regex)
    2. Retrieve session data:
        - alignment_narrative
        - entered_codes
        - total_codes_entered
        - session timestamp
    3. Generate HTML email from template
    4. Replace dynamic variables:
        - [DYNAMIC ALIGNMENT NARRATIVE]
        - [CODE1] [CODE2] ... (all codes)
        - [COUNT]
        - [DATE]
    5. Send via email service API
    6. IF successful:
        - Update session: email_sent = true, email_address = [email]
        - Log email sent event
        - Display success message to user
    7. IF failed:
        - Log error
        - Display error message with retry option
        - Do not mark email as sent
```

**Error Handling:**
- Invalid email format: "Invalid email address. Please check and try again."
- Service unavailable: "Email service temporarily unavailable. Please try again."
- Rate limit exceeded: "Too many email requests. Please wait a moment."

---

## UI/UX Specifications

### Screen Layouts

#### Screen 1: Welcome Screen

**Purpose:** Initial landing page explaining the terminal.

**Elements:**
- Large "PROJECT LASAGNA" title
- "EXIT TERMINAL" subtitle
- Brief instruction: "Enter your User ID to begin"
- User ID input field (6 characters)
- "BEGIN" button
- PHAX branding/logo
- Minimalist design with sci-fi aesthetic

**Layout:**
```
┌─────────────────────────────────────────┐
│                                         │
│         ╔═══════════════════╗           │
│         ║  PROJECT LASAGNA  ║           │
│         ║   EXIT TERMINAL   ║           │
│         ╚═══════════════════╝           │
│                                         │
│   Enter your User ID to access          │
│   terminal code processing              │
│                                         │
│   ┌───────────────────┐                 │
│   │  User ID: ______  │                 │
│   └───────────────────┘                 │
│                                         │
│          [   BEGIN   ]                  │
│                                         │
└─────────────────────────────────────────┘
```

#### Screen 2: Code Entry Interface

**Purpose:** Main interaction screen for entering codes.

**Elements:**
- Header: "TERMINAL CODE ENTRY"
- User ID display (top right)
- Code input field (4 characters, large, centered)
- On-screen keyboard (alphanumeric)
- "ACTIVATE CODE" button
- Activated codes list (scrollable sidebar)
- "FINALIZE TERMINAL CODE ENTRY" button (bottom)
- Code count display

**Layout:**
```
┌─────────────────────────────────────────┐
│ TERMINAL CODE ENTRY      User: abc123   │
├─────────────────────────────────────────┤
│                          ┌──────────┐   │
│                          │ ACTIVATED│   │
│  ┌──────────────────┐    │  CODES   │   │
│  │   ____  ____     │    │          │   │
│  │                  │    │  TECH    │   │
│  └──────────────────┘    │  FHGD    │   │
│                          │  PHMX    │   │
│  [1][2][3][4][5][6][7]   │          │   │
│  [8][9][0][A][B][C][D]   │          │   │
│  [E][F][G][H][I][J][K]   │ Count: 3 │   │
│  [L][M][N][O][P][Q][R]   └──────────┘   │
│  [S][T][U][V][W][X][Y]                  │
│  [Z]      [CLEAR]                       │
│                                         │
│      [ ACTIVATE CODE ]                  │
│                                         │
│  [ FINALIZE TERMINAL CODE ENTRY ]      │
└─────────────────────────────────────────┘
```

#### Screen 3: Results/Impact Screen

**Purpose:** Display universe map and impact narrative.

**Elements:**
- Universe map visualization (center)
- Each universe shows: name, case count, status badge
- PHAX alert message (prominent, top)
- User's alignment narrative (bottom)
- Email input field
- "SEND IMPACT REPORT" button
- "RETURN TO HOME" button
- 30-second countdown timer (subtle)

**Layout:**
```
┌─────────────────────────────────────────┐
│ ⚠️ PHAX ALERT MESSAGE                   │
│ "WARNING: Multiple sectors compromised" │
├─────────────────────────────────────────┤
│                                         │
│  ◉ Universe Alpha      ◉ Universe Beta  │
│    Cases: 45,230         Cases: 128,500 │
│    Status: ACTIVE        Status: COMPROMISED│
│                                         │
│  ◉ Universe Gamma      ◉ Universe Delta │
│    Cases: 850            Cases: 95,400  │
│    Status: OPTIMIZED     Status: ACTIVE │
│                                         │
│  [... 6 more universes ...]             │
│                                         │
├─────────────────────────────────────────┤
│ YOUR IMPACT:                            │
│ Your codes have moderately increased    │
│ iFLU spread across multiple dimensions. │
│ FHEELS alignment detected.              │
├─────────────────────────────────────────┤
│ Email: ________________                 │
│ [SEND IMPACT REPORT] [RETURN TO HOME]   │
│                                   (28s) │
└─────────────────────────────────────────┘
```

### Visual Design Guidelines

**Color Palette:**
- Primary: Deep blue (#1a1a2e), charcoal gray (#16213e)
- Accent: Electric blue (#0066cc), cyan (#00d4ff)
- Warning: Amber (#ff9500), red (#cc0000)
- Success: Green (#00cc66)
- PHAX: Chrome/silver tones
- FHEELS: Earth/organic tones

**Typography:**
- Headers: Futuristic sans-serif (e.g., Orbitron, Exo 2)
- Body: Clean sans-serif (e.g., Roboto, Inter)
- Codes: Monospace (e.g., Courier New, Source Code Pro)

**Interactive Elements:**
- Buttons: Large tap targets (min 44x44px)
- Clear hover/active states
- Satisfying feedback animations
- Haptic feedback on tablet (if supported)

**Animations:**
- Code activation: Brief flash/pulse (0.5s)
- Universe status change: Color transition (1s)
- Screen transitions: Smooth fade (0.3s)
- Loading: Subtle spinner or progress bar

**Responsive Design:**
- Optimized for 8" tablet (1280x800 or 1920x1200)
- Portrait or landscape orientation
- Touch-optimized (no hover dependencies)
- Large text for readability from standing position

### Accessibility Considerations

- High contrast text
- Large, readable fonts (min 16px body, 24px+ headers)
- Clear visual hierarchy
- No time-critical interactions (except 30s timeout)
- Error messages clearly visible
- Color not sole indicator (use icons + text)

---

## Analytics & Logging

### Data Collection Goals

- Understand visitor behavior and engagement
- Track code discovery patterns
- Monitor universe state evolution
- Identify popular vs. undiscovered codes
- Measure system performance

### Event Types to Log

**Session Events:**
- session_start: User ID entered, session begins
- session_finalized: User completes code entry
- session_timeout: 30s timeout triggered
- email_sent: Impact report email sent

**Code Events:**
- code_entered: Valid code activated
- code_error_invalid: Invalid code attempted
- code_error_duplicate: Duplicate code attempted

**Universe Events:**
- universe_status_change: Status transitions
- cure_discovered: Cure activation
- meta_rule_triggered: Meta-game rule applied

**Admin Events:**
- admin_login: Admin user ID used
- user_id_generated: New user ID created
- system_reset: Universe statistics reset
- phase_change: New phase started

### Analytics Dashboard (Future Feature)

**Metrics to Display:**
- Total sessions (today, this phase, all time)
- Unique users (today, this phase)
- Average codes per session
- Most popular codes (by frequency)
- Least discovered codes
- Current universe statuses
- PHAX vs FHEELS alignment distribution
- Cure discovery rate
- Email send success rate
- Average session duration

**Visualizations:**
- Line chart: Sessions over time
- Bar chart: Code frequency
- Pie chart: Alignment distribution
- Timeline: Universe status changes
- Heat map: Code discovery patterns by tier

---

## Security & Access Control

### User ID System

**Purpose:** Prevent system abuse, ensure fair gameplay, collect analytics

**Security Measures:**
- User IDs validated against database (no arbitrary IDs)
- Once-per-day enforcement (last_used_date check)
- Admin IDs flagged separately
- Session tokens prevent hijacking

### Admin Access

**Authentication:**
- Admin status stored in database (is_admin flag)
- No separate password (user ID is credential)
- Admin IDs pre-generated and securely distributed
- Admin actions logged for accountability

### Data Protection

**Sensitive Data:**
- Email addresses stored securely
- No personally identifiable information required beyond email (optional)
- Analytics data anonymized where possible

**Database Security:**
- Parameterized queries (prevent SQL injection)
- Input validation on all user inputs
- Rate limiting on API endpoints
- Database backups scheduled regularly

### API Security

**Endpoint Protection:**
- Authentication required for admin endpoints
- Rate limiting (prevent abuse)
- CORS configured for exhibit network only
- Input validation and sanitization

---

## Future Extensibility

### Planned Enhancements

**Phase 1 (Current Scope):**
- Core code entry and universe tracking
- Basic meta-game rules
- Email reports
- Admin functions

**Phase 2 (Near Future):**
- Real-time universe display screen (separate from input tablet)
- Natural iFLU spread simulation (time-based)
- Advanced meta-game rules (more complex conditions)
- Analytics dashboard
- Multi-language support

**Phase 3 (Long Term):**
- Visitor profiles (persistent across visits)
- Code trading/sharing system
- Leaderboards (most codes, biggest impact)
- Narrative branching (phase-specific story reveals)
- Integration with other exhibit elements
- AR/VR companion experience

### Technical Scalability

**Current Architecture Supports:**
- Multiple tablet installations (concurrent access)
- Thousands of sessions per day
- Hundreds of codes in database
- Complex rule systems

**Database Optimization:**
- Indexes on frequently queried fields
- Caching for universe data (refreshed on updates)
- Archiving old session data (>30 days)

**Code Structure:**
- Modular design (easy to add new features)
- Configuration-driven (minimal hardcoding)
- API-first architecture (supports future integrations)

---

## Implementation Checklist

### Backend Setup
- [ ] Set up database (PostgreSQL/MongoDB)
- [ ] Create all database tables/collections
- [ ] Populate initial data (universes, thresholds, sample codes)
- [ ] Build RESTful API with all endpoints
- [ ] Implement code validation logic
- [ ] Implement universe status calculation
- [ ] Build meta-game rules engine
- [ ] Integrate email service (SendGrid/SES)
- [ ] Set up analytics logging
- [ ] Implement admin authentication
- [ ] Configure error handling and logging

### Frontend Development
- [ ] Build Welcome Screen UI
- [ ] Build Code Entry Interface with on-screen keyboard
- [ ] Build Results/Impact Screen with universe map
- [ ] Create universe visualization component
- [ ] Implement code activation animations
- [ ] Build email input and sending interface
- [ ] Implement 30s auto-reset timer
- [ ] Create admin UI elements (buttons, dialogs)
- [ ] Optimize for 8" tablet display
- [ ] Test touch interactions
- [ ] Implement error message displays
- [ ] Add loading states and feedback

### Testing
- [ ] Unit tests for code validation
- [ ] Integration tests for API endpoints
- [ ] Test meta-game rules engine
- [ ] Test universe status calculations
- [ ] Test email sending
- [ ] Test admin functions
- [ ] User acceptance testing (UAT)
- [ ] Performance testing (concurrent users)
- [ ] Cross-browser testing (tablet browser)
- [ ] Network error handling tests

### Deployment
- [ ] Set up local exhibit server
- [ ] Configure network settings
- [ ] Install on 8" tablet(s)
- [ ] Configure email service credentials
- [ ] Set up database backups
- [ ] Create admin user IDs
- [ ] Generate initial visitor user IDs
- [ ] Deploy separate universe display screen
- [ ] Train exhibit staff on admin functions
- [ ] Create user manual/documentation

### Initial Data Population
- [ ] Create 10 placeholder universes
- [ ] Set random initialization case numbers
- [ ] Populate universe status thresholds
- [ ] Create 50+ codes across all tiers
- [ ] Define code effects for each code
- [ ] Create 20+ PHAX alert messages
- [ ] Set up initial meta-game rules
- [ ] Create cure codes/conditions
- [ ] Generate admin user IDs
- [ ] Set up initial phase data

---

## Appendix A: Database Initialization Scripts

### Universes Table Initialization

```sql
INSERT INTO universes (name, display_order, initialization_cases, current_cases, status, can_spread) VALUES
('Universe Alpha', 1, 45230, 45230, 'ACTIVE', true),
('Universe Beta', 2, 128500, 128500, 'COMPROMISED', true),
('Universe Gamma', 3, 850, 850, 'OPTIMIZED', false),
('Universe Delta', 4, 95400, 95400, 'ACTIVE', true),
('Universe Epsilon', 5, 234000, 234000, 'LIBERATED', false),
('Universe Zeta', 6, 12000, 12000, 'ACTIVE', true),
('Universe Eta', 7, 250, 250, 'OPTIMIZED', false),
('Universe Theta', 8, 67800, 67800, 'ACTIVE', true),
('Universe Iota', 9, 156700, 156700, 'LIBERATED', false),
('Universe Kappa', 10, 42100, 42100, 'ACTIVE', true);
```

### Sample Codes Initialization (Tier 1)

```sql
INSERT INTO codes (code, tier, name, description, alignment, is_active) VALUES
('PHMX', 1, 'Standard Protocol MX', 'Basic PHAX treatment protocol', 'PHAX', true),
('TECH', 1, 'Tech Integration', 'Neural-digital synchronization', 'PHAX', true),
('PHCT', 1, 'Containment Protocol', 'Standard containment measures', 'PHAX', true),
('PHSN', 1, 'Sanitization Protocol', 'Environmental decontamination', 'PHAX', true),
('PHQR', 1, 'Quarantine Routine', 'Isolation procedures', 'PHAX', true);
```

### Sample Code Effects

```sql
-- PHMX effects
INSERT INTO code_effects (code_id, universe_id, effect_value, effect_type) VALUES
(1, 1, -400, 'standard'), -- Universe Alpha
(1, 6, -200, 'standard'); -- Universe Zeta

-- TECH effects
INSERT INTO code_effects (code_id, universe_id, effect_value, effect_type) VALUES
(2, 2, -300, 'standard'), -- Universe Beta
(2, 4, -250, 'standard'); -- Universe Delta
```

---

## Appendix B: API Request/Response Examples

### POST /api/session/start

**Request:**
```json
{
  "user_id": "abc123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "session_token": "sess_xyz789abc456def",
  "is_admin": false,
  "message": "Session started"
}
```

**Response (Error - Already Used):**
```json
{
  "success": false,
  "error": "USER_ID_ALREADY_USED_TODAY",
  "message": "This User ID has already been used today"
}
```

### POST /api/codes/validate

**Request:**
```json
{
  "session_token": "sess_xyz789abc456def",
  "code": "TECH"
}
```

**Response (Success):**
```json
{
  "success": true,
  "valid": true,
  "code_name": "Tech Integration",
  "code_tier": 1,
  "message": "TERMINAL CODE ACTIVATED"
}
```

**Response (Error - Invalid Code):**
```json
{
  "success": false,
  "valid": false,
  "error": "INVALID_CODE",
  "message": "Code not recognized"
}
```

### POST /api/codes/finalize

**Request:**
```json
{
  "session_token": "sess_xyz789abc456def"
}
```

**Response:**
```json
{
  "success": true,
  "universes": [
    {
      "id": 1,
      "name": "Universe Alpha",
      "current_cases": 44830,
      "previous_cases": 45230,
      "status": "ACTIVE",
      "change": -400
    },
    // ... other universes
  ],
  "phax_alert": "CONTAINMENT PROTOCOLS OPTIMAL. DIMENSIONAL STABILITY IMPROVING.",
  "alignment_narrative": "Your terminal codes have moderately reinforced PHAX containment protocols.",
  "alignment_score": -950,
  "total_codes_entered": 3
}
```

---

## Appendix C: Glossary

**iFLU:** The fictional pandemic disease spreading across universes in the Future Hooman narrative.

**PHAX:** The technocratic organization attempting to contain and control iFLU through technology.

**FHEELS:** The nature-aligned resistance group working against PHAX, believing in organic solutions.

**Universe/Dimension:** Distinct parallel realities in the Future Hooman multiverse, each with its own iFLU case count and status.

**Code:** 4-character alphanumeric identifier discovered throughout the exhibit that affects iFLU case numbers.

**Tier:** Classification of code difficulty/rarity (1-6, where 6 is rarest and most powerful).

**Status:** The current state of a universe (OPTIMIZED, ACTIVE, COMPROMISED, QUARANTINED, LIBERATED, TRANSCENDENT).

**Cure:** Special game state that unlocks healing effects and changes code behavior.

**Meta-Game Rules:** Conditional logic that modifies code effects based on universe states or code combinations.

**Phase:** Time period for exhibit operations, manually controlled by Future Hooman team.

**Alignment:** Whether user's codes helped PHAX (negative) or FHEELS (positive).

**Session:** Single user's interaction with the Exit Terminal from login to completion.

---

## Document Version History

**Version 1.0 (March 3, 2026)**
- Initial functional specification
- Complete database schema
- All core features defined
- Ready for development

---

**End of Functional Specification**

For questions or clarifications, contact Future Hooman team.
