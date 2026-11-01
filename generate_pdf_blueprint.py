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
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.HexColor("#64748b"))
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 750, "Campus Connect — The Proximity-First Digital Operating System for University Life")
            self.setStrokeColor(colors.HexColor("#e2e8f0"))
            self.setLineWidth(0.5)
            self.line(54, 742, 558, 742)

        # Footer
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 36, page_text)
        self.drawString(54, 36, "CONFIDENTIAL & PROPRIETARY — CAMPUS CONNECT PRODUCT & ARCHITECTURE BLUEPRINT")
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.5)
        self.line(54, 48, 558, 48)
        self.restoreState()


def build_pdf(filename="Campus_Connect_Master_Blueprint_and_Vision.pdf"):
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
        leading=30,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=8,
    )

    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#2563eb"),
        spaceAfter=14,
    )

    h1_style = ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=19,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#1e40af"),
        spaceBefore=10,
        spaceAfter=5,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6,
    )

    bold_body = ParagraphStyle(
        "BoldBody",
        parent=body_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0f172a"),
    )

    callout_style = ParagraphStyle(
        "Callout",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#1e293b"),
    )

    table_header = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#ffffff"),
    )

    table_cell = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#1e293b"),
    )

    table_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=table_cell,
        fontName="Helvetica-Bold",
    )

    story = []

    # ================= COVER BANNER =================
    story.append(Paragraph("CAMPUS CONNECT", subtitle_style))
    story.append(Paragraph("The Proximity-First Digital Operating System for University Life", title_style))
    story.append(Paragraph("Master Product Blueprint, Gen-Z Mechanics, Virtual Courtroom, Confessions & Architecture Map", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#2563eb"), spaceAfter=14))

    meta_data = [
        [
            Paragraph("<b>Version:</b> 2.5 (Gen-Z & Proximity-First Edition)", table_cell),
            Paragraph("<b>Target Audience:</b> Founders, Investors & Leadership", table_cell),
        ],
        [
            Paragraph("<b>Stack:</b> React Native (Expo 51) + Django 5 REST", table_cell),
            Paragraph("<b>Campus Pilot:</b> Graphic Era University (GEU/GEHU Dehradun)", table_cell),
        ],
    ]
    meta_table = Table(meta_data, colWidths=[250, 250])
    meta_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # ================= SECTION 1: PROXIMITY-FIRST PHILOSOPHY =================
    story.append(Paragraph("1. The Proximity-First Social Philosophy: Why Talk to Someone 500 km Away?", h1_style))
    story.append(Paragraph(
        "Every mainstream social network makes the fatal mistake of optimizing for distant strangers. <b>Facebook connects you to 1,000 distant contacts</b> you haven't spoken to in years. <b>WhatsApp is too private</b> — you only speak to people whose phone numbers you already have, leaving thousands of talented peers around you completely isolated. <b>Instagram is purely performative</b>, and <b>LinkedIn is too corporate</b>.",
        body_style
    ))

    quote_data = [[
        Paragraph(
            "<b>The Core Breakthrough:</b> <i>'The person sitting 10 meters away from you in the college canteen could be your next hackathon co-founder, your study partner, your room partner, or your best friend for life. Why waste hours scrolling content from people 500 km away who cannot help you until you meet them in real life?'</i>",
            callout_style
        )
    ]]
    quote_table = Table(quote_data, colWidths=[500])
    quote_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eff6ff")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#3b82f6")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ])
    )
    story.append(quote_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "By enforcing <b>100% strict verification</b> (Campus GPS Geofencing, official college emails, and AI OCR ID Card scanning), Campus Connect removes all fake profiles, eliminates external lurkers, and creates an unbreakable high-trust environment where students can connect, form groups, and thrive.",
        body_style
    ))
    story.append(Spacer(1, 8))

    # ================= SECTION 2: VIRTUAL COURTROOM =================
    story.append(Paragraph("2. The Virtual Courtroom ('Campus Moot Court' Game & Problem Solver)", h1_style))
    story.append(Paragraph(
        "A revolutionary gamified simulation that serves as both <b>irresistible campus entertainment</b> and a <b>legit problem solver</b> for student dilemmas, club disputes, and hostel debates.",
        body_style
    ))

    court_roles_data = [
        [Paragraph("Courtroom Role", table_header), Paragraph("Campus Representation", table_header), Paragraph("Powers & In-Game Mechanics", table_header)],
        [
            Paragraph("<b>The Judge 👨‍⚖️</b>", table_cell_bold),
            Paragraph("High-reputation senior student or elected moderator.", table_cell),
            Paragraph("Maintains trial order, rules evidence admissible or hearsay, issues official final verdicts and humorous campus penalties.", table_cell),
        ],
        [
            Paragraph("<b>Advocate for Prosecution</b>", table_cell_bold),
            Paragraph("Student or team arguing against the issue or accused.", table_cell),
            Paragraph("Files charge sheet, submits photo/video proof, presents opening and closing arguments. Earns 'Advocate Karma Points'.", table_cell),
        ],
        [
            Paragraph("<b>Advocate for Defense</b>", table_cell_bold),
            Paragraph("Student or team representing the accused party.", table_cell),
            Paragraph("Cross-examines prosecution, submits counter-proof, defends campus phenomena (e.g. defending hostel canteen timing).", table_cell),
        ],
        [
            Paragraph("<b>The Campus Jury 👥</b>", table_cell_bold),
            Paragraph("Every verified university student watching live.", table_cell),
            Paragraph("Casts live votes: GUILTY ⚖️ or INNOCENT 🕊️. Real-time voting meters determine public sentiment and influence judge rulings.", table_cell),
        ],
    ]
    court_table = Table(court_roles_data, colWidths=[110, 140, 250])
    court_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(court_table)
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "<b>Trial Categories:</b><br/>"
        "• <i>Fun Banter:</i> 'Is 8:30 AM attendance a crime against humanity?', 'Hostel Mess Paneer vs Rubber: A Scientific Trial', 'The roommate who borrows hoodies and never returns them'.<br/>"
        "• <i>Legit Problem Solving:</i> Inter-club sponsorship allocation, group project partner who contributed 0 slides, fest volunteer budget resolutions.<br/>"
        "• <i>Verdict Penalties:</i> Humorous virtual sanctions (e.g., 'Guilty party must buy the winner two Maggis at the canteen', 'Write a 100-word formal apology on the Campus Wall').",
        body_style
    ))
    story.append(Spacer(1, 10))

    # ================= PAGE BREAK FOR CLEAN SECTIONS =================
    story.append(PageBreak())

    # ================= SECTION 3: SPILL THE TEA =================
    story.append(Paragraph("3. 'Spill The Tea' & The Campus Confession Point (🍵)", h1_style))
    story.append(Paragraph(
        "A dedicated, ultra-viral community hub for raw, hilarious, and relatable campus gossip, exam horror stories, secret crushes, and hostel banter.",
        body_style
    ))

    tea_mechanics_data = [
        [Paragraph("Feature Component", table_header), Paragraph("Gen-Z Mechanic", table_header), Paragraph("Technical & Safety Architecture", table_header)],
        [
            Paragraph("<b>Zero-Leak Anonymity</b>", table_cell_bold),
            Paragraph("Whimsical Mascot Avatars (e.g., 'Anonymous Canteen Critic', 'Anonymous Owl').", table_cell),
            Paragraph("Database strips user ID foreign keys from public confession payload. Zero traceable link prevents faculty or senior retaliation.", table_cell),
        ],
        [
            Paragraph("<b>The Tea-Meter</b>", table_cell_bold),
            Paragraph("Custom reactions: ☕ 'Sip the Tea' (Agree), 🔥 'Piping Hot' (Shocking), 👀 'Spill More' (Curious), 💀 'I'm Ded'.", table_cell),
            Paragraph("Atomic counters cached in Redis for real-time viral sorting. High engagement pushes posts into the 'Top Tea of the Week' digest.", table_cell),
        ],
        [
            Paragraph("<b>Real-Name Anti-Bullying Shield</b>", table_cell_bold),
            Paragraph("Protects individual students from cyberbullying and public defamation.", table_cell),
            Paragraph("Automated regex + NLP scanner detects student full names or roll numbers in derogatory contexts and routes to student moderation queue.", table_cell),
        ],
    ]
    tea_table = Table(tea_mechanics_data, colWidths=[120, 160, 220])
    tea_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7c3aed")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(tea_table)
    story.append(Spacer(1, 12))

    # ================= SECTION 4: GEN-Z + PROFESSIONAL HYBRID TOOLKIT =================
    story.append(Paragraph("4. The Gen-Z + Professional Hybrid Toolkit: Balancing Fun & Career", h1_style))
    story.append(Paragraph(
        "To ensure students use the app daily for both entertainment and academic success, Campus Connect introduces four high-utility campus modules:",
        body_style
    ))

    hybrid_data = [
        [Paragraph("Module", table_header), Paragraph("Gen-Z Experience", table_header), Paragraph("Student Value Proposition", table_header)],
        [
            Paragraph("<b>1. Campus Bounties & Micro-Gigs 💸</b>", table_cell_bold),
            Paragraph("'Need someone with a bike to grab my printout before 10 AM (₹50 via UPI)' / 'Selling 2nd Year Graphics kit (₹300)'.", table_cell),
            Paragraph("Students earn pocket money solving real campus micro-problems. Tapping 'I'll Do It' instantly opens a direct chat.", table_cell),
        ],
        [
            Paragraph("<b>2. Live Campus Pulse & Radar 📍</b>", table_cell_bold),
            Paragraph("Crowdsourced live campus status pins: 'Central Library ground floor 90% full', 'Guard checking ID strictly at Gate 2'.", table_cell),
            Paragraph("Real-time campus visibility. Status pins self-destruct after 2 hours to maintain 100% timeliness.", table_cell),
        ],
        [
            Paragraph("<b>3. Senior Survival Vault 📚</b>", table_cell_bold),
            Paragraph("Senior advice on tough professors, repeated midterm questions, and lab viva past questions.", table_cell),
            Paragraph("Saves juniors from academic failures by passing down practical institutional knowledge from graduating seniors.", table_cell),
        ],
        [
            Paragraph("<b>4. Skill-Swap & Hackathon Match 🤝</b>", table_cell_bold),
            Paragraph("'I know React & Tailwind; looking for a Django backend partner for Smart India Hackathon'.", table_cell),
            Paragraph("High-trust co-founder discovery within the university. Replaces awkward cold outreach with 1-tap skill matching.", table_cell),
        ],
    ]
    hybrid_table = Table(hybrid_data, colWidths=[120, 190, 190])
    hybrid_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(hybrid_table)
    story.append(Spacer(1, 12))

    # ================= SECTION 5: COMPLETE APP & SCREEN MAPPING =================
    story.append(Paragraph("5. Complete Mobile Application Navigation Topology", h1_style))

    nav_data = [
        [Paragraph("Bottom Tab", table_header), Paragraph("Primary Screen", table_header), Paragraph("Features & User Actions", table_header)],
        [
            Paragraph("<b>1. Feed 🌟</b>", table_cell_bold),
            Paragraph("FeedScreen.tsx", table_cell),
            Paragraph("Macro campus timeline, community filter pills, post composer with camera/gallery & PDF upload, threaded replies, in-app sharing [CAMPUS_POST_CARD].", table_cell),
        ],
        [
            Paragraph("<b>2. Campus 🏛️</b>", table_cell_bold),
            Paragraph("CommunitiesScreen.tsx", table_cell),
            Paragraph("Mandatory Core hubs (College, Course, Section) and student societies (GDSC, Cultural, Sports). Includes in-app WhatsApp-style Hub Chat.", table_cell),
        ],
        [
            Paragraph("<b>3. Arena ⚖️</b>", table_cell_bold),
            Paragraph("ArenaScreen.tsx (New)", table_cell),
            Paragraph("Host for (1) The Virtual Courtroom live trials & jury voting, (2) Spill The Tea anonymous confessions, (3) Live Campus Pulse radar, and (4) Campus Micro-Bounties.", table_cell),
        ],
        [
            Paragraph("<b>4. Chats 💬</b>", table_cell_bold),
            Paragraph("ChatScreen.tsx", table_cell),
            Paragraph("Instant student search by name/roll number, 1-on-1 direct messaging, Ephemeral self-destructing hangouts (10m–24h), and interactive shared post cards.", table_cell),
        ],
        [
            Paragraph("<b>5. Profile 🛡️</b>", table_cell_bold),
            Paragraph("ProfileScreen.tsx", table_cell),
            Paragraph("Student verified badge, academic record, Lost & Found recovery board, 1-tap demo testing bench (12 students), and Admin ID Card Audit Panel.", table_cell),
        ],
    ]
    nav_table = Table(nav_data, colWidths=[80, 110, 310])
    nav_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(nav_table)
    story.append(Spacer(1, 15))

    # ================= CONCLUSION BANNER =================
    final_p = Paragraph(
        "<b>Summary & Execution Strategy:</b> By prioritizing physical proximity, zero-fake verification, the Virtual Courtroom game, and anonymous Tea confessions, Campus Connect solves the exact daily needs of Gen-Z college students. This creates an unbreakable organic viral loop: when 1 student in Section A shares tea or files a courtroom case, the entire class joins to vote.",
        callout_style
    )
    final_table = Table([[final_p]], colWidths=[500])
    final_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#94a3b8")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ])
    )
    story.append(final_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[SUCCESS] Master PDF successfully generated: {os.path.abspath(filename)}")

if __name__ == "__main__":
    build_pdf()
