# Campus Connect - React Native Mobile App

This directory contains the cross-platform React Native (Expo) frontend for **Campus Connect**.

## 🛡️ Architecture & Environment Isolation

The frontend is strictly isolated inside the `mobile/` directory to prevent any conflicts with the Django backend:
- **Backend**: Lives in project root with its own Python `venv/`, `manage.py`, and Django apps.
- **Frontend**: Lives in `mobile/` with its own `package.json`, `node_modules/`, and configuration.
- **No Collision**: Python virtual environment (`venv`) and JavaScript dependencies (`node_modules`) never interact or overwrite each other.

---

## 📱 Features Included

1. **Hybrid Onboarding Screen**:
   - Single-Tap Microsoft Entra ID (Azure AD SSO) for instant college login without checking Outlook.
   - College Email input with 6-digit OTP + 1-Click Magic Link.
2. **Academic Hierarchy Profile Setup**:
   - Course, Branch, Year, Section, and Roll number lock.
   - Instant auto-enrollment into **3 Mandatory Core Communities**:
     - *College Community*
     - *Course Community*
     - *Section Classroom Community*
3. **Campus Social Feed**:
   - Community-scoped posts, likes, and comments.
   - **Zero-Leak Anonymous Mode**: Toggle on to post with an automatic mascot alias.
4. **Communities Hub**:
   - Distinct separation of the 3 Core Academic Hubs and Student Clubs.
   - "+" Button to create custom Reddit/WhatsApp-style student communities.
5. **Chat & Ephemeral Hangouts**:
   - Direct 1-on-1 chats and group discussions.
   - **Self-Destructing Groups** (10 min, 1 hour, 12 hours, 24 hours) for trips and hangouts with auto-cleanup from inbox.
6. **Frictionless Lost & Found**:
   - 1-step reporting: descriptive message + written location.
   - 1-click in-app direct chat thread with reporter.

---

## 🚀 How to Run

1. Open a terminal in `mobile/`:
   ```powershell
   cd mobile
   npm install
   npm start
   ```
2. Scan QR code using Expo Go app on your Android or iOS phone, or press `a` for Android Emulator / `w` for Web.
