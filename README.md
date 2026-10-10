# 🎓 Campus Connect - Backend Core APIs & System Architecture

Production-ready Django REST Framework backend for **Campus Connect**, a college-exclusive social and community platform engineered strictly in accordance with the **Master Project Bible**.

---

## 🏗️ Architecture & Modules Implemented

```
project/
├── manage.py                   # Pointed to config.settings
├── requirements.txt            # DRF, SimpleJWT, CORS, Pillow, Dotenv
├── seed_campus_data.py         # Seeds canonical Colleges (GEU/GEHU), Courses, Branches, Years, Clubs & Demo Student
├── setup.bat                   # 1-click Windows CMD setup script
├── setup.ps1                   # 1-click PowerShell setup script
├── README.md
│
├── config/                     # Core Project Configuration
│   ├── settings.py             # DRF, JWT, CORS, Email console backend, custom User
│   ├── urls.py                 # Central router with health check
│   ├── wsgi.py
│   └── asgi.py
│
├── colleges/                   # Phase 1: Colleges & Academic Hierarchy
│   ├── models.py               # College, CollegeDomain, Course, Branch, AcademicYear, Section
│   ├── serializers.py          # Serializers with nested branches & years
│   ├── views.py                # College listings, domain auto-detection
│   └── urls.py
│
├── otp/                        # Phase 2: OTP Issuance & Security
│   ├── models.py               # OTP model (6-digit, 5-min expiry, max 5 attempts)
│   ├── services.py             # 60s cooldown, invalidation, email dispatch
│   ├── serializers.py & views.py
│   └── urls.py
│
├── accounts/                   # Phase 2: Custom User & Authentication
│   ├── models.py               # Email-based User, verification flags, device tracking
│   ├── managers.py             # Custom UserManager
│   ├── serializers.py          # Email OTP, Phone OTP, Password, UserMe
│   ├── views.py                # Send/Verify Email OTP, Phone OTP, Local Password, JWT
│   └── urls.py
│
├── devices/                    # Phase 3: Device Registry & WhatsApp Web QR Linking
│   ├── models.py               # Device registry, DeviceLinkChallenge (QR web sessions)
│   ├── services.py             # Primary device policy, QR challenge authorization
│   ├── serializers.py & views.py
│   └── urls.py
│
├── profiles/                   # Phase 4: Student Onboarding
│   ├── models.py               # StudentProfile (public handle, bio, academic refs)
│   ├── serializers.py          # Strict server-side hierarchy validation & locked fields
│   ├── signals.py              # Automatic idempotent college community enrollment
│   ├── views.py                # Complete profile (auto-detects college), My profile, Edit
│   └── urls.py
│
├── communities/                # Phase 5: Communities & Clubs
│   ├── models.py               # Community (COLLEGE, COURSE, BRANCH, YEAR, SECTION, CLUB)
│   ├── serializers.py & views.py # Enrolled communities, public browse, join/leave
│   └── urls.py
│
├── posts/                      # Phase 6: Social Feed & Anonymous Mode
│   ├── models.py               # Post, PostImage, PostLike, Comment (with replies)
│   ├── serializers.py          # Zero-leak anonymous sanitization (removes real IDs/avatars)
│   ├── views.py                # Enrolled communities feed, community timeline, likes, comments
│   └── urls.py
│
└── chat/                       # Phase 7: Direct Messaging & Groups
    ├── models.py               # Conversation, ConversationMember, Message (with attachments)
    ├── serializers.py & views.py # Inbox, start 1-to-1, message history, send message
    └── urls.py
```

---

## 📡 Complete API Contract

### 1. Colleges & Domain Detection (`/api/colleges/`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/colleges/` | List all active colleges |
| `POST` | `/api/colleges/detect-domain/` | Auto-detect college from email/domain |
| `GET` | `/api/colleges/<college_id>/courses/` | List courses for a college |
| `GET` | `/api/colleges/courses/<course_id>/branches/` | List branches for a course |
| `GET` | `/api/colleges/courses/<course_id>/years/` | List academic years for a course |
| `GET` | `/api/colleges/academic-years/<year_id>/sections/` | List sections for an academic year |

### 2. Authentication (`/api/authentication/`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/authentication/email/send-otp/` | Request OTP to college email (validates college domain) |
| `POST` | `/api/authentication/email/verify-otp/` | Verify email OTP $\rightarrow$ returns JWT tokens & user status |
| `POST` | `/api/authentication/phone/send-otp/` | Request SMS OTP for mobile verification (Auth required) |
| `POST` | `/api/authentication/phone/verify-otp/` | Verify SMS OTP $\rightarrow$ binds phone exclusively (Auth required) |
| `POST` | `/api/authentication/password/set/` | Set local app password / PIN for rapid login (Auth required) |
| `POST` | `/api/authentication/login/` | Login via email and password |
| `POST` | `/api/authentication/logout/` | Blacklist refresh token |
| `GET` | `/api/authentication/me/` | Current user details, onboarding status & primary device |

### 3. Devices & QR Web Linking (`/api/devices/`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/devices/register/` | Register/switch primary active mobile device |
| `GET` | `/api/devices/my-devices/` | List active student devices |
| `POST` | `/api/devices/<uuid>/revoke/` | Revoke a linked device |
| `POST` | `/api/devices/qr/challenge/` | Web client generates 90s QR link challenge |
| `POST` | `/api/devices/qr/authorize/` | Mobile app scans and authorizes the web challenge |
| `GET` | `/api/devices/qr/status/<token>/` | Web client polls for authorization $\rightarrow$ gets JWT on success |

### 4. Profiles & Onboarding (`/api/profile/`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/profile/complete/` | Complete onboarding (hierarchy validation + community auto-join) |
| `GET` | `/api/profile/me/` | Fetch current student profile |
| `PATCH`| `/api/profile/edit/` | Edit bio, avatar, username (locked fields protected) |

### 5. Communities (`/api/communities/`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/communities/me/` | List communities student is enrolled in |
| `GET` | `/api/communities/` | Browse campus communities & student clubs |
| `GET` | `/api/communities/<slug>/` | View community details |
| `POST` | `/api/communities/<slug>/toggle-join/` | Join or leave opt-in student clubs/societies |

### 6. Social Feed & Posts (`/api/posts/`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/posts/feed/` | Main customized timeline of all enrolled communities |
| `GET` | `/api/posts/community/<slug>/` | Feed for a specific community or club |
| `POST` | `/api/posts/create/` | Create post (supports images & zero-leak anonymous mode) |
| `GET` | `/api/posts/<id>/` | View post details |
| `POST` | `/api/posts/<id>/like/` | Toggle like on post |
| `GET` | `/api/posts/<id>/comments/` | List comments and nested replies |
| `POST` | `/api/posts/<id>/comments/` | Post comment or reply (supports anonymous mode) |

### 7. Chat & Direct Messaging (`/api/chat/`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/chat/inbox/` | List direct and group conversations |
| `POST` | `/api/chat/start/<identifier>/` | Start or open 1-to-1 chat with another student |
| `GET` | `/api/chat/<uuid>/messages/` | Fetch conversation messages (marks unread as read) |
| `POST` | `/api/chat/<uuid>/send/` | Send message with text and/or file attachment |

---

---

## ⚡ How to Run (1-Click Automated Setup)

### 1. Start the Backend Server
In PowerShell:
```powershell
.\setup.ps1
```
*(On macOS / Linux: `chmod +x setup.sh && ./setup.sh`)*

This script automatically:
1. Creates clean virtual environment `venv/`.
2. Installs requirements (`django`, `djangorestframework`, `simplejwt`, `corsheaders`, `pillow`, etc.).
3. Runs database migrations for all apps.
4. Executes `seed_campus_data.py` to populate Graphic Era University (GEU/GEHU), courses, branches, clubs, demo admin (`admin@campusconnect.local` / `admin123`), and demo student `@aarav_cse` (`student@geu.ac.in` / `student123`).
5. Starts the development server at `http://127.0.0.1:8000/`.

---

### 2. Start the Mobile Frontend (React Native / Expo)
In a second terminal:
```powershell
.\setup_frontend.ps1
```
*(On macOS / Linux: `chmod +x setup_frontend.sh && ./setup_frontend.sh`)*

This script automatically:
1. Detects Node.js and npm.
2. Creates `mobile/.env` from `.env.example`.
3. Installs all required mobile libraries (`@react-navigation`, `axios`, `expo`, `lucide`, etc.) inside `mobile/`.
4. Launches the Expo development server!
5. Press `a` for Android Emulator, `w` for Web Browser, or scan QR code using Expo Go app on a physical phone.
