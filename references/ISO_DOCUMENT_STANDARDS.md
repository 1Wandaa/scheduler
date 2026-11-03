# ISO 9001:2015 Layout Specifications & Verified Quality Standards

This document establishes the verified layout standards extracted directly from the official Microsoft Word reference files (`.docx`) stored in [`references/`](file:///c:/Users/user/Desktop/New%20folder/scheduler/references). All web components, print stylesheets, and Word export routines in the system are calibrated to match these exact specifications.

---

## 1. Class Schedule (`INS-CLS-08`)
> Verified from: [`references/class-schedule-iso/ISO FORMAT CLASS SCHEDULES.docx`](file:///c:/Users/user/Desktop/New%20folder/scheduler/references/class-schedule-iso/ISO%20FORMAT%20CLASS%20SCHEDULES.docx)

### Page & Geometry
- **Paper Sizing**: Landscape (`16838 dxa × 11906 dxa` = `11.69 in × 8.27 in` / A4 - Letter Landscape).
- **Margins**: Top = `1.00 in` (`72pt`), Right = `0.63 in` (`45pt`), Bottom = `1.00 in` (`72pt`), Left = `1.00 in` (`72pt`).
- **Table Width**: Fixed `730pt` (`14625 dxa`).
- **Orientation**: Landscape (`mso-page-orientation: landscape;`).

### Typography & Fonts
- **Primary Typeface**: `Times New Roman`, serif.
- **Main Document Title**: `CLASS SCHEDULE` — `12pt`, Bold, Centered.
- **Document Type**: `DOCUMENTED INFORMATION` — `12pt`, Bold, Centered.
- **Document Standard**: `ISO 9001:2015` — `8.5pt`, Bold.
- **Document Code**: `INS-CLS-08` — `8.5pt`, Bold, Centered.
- **Revision No. & Date**: `00` | `June 25, 2018` — `8.5pt`, Bold, Centered.
- **Page Number**: `1 of 1` — `8.5pt`, Bold, Centered.
- **Metadata Line**: `9.5pt` Bold, uppercase, with underlined dynamic values:
  - `DEGREE PROGRAM: [PROGRAM]` | `COURSE & YEAR: [SECTION]` | `SEMESTER & AY: [TERM]`
- **Timetable Header**: `TIME` (`115pt`) + 5 Days (`120pt - 135pt` each) — `9pt`, Bold.
- **Timetable Cells**:
  - Subject Code: `8.5pt - 9pt`, Bold.
  - Faculty Name: `8pt`, Regular.
  - Room Assignment: `8pt`, Regular.
  - Lunch Break: `11:30 – 12:30` spanning all columns, `9pt` Bold, letter-spaced `L U N C H   B R E A K`.

### Official Signatories
- **Prepared by**: `JELLY L. PAREDES, EdD` — Program Chairman, BSCS
- **Approved**: `RAMY LLOYD L. LOTILLA, EdD` — Satellite College Director

---

## 2. Faculty Workload (`INS F22`)
> Verified from: [`references/faculty-workload-iso/ISO FORMAT FACULTY WORKLOAD.docx`](file:///c:/Users/user/Desktop/New%20folder/scheduler/references/faculty-workload-iso/ISO%20FORMAT%20FACULTY%20WORKLOAD.docx)

### Page & Geometry
- **Paper Sizing**: Portrait (`11918 dxa × 16858 dxa` = `8.28 in × 11.71 in` / A4 - Letter Portrait).
- **Margins**: Top = `0.44 in` (`31.5pt`), Right = `1.00 in` (`72pt`), Bottom = `1.00 in` (`72pt`), Left = `0.50 in` (`36pt`).
- **Table Width**: Strict fixed `525pt` (`10500 dxa`).
- **Orientation**: Portrait (`mso-page-orientation: portrait;`).

### Typography & Fonts
- **Primary Typeface**: `Times New Roman`, serif.
- **Header Title**: `FACULTY WORKLOAD` — `11pt - 12pt`, Bold, Centered.
- **Document Code**: `INS F22` | **Revision**: `00` | **Date**: `August 5, 2024`.
- **Active Term**: `1st Semester, School Year 2026-2027` — `9.5pt`, Underlined, Centered.
- **Faculty Label**: `Name of Faculty: [NAME]` — `8.5pt - 9pt`, Bold Underline.
- **Faculty Profile Table** (`525pt`):
  - Columns: Level (`122pt`), Field (`45pt`), Value (`207pt`), Rank/Designation (`151pt`).
  - Font Size: `7.5pt - 8pt`.
- **Teaching Assignment Table** (`525pt`):
  - Columns: Course No. (`72pt`), Course Title (`203pt`), Units (`40pt`), No. of Hours (`90pt`), Course & Year Level (`68pt`), No. of Students (`52pt`).
  - Font Size: `7pt - 7.5pt`.
- **Weekly Schedule Timetable** (`525pt`):
  - Columns: TIME (`89pt`), Mon (`87pt`), Tue (`87pt`), Wed (`91pt`), Thu (`88pt`), Fri (`83pt`).
  - Font Size: `6.5pt - 7pt`.

### Official Signatories
- **Conforme**: `[Faculty Name]` — Faculty
- **Prepared by**: `JELLY L. PAREDES, EdD` — Program Chairperson
- **Approved**: `RAMY LLOYD L. LOTILLA, EdD` — Satellite College Director

---

## 3. Room Utilization (Institutional Format)
> Verified from: [`references/room-utilization-iso/ROOM UTILIZATION.docx`](file:///c:/Users/user/Desktop/New%20folder/scheduler/references/room-utilization-iso/ROOM%20UTILIZATION.docx)

### Page & Geometry
- **Paper Sizing**: Portrait Long/Folio (`12242 dxa × 18722 dxa` = `8.50 in × 13.00 in` / Legal - Letter compatible).
- **Margins**: Top = `0.63 in` (`45pt`), Right = `1.00 in` (`72pt`), Bottom = `1.00 in` (`72pt`), Left = `1.00 in` (`72pt`).
- **Table Width**: Fixed `492pt - 500pt` (`9832 dxa`).
- **Orientation**: Portrait (`mso-page-orientation: portrait;`).

### Typography & Fonts
- **Primary Typefaces**: `Arial, Helvetica, sans-serif` & `Times New Roman`.
- **University Header**:
  - `Republic of the Philippines` — `8pt`, Arial.
  - `CAPIZ STATE UNIVERSITY` — `13.5pt`, Bold, Navy (`#002060`).
  - `MAMBUSAO SATELLITE COLLEGE` — `9pt`, Bold, Navy (`#002060`).
  - Gold Accent Bar: `border-bottom: 2.5px solid #f2a900`.
- **Department Header**: `BACHELOR OF SCIENCE IN COMPUTER SCIENCE DEPARTMENT` — `10.5pt`, Bold, Royal Blue (`#2e5296`).
- **Subtitle & Academic Term**: `Room Utilization` (`10.5pt` Bold) | `First Semester, School Year 2026-2027` (`8.5pt`).
- **Room Badge**: `Room: [ROOM NAME]` — `9.5pt` Bold, `#ffff00` Yellow highlight with 1pt border.
- **Subjects Table** (`500pt`):
  - Columns: Subject (`60pt`), Description (`160pt`), Unit (`40pt`), Faculty (`145pt`), Course/Section (`95pt`).
  - Font Size: `7.5pt`, Arial.
- **Timetable Grid** (`500pt`):
  - Time column (`65pt`) + 5 Day columns (`87pt` each) = `500pt`.
  - Occupied Slots: Cyan `#00b0f0` highlight, `7pt` Bold.

### Official Signatories
- **Prepared by**: `CHERILYN G. VILLASIS` — Department Secretary
- **Noted**: `JELLY L. PAREDES, EdD` — Program Coordinator, BSCS
- **Approved**: `RAMY LLOYD L. LOTILLA, EdD` — Satellite College Director
