# Class Schedule Reference Guide (ISO 9001:2015: INS-CLS-08)

This directory contains layout specifications, templates, and storage folders for the official **ISO 9001:2015 Class Schedule (`INS-CLS-08`)**.

---

## 📁 Subdirectory Purpose

- **`print/`**: Drop your official scanned prints, PDF proof documents, or printed samples here.
  - *Example files*: `INS-CLS-08_Signed_BSCS_1A.pdf`, `Class_Schedule_Scan_2026.pdf`
- **`save-image/`**: Drop high-resolution PNG snapshots, mockups, or pixel-perfect layout verification images here.
  - *Example files*: `Class_Schedule_INS_CLS_08_Preview.png`
- **`word-docs/`**: Drop official institution `.docx` or `.doc` template files here.
  - Contains `sample_class_schedule_iso.doc` — a standalone editable Word file matching the code output.
- **`template_reference.html`**: Open this file directly in any browser (Chrome, Edge) to inspect the exact ISO HTML/CSS layout.

---

## 📐 Layout Specifications

| Property | Value |
| :--- | :--- |
| **Document Code** | `INS-CLS-08` |
| **Document Type** | DOCUMENTED INFORMATION |
| **Document Title** | CLASS SCHEDULE |
| **Revision No.** | `00` |
| **Effective Date** | June 25, 2018 |
| **Paper Orientation** | **Landscape** (US Letter: `11 in × 8.5 in`) |
| **Target Grid Width** | `700pt` to `720pt` fixed width (for Word) / `100%` container (for Web & Print) |
| **Primary Font** | `Times New Roman`, serif |
| **Time Blocks** | Fixed 8 blocks (7:00–8:30, 8:30–10:00, 10:00–11:30, 11:30–12:30 [Lunch], 12:30–2:00, 2:00–3:30, 3:30–5:00, 5:00–6:00) |
| **Signatories** | Program Chair (`Prepared by:`) & Campus Administrator (`Approved:`) |

---

## 🛠️ Associated Implementation Code
- React Component: [`src/components/PrintableSchedule/PrintableSchedule.jsx`](file:///c:/Users/user/Desktop/New%20folder/scheduler/src/components/PrintableSchedule/PrintableSchedule.jsx)
- Export Handler: `exportIsoToWord()` in [`src/utils/scheduleExportUtils.js`](file:///c:/Users/user/Desktop/New%20folder/scheduler/src/utils/scheduleExportUtils.js)
- UI Dropdown: [`src/pages/management/components/ExportOptions.jsx`](file:///c:/Users/user/Desktop/New%20folder/scheduler/src/pages/management/components/ExportOptions.jsx)

