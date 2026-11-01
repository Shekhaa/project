import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    HRFlowable,
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_footer(num_pages)
            super().showPage()
        super().save()

    def draw_footer(self, page_count):
        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 750, "Campus Connect — Complete Master Technical & Product Blueprint (V3.0)")
            self.drawRightString(558, 750, "CONFIDENTIAL & PROPRIETARY")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 742, 558, 742)

        # Footer
        self.setFont("Helvetica", 8)
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 34, page_text)
        self.drawString(54, 34, "CAMPUS CONNECT ARCHITECTURE WHITE-PAPER — FOR CORE ENGINEERING & LEADERSHIP")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(54, 46, 558, 46)
        self.restoreState()


def generate_master_pdf(filename="Campus_Connect_Complete_Master_Blueprint.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6,
    )

    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#2563eb"),
        spaceAfter=14,
    )

    h1_style = ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13.5,
        textColor=colors.HexColor("#1e40af"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#334155"),
        spaceAfter=5,
    )

    bold_body = ParagraphStyle(
        "BoldBody",
        parent=body_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0f172a"),
    )

    code_style = ParagraphStyle(
        "CodeStyle",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#0f172a"),
    )

    callout_style = ParagraphStyle(
        "Callout",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#1e293b"),
    )

    table_header = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#ffffff"),
    )

    table_cell = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#1e293b"),
    )

    table_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=table_cell,
        fontName="Helvetica-Bold",
    )

    story = []

    # ================= COVER BANNER =================
    story.append(Paragraph("CAMPUS CONNECT ENGINEERING SPECIFICATION", subtitle_style))
    story.append(Paragraph("The Complete Master Technical & Product Blueprint", title_style))
    story.append(Paragraph("The Proximity-First Digital Operating System for University Life (V3.0)", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#2563eb"), spaceAfter=10))

    meta_data = [
        [
            Paragraph("<b>Version:</b> 3.0 (Master Engineering Blueprint)", table_cell),
            Paragraph("<b>Target Audience:</b> Founders, Core Engineering & Leadership", table_cell),
        ],
        [
            Paragraph("<b>Frontend:</b> React Native / Expo 51 (TypeScript 5.1)", table_cell),
            Paragraph("<b>Backend:</b> Django 5 REST Framework + PostgreSQL B-Tree", table_cell),
        ],
        [
            Paragraph("<b>Campus Base:</b> Graphic Era University (GEU/GEHU Dehradun)", table_cell),
            Paragraph("<b>Status:</b> Production Ready & Fully Documented", table_cell),
        ],
    ]
    meta_table = Table(meta_data, colWidths=[250, 250])
    meta_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    story.append(meta_table)
    story.append(Spacer(1, 8))

    # ================= PART I: PRODUCT VISION & PROXIMITY-FIRST =================
    story.append(Paragraph("PART I: THE PRODUCT VISION & THE PROXIMITY-FIRST THESIS", h1_style))
    story.append(Paragraph(
        "Every existing social network fails university students because none of them were engineered around <b>physical proximity and real-world daily utility</b>. Facebook connects you to distant contacts from 5 years ago; WhatsApp is hyper-siloed into isolated groups where the rest of the campus remains invisible; Instagram is performative and insecure; LinkedIn is corporate and fake.",
        body_style
    ))

    quote_data = [[
        Paragraph(
            "<b>The Core Breakthrough (The 10-Meter Proximity Rule):</b><br/>"
            "<i>'The person sitting 10 meters away from you in the college canteen could be your next hackathon co-founder, your study partner, your room partner, or your best friend for life. Why waste hours scrolling content from strangers 500 km away who cannot help you until you meet them in real life? The most valuable social network is the one right beside you.'</i>",
            callout_style
        )
    ]]
    quote_table = Table(quote_data, colWidths=[500])
    quote_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eff6ff")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#3b82f6")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    story.append(quote_table)
    story.append(Spacer(1, 8))

    # ================= PART II: SYSTEM TOPOLOGY & MAP =================
    story.append(Paragraph("PART II: FULL END-TO-END SYSTEM TOPOLOGY & DIRECTORY MAP", h1_style))
    story.append(Paragraph(
        "Below is the complete architectural map connecting frontend screens, services, middleware, backend Django apps, and database models:",
        body_style
    ))

    topology_data = [
        [Paragraph("Layer / App", table_header), Paragraph("Key Files & Components", table_header), Paragraph("Core Architectural Responsibility", table_header)],
        [
            Paragraph("<b>Mobile UI (Presentation)</b>", table_cell_bold),
            Paragraph("mobile/App.tsx<br/>mobile/src/screens/*", table_cell),
            Paragraph("5-tab navigation bar, AuthScreen (6 pathways), FeedScreen, CommunitiesScreen, ArenaScreen, ChatScreen, LostFoundScreen, ProfileScreen.", table_cell),
        ],
        [
            Paragraph("<b>API & Networking</b>", table_cell_bold),
            Paragraph("mobile/src/config/api.ts", table_cell),
            Paragraph("Axios singleton, dynamic baseURL resolution, Bearer JWT injection, automated 401 retry queue with token refresh rotation.", table_cell),
        ],
        [
            Paragraph("<b>Identity & Auth</b>", table_cell_bold),
            Paragraph("accounts/ (models, views)", table_cell),
            Paragraph("Custom User model, verification tiers (FULLY, SEMI, UNVERIFIED), Microsoft SSO, password/PIN management, student discovery search.", table_cell),
        ],
        [
            Paragraph("<b>OTP & Geofencing</b>", table_cell_bold),
            Paragraph("otp/ (models, services)", table_cell),
            Paragraph("6-digit OTP engine, 1-Click Magic Link generator, Haversine GPS distance calculation against Graphic Era campus coordinates (500m radius).", table_cell),
        ],
        [
            Paragraph("<b>OCR & Anti-Fraud</b>", table_cell_bold),
            Paragraph("profiles/ (ocr_service.py)", table_cell),
            Paragraph("Native Windows Media OCR extraction, SHA-256 perceptual ID card image hash check, collision detection for duplicate student roll numbers.", table_cell),
        ],
        [
            Paragraph("<b>Community Graph</b>", table_cell_bold),
            Paragraph("communities/ (services.py)", table_cell),
            Paragraph("CommunityEnrollmentService: automatically enrols student into College, Department, and Cohort Section upon profile completion.", table_cell),
        ],
        [
            Paragraph("<b>Feeds & Timeline</b>", table_cell_bold),
            Paragraph("posts/ (models, views)", table_cell),
            Paragraph("Composite B-Tree indexed feeds, PDF document note sharing, multi-image uploads, @mention regex parsing, nested threaded replies.", table_cell),
        ],
        [
            Paragraph("<b>Chat & Messaging</b>", table_cell_bold),
            Paragraph("chat/ (models, views)", table_cell),
            Paragraph("1-on-1 direct chat, Ephemeral self-destructing hangouts (10m–24h), unsend for everyone, delete for me, [CAMPUS_POST_CARD] serialization.", table_cell),
        ],
        [
            Paragraph("<b>Item Recovery</b>", table_cell_bold),
            Paragraph("lost_found/ (views.py)", table_cell),
            Paragraph("Notice board for lost & found items with physical location tag; 1-click contact button bridges instant direct chat with reporter.", table_cell),
        ],
        [
            Paragraph("<b>Event Notifications</b>", table_cell_bold),
            Paragraph("notifications/ (views.py)", table_cell),
            Paragraph("Event dispatching for LIKE, COMMENT, REPLY, TAG, SHARE, and MESSAGE with real-time unread badges.", table_cell),
        ],
    ]
    topo_table = Table(topology_data, colWidths=[95, 125, 280])
    topo_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    story.append(topo_table)
    story.append(Spacer(1, 10))

    story.append(PageBreak())

    # ================= PART III: COMPLETE DATABASE SCHEMA =================
    story.append(Paragraph("PART III: COMPLETE DATABASE SCHEMA & DATA DICTIONARY", h1_style))
    story.append(Paragraph(
        "Campus Connect utilizes a relational schema optimized with composite B-Tree indexes for sub-millisecond query performance on PostgreSQL:",
        body_style
    ))

    schema_data = [
        [Paragraph("Table Name", table_header), Paragraph("Primary / Foreign Keys", table_header), Paragraph("Key Fields & Types", table_header), Paragraph("Composite Indexes", table_header)],
        [
            Paragraph("<b>accounts_user</b>", table_cell_bold),
            Paragraph("PK: id (BigAuto)", table_cell),
            Paragraph("email (Email unique), phone_number (Char unique), full_name, is_email_verified, is_phone_verified, is_verified_student", table_cell),
            Paragraph("email, phone_number, created_at", table_cell),
        ],
        [
            Paragraph("<b>profiles_studentprofile</b>", table_cell_bold),
            Paragraph("PK: id<br/>FK: user_id, college_id, course_id, branch_id", table_cell),
            Paragraph("username (Char unique), admission_number, id_card_image, id_card_hash (Char 64), is_flagged_fake, verification_method", table_cell),
            Paragraph("(college, branch, academic_year), admission_number", table_cell),
        ],
        [
            Paragraph("<b>posts_post</b>", table_cell_bold),
            Paragraph("PK: id<br/>FK: community_id, author_id", table_cell),
            Paragraph("content (Text), media_type, media_url, document (File), is_anonymous (Bool), anonymous_alias (Char), is_deleted (Bool)", table_cell),
            Paragraph("<b>(community, -created_at)</b><br/><b>(is_deleted, -created_at)</b><br/><b>(author, -created_at)</b>", table_cell),
        ],
        [
            Paragraph("<b>posts_comment</b>", table_cell_bold),
            Paragraph("PK: id<br/>FK: post_id, user_id, parent_id", table_cell),
            Paragraph("text (Text), is_anonymous (Bool), anonymous_alias, created_at, updated_at", table_cell),
            Paragraph("(post, created_at)", table_cell),
        ],
        [
            Paragraph("<b>chat_conversation</b>", table_cell_bold),
            Paragraph("PK: id (UUID)", table_cell),
            Paragraph("name, is_group (Bool), is_ephemeral (Bool), duration (10M/1H/12H/24H), expires_at (DateTime)", table_cell),
            Paragraph("expires_at, created_at", table_cell),
        ],
        [
            Paragraph("<b>chat_message</b>", table_cell_bold),
            Paragraph("PK: id (UUID)<br/>FK: conversation_id, sender_id", table_cell),
            Paragraph("text (Text), attachment (File), is_read (Bool), is_unsent (Bool), unsent_at (DateTime)", table_cell),
            Paragraph("(conversation, -created_at)", table_cell),
        ],
        [
            Paragraph("<b>court_courtcase</b> (New)", table_cell_bold),
            Paragraph("PK: id (UUID)<br/>FK: prosecutor_id, defense_id, judge_id", table_cell),
            Paragraph("title, description, case_type, guilty_votes (Int), innocent_votes (Int), verdict_summary, penalty_assigned, status", table_cell),
            Paragraph("(status, -created_at)", table_cell),
        ],
        [
            Paragraph("<b>tea_teapost</b> (New)", table_cell_bold),
            Paragraph("PK: id (UUID)<br/>FK: college_id", table_cell),
            Paragraph("confession (Text), mascot_alias, sips_count (Int), piping_hot_count, ded_count, is_moderated (Bool)", table_cell),
            Paragraph("(college, -sips_count)", table_cell),
        ],
    ]
    schema_table = Table(schema_data, colWidths=[90, 110, 175, 125])
    schema_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    story.append(schema_table)
    story.append(Spacer(1, 10))

    # ================= PART IV: HOW CURRENT CODE WORKS =================
    story.append(Paragraph("PART IV: HOW THE APP CURRENTLY WORKS (DEEP CODE-LEVEL FLOWS)", h1_style))

    flows_data = [
        [Paragraph("Code Flow", table_header), Paragraph("Underlying Implementation", table_header), Paragraph("Safety & Edge Cases Handled", table_header)],
        [
            Paragraph("<b>1. Geofenced Registration</b>", table_cell_bold),
            Paragraph("accounts/views.py calculates Haversine distance between student coordinates and Graphic Era (30.2685°N, 77.9942°E).", table_cell),
            Paragraph("If distance &gt; 500m, request is rejected with HTTP 403 unless simulation flag is toggled for blind testing.", table_cell),
        ],
        [
            Paragraph("<b>2. ID Card OCR Verification</b>", table_cell_bold),
            Paragraph("profiles/ocr_service.py uses native Windows Media OCR to extract student name and roll number; hashes image using SHA-256.", table_cell),
            Paragraph("Detects if student roll number or ID card photo was already used by another account, preventing account spoofing.", table_cell),
        ],
        [
            Paragraph("<b>3. Community Enrollment</b>", table_cell_bold),
            Paragraph("CommunityEnrollmentService auto-subscribes student to College, Course (e.g. B.Tech CSE), and Cohort Section upon profile completion.", table_cell),
            Paragraph("Guarantees students immediately see their department's timeline without having to manually search or join.", table_cell),
        ],
        [
            Paragraph("<b>4. Silent JWT Token Rotation</b>", table_cell_bold),
            Paragraph("mobile/src/config/api.ts intercepts 401s, queries refresh token, hits /api/authentication/token/refresh/, and replays pending queue.", table_cell),
            Paragraph("Users never experience unexpected session drops. If refresh token expires, smooth logout event transitions to AuthScreen.", table_cell),
        ],
        [
            Paragraph("<b>5. Shared Post Card Serialization</b>", table_cell_bold),
            Paragraph("ShareModal.tsx encodes post into [CAMPUS_POST_CARD:{...}] tag. MessageBubble.tsx parses tag and renders interactive card.", table_cell),
            Paragraph("Recipients can like and comment directly inside the chat thread using SharedPostViewerModal.", table_cell),
        ],
    ]
    flows_table = Table(flows_data, colWidths=[100, 195, 205])
    flows_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    story.append(flows_table)
    story.append(Spacer(1, 10))

    story.append(PageBreak())

    # ================= PART V: NEW GEN-Z ARENA BLUEPRINT =================
    story.append(Paragraph("PART V: THE NEW GEN-Z ARENA — ARCHITECTURAL BLUEPRINT", h1_style))

    story.append(Paragraph("5.1 The Virtual Courtroom ('Campus Moot Court')", h2_style))
    story.append(Paragraph(
        "A gamified simulation engine where campus debates, hostel disputes, and club dilemmas are put on live trial. It functions as both <b>irresistible entertainment</b> and a <b>legit democratic problem solver</b>:",
        body_style
    ))

    court_details = [
        [Paragraph("Feature Component", table_header), Paragraph("Rules & In-Game Mechanics", table_header)],
        [
            Paragraph("<b>The 4 Roles</b>", table_cell_bold),
            Paragraph("<b>Judge:</b> High-reputation senior student/moderator rules on evidence and delivers final verdict.<br/><b>Prosecutor:</b> Files grievance, presents charge sheet, earns 'Advocate Karma'.<br/><b>Defense:</b> Argues on behalf of the accused/subject.<br/><b>Campus Jury:</b> Verified student body casts live votes: GUILTY ⚖️ or INNOCENT 🕊️.", table_cell),
        ],
        [
            Paragraph("<b>3-Round Trial Format</b>", table_cell_bold),
            Paragraph("<b>Round 1 (Opening):</b> 2 min per side.<br/><b>Round 2 (Evidence & Witnesses):</b> Submits photos/docs (e.g. canteen samosa photo).<br/><b>Round 3 (Closing Arguments):</b> Final plea before jury voting closes.", table_cell),
        ],
        [
            Paragraph("<b>Verdict & Penalties</b>", table_cell_bold),
            Paragraph("Jury vote determines guilt. Judge issues fun campus sanctions: e.g., 'Guilty party must buy the winner two Maggis at the canteen' or 'Write a 100-word apology on the Campus Wall'.", table_cell),
        ],
    ]
    court_tab = Table(court_details, colWidths=[120, 380])
    court_tab.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(court_tab)
    story.append(Spacer(1, 8))

    story.append(Paragraph("5.2 'Spill The Tea' & The Campus Confession Point (🍵)", h2_style))
    story.append(Paragraph(
        "A dedicated anonymous space for relatable campus gossip, exam panic, crushes, and professor quirks:",
        body_style
    ))

    tea_details = [
        [Paragraph("Component", table_header), Paragraph("Gen-Z & Safety Specification", table_header)],
        [
            Paragraph("<b>Zero-Leak Anonymity</b>", table_cell_bold),
            Paragraph("User foreign key is stripped from JSON payload. Post is tagged with random mascot alias (e.g., 'Anonymous Owl', 'Anonymous Canteen Critic'). Prevents faculty or senior retaliation.", table_cell),
        ],
        [
            Paragraph("<b>The Tea-Meter Reactions</b>", table_cell_bold),
            Paragraph("Custom reaction icons: ☕ 'Sip the Tea' (Agree), 🔥 'Piping Hot' (Shocking drama), 👀 'Spill More' (Curious), 💀 'I'm Ded' (Hilarious). High engagement triggers Sunday Night 'Top Tea of the Week'.", table_cell),
        ],
        [
            Paragraph("<b>Anti-Bullying NLP Shield</b>", table_cell_bold),
            Paragraph("Regex + NLP scanner checks submissions against registered student names. If a confession mentions a real student's name in a defamatory/toxic context, it is auto-held for student moderator review.", table_cell),
        ],
    ]
    tea_tab = Table(tea_details, colWidths=[120, 380])
    tea_tab.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7c3aed")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(tea_tab)
    story.append(Spacer(1, 8))

    story.append(Paragraph("5.3 The Gen-Z + Professional Hybrid Toolkit", h2_style))

    hybrid_details = [
        [Paragraph("Module", table_header), Paragraph("Real-World Campus Scenario & Engineering Flow", table_header)],
        [
            Paragraph("<b>Campus Bounties 💸</b>", table_cell_bold),
            Paragraph("'Need someone with a bike to grab my printout before 10 AM (₹50 via UPI)'. Tapping 'I'll Do It' opens direct chat with bounty poster. Solves micro-errands while enabling students to earn pocket money.", table_cell),
        ],
        [
            Paragraph("<b>Live Campus Pulse 📍</b>", table_cell_bold),
            Paragraph("Crowdsourced live status pins: 'Central Library ground floor 90% full', 'Guard checking ID strictly at Gate 2'. Pins automatically self-destruct after 2 hours to guarantee real-time freshness.", table_cell),
        ],
        [
            Paragraph("<b>Senior Survival Vault 📚</b>", table_cell_bold),
            Paragraph("Institutional wisdom: professor profiles (what questions they repeat), past 5-year midterm hotspots, and external viva survival tips handed down from graduating 4th-year seniors to juniors.", table_cell),
        ],
        [
            Paragraph("<b>Skill-Swap Match 🤝</b>", table_cell_bold),
            Paragraph("'I know React & Tailwind; looking for a Django backend partner for Smart India Hackathon'. 1-tap co-founder match within the university.", table_cell),
        ],
    ]
    hybrid_tab = Table(hybrid_details, colWidths=[120, 380])
    hybrid_tab.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(hybrid_tab)
    story.append(Spacer(1, 10))

    story.append(PageBreak())

    # ================= PART VI: COMPLETE API CONTRACTS =================
    story.append(Paragraph("PART VI: COMPLETE API CONTRACTS & ROUTE SPECIFICATION (85+ ROUTES)", h1_style))

    api_data = [
        [Paragraph("Method", table_header), Paragraph("Route Endpoint", table_header), Paragraph("Auth", table_header), Paragraph("Payload & Response Summary", table_header)],
        [
            Paragraph("<b>GET</b>", table_cell_bold),
            Paragraph("/api/health/", table_cell),
            Paragraph("Public", table_cell),
            Paragraph("Returns status: 'healthy', version: '2.0.0'.", table_cell),
        ],
        [
            Paragraph("<b>POST</b>", table_cell_bold),
            Paragraph("/api/authentication/email/send-otp/", table_cell),
            Paragraph("Public", table_cell),
            Paragraph("Body: {email}. Dispatches 6-digit OTP & 1-Click Magic Link.", table_cell),
        ],
        [
            Paragraph("<b>POST</b>", table_cell_bold),
            Paragraph("/api/authentication/email/verify-otp/", table_cell),
            Paragraph("Public", table_cell),
            Paragraph("Body: {email, otp, password}. Verifies and returns {access, refresh, user}.", table_cell),
        ],
        [
            Paragraph("<b>POST</b>", table_cell_bold),
            Paragraph("/api/authentication/phone-login/send-otp/", table_cell),
            Paragraph("Public", table_cell),
            Paragraph("Body: {phone_number, latitude, longitude}. Checks 500m geofence.", table_cell),
        ],
        [
            Paragraph("<b>POST</b>", table_cell_bold),
            Paragraph("/api/authentication/token/refresh/", table_cell),
            Paragraph("Public", table_cell),
            Paragraph("Body: {refresh}. Returns new {access} token.", table_cell),
        ],
        [
            Paragraph("<b>POST</b>", table_cell_bold),
            Paragraph("/api/profile/complete/", table_cell),
            Paragraph("User", table_cell),
            Paragraph("Body: {course, branch, year, section}. Auto-joins 3 core communities.", table_cell),
        ],
        [
            Paragraph("<b>GET</b>", table_cell_bold),
            Paragraph("/api/profile/admin/id-cards/", table_cell),
            Paragraph("Staff", table_cell),
            Paragraph("Protected: lists registered students with uploaded ID card photos.", table_cell),
        ],
        [
            Paragraph("<b>GET/POST</b>", table_cell_bold),
            Paragraph("/api/posts/feed/?page=1", table_cell),
            Paragraph("User", table_cell),
            Paragraph("B-Tree composite indexed paginated timeline across joined hubs.", table_cell),
        ],
        [
            Paragraph("<b>POST</b>", table_cell_bold),
            Paragraph("/api/chat/<id>/send/", table_cell),
            Paragraph("User", table_cell),
            Paragraph("Sends message, attachment, or [CAMPUS_POST_CARD] preview card.", table_cell),
        ],
        [
            Paragraph("<b>GET/POST</b>", table_cell_bold),
            Paragraph("/api/court/cases/", table_cell),
            Paragraph("User", table_cell),
            Paragraph("Lists active courtroom trials; creates new case with evidence.", table_cell),
        ],
        [
            Paragraph("<b>POST</b>", table_cell_bold),
            Paragraph("/api/court/cases/<id>/vote/", table_cell),
            Paragraph("User", table_cell),
            Paragraph("Body: {vote: 'GUILTY'|'INNOCENT'}. Tallies live student jury votes.", table_cell),
        ],
        [
            Paragraph("<b>GET/POST</b>", table_cell_bold),
            Paragraph("/api/tea/confessions/", table_cell),
            Paragraph("User", table_cell),
            Paragraph("Sorted by Tea-Meter gravity formula; publishes zero-leak confession.", table_cell),
        ],
        [
            Paragraph("<b>POST</b>", table_cell_bold),
            Paragraph("/api/lost-found/<id>/contact/", table_cell),
            Paragraph("User", table_cell),
            Paragraph("Instantly spins up 1-on-1 direct chat with reporter with item context.", table_cell),
        ],
    ]
    api_tab = Table(api_data, colWidths=[45, 175, 45, 235])
    api_tab.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    story.append(api_tab)
    story.append(Spacer(1, 10))

    # ================= PART VII: SCREEN WIREFRAME TOPOLOGY =================
    story.append(Paragraph("PART VII: SCREEN-BY-SCREEN UI/UX WIREFRAME MAP", h1_style))

    wireframe_data = [
        [Paragraph("Screen File", table_header), Paragraph("Navigation Tab", table_header), Paragraph("Primary Interactive Components", table_header)],
        [
            Paragraph("<b>FeedScreen.tsx</b>", table_cell_bold),
            Paragraph("Tab 1: 🌟 Feed", table_cell),
            Paragraph("Top Brand Header, Unread Notifications Bell Badge, Filter Pills (All Campus vs Department), Post Composer Modal with Native Camera/PDF Picker, PostCard, Threaded Comments Modal with @mentions highlighting.", table_cell),
        ],
        [
            Paragraph("<b>CommunitiesScreen.tsx</b>", table_cell_bold),
            Paragraph("Tab 2: 🏛️ Campus", table_cell),
            Paragraph("College, Course, and Section Core Hubs; Custom Student Clubs (GDSC, Cultural, Robotics); in-screen live WhatsApp-style group Hub Chat with colored member tags.", table_cell),
        ],
        [
            Paragraph("<b>ArenaScreen.tsx (New)</b>", table_cell_bold),
            Paragraph("Tab 3: ⚖️ Arena", table_cell),
            Paragraph("Sub-tab switcher: (1) Virtual Courtroom live trials & jury voting meters, (2) Spill The Tea confession cards with ☕ reaction meters, (3) Live Campus Radar pins, (4) Micro-Bounties board.", table_cell),
        ],
        [
            Paragraph("<b>ChatScreen.tsx</b>", table_cell_bold),
            Paragraph("Tab 4: 💬 Chats", table_cell),
            Paragraph("Debounced student directory search, 1-on-1 direct message stream, Ephemeral Hangouts with countdown badges, action sheet (Unsend for Everyone / Delete for Me), interactive shared post cards.", table_cell),
        ],
        [
            Paragraph("<b>ProfileScreen.tsx</b>", table_cell_bold),
            Paragraph("Tab 5: 🛡️ Profile", table_cell),
            Paragraph("Verified Student badge, institutional records, Lost & Found item noticeboard, 12-Student multi-user switching bench, Settings, and Admin Anti-Fraud ID card inspection dashboard.", table_cell),
        ],
    ]
    wireframe_tab = Table(wireframe_data, colWidths=[110, 85, 305])
    wireframe_tab.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    story.append(wireframe_tab)
    story.append(Spacer(1, 10))

    story.append(PageBreak())

    # ================= PART VIII: SCALING & INFRASTRUCTURE =================
    story.append(Paragraph("PART VIII: INFRASTRUCTURE, COSTING & 40,000 USER SCALING", h1_style))
    story.append(Paragraph(
        "A rigorous cost and capacity breakdown moving from the current campus pilot to university-wide scale:",
        body_style
    ))

    scale_data = [
        [Paragraph("Scale Stage", table_header), Paragraph("Active Students", table_header), Paragraph("Infrastructure Stack", table_header), Paragraph("Est. Monthly Cloud Bill", table_header)],
        [
            Paragraph("<b>Stage 1: Campus Pilot (Current)</b>", table_cell_bold),
            Paragraph("100 – 1,000", table_cell),
            Paragraph("Render Free Web Service (1 CPU, 512MB RAM) + Render PostgreSQL (1GB)", table_cell),
            Paragraph("<b>₹0 / month (100% Free)</b>", table_cell),
        ],
        [
            Paragraph("<b>Stage 2: Single University Launch</b>", table_cell_bold),
            Paragraph("5,000 – 10,000", table_cell),
            Paragraph("Render Starter ($25) + Render Postgres ($20) + Redis Cloud ($15) + Cloudinary", table_cell),
            Paragraph("<b>~₹5,000 / month ($60)</b>", table_cell),
        ],
        [
            Paragraph("<b>Stage 3: Multi-University Scale</b>", table_cell_bold),
            Paragraph("40,000+", table_cell),
            Paragraph("AWS EC2 / Hetzner (2x 8-Core, 32GB RAM) + Managed RDS + Redis Cluster + Daphne WebSockets", table_cell),
            Paragraph("<b>~₹12,000 – ₹18,000 / month</b>", table_cell),
        ],
    ]
    scale_tab = Table(scale_data, colWidths=[120, 80, 200, 100])
    scale_tab.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(scale_tab)
    story.append(Spacer(1, 14))

    # Summary Callout
    final_callout = Paragraph(
        "<b>Architectural Verdict & Competitive Edge:</b><br/>"
        "1. <b>Zero Outsiders, 100% Trust:</b> Verified students within a 500m perimeter eliminate spam and cyber-stalking completely.<br/>"
        "2. <b>The Proximity Flywheel:</b> When an issue is put on trial in the Virtual Courtroom or spicy tea is spilled in the Confession Point, word spreads through canteens and hostels in minutes.<br/>"
        "3. <b>Dual Engine:</b> Campus Connect pairs Gen-Z viral entertainment with high-stakes academic utility (exam hotspots, PDF slides, lost & found).<br/>"
        "4. <b>Unit Economics:</b> At 40,000 students, the entire infrastructure runs on ₹0.30/student/month. A single local merchant sponsorship easily pays for the entire server fleet.",
        callout_style
    )
    final_box = Table([[final_callout]], colWidths=[500])
    final_box.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#94a3b8")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ])
    )
    story.append(final_box)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[SUCCESS] Complete Master PDF successfully generated: {os.path.abspath(filename)}")

if __name__ == "__main__":
    generate_master_pdf()
