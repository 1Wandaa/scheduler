# Room Utilization Reference Guide (Institutional Quality Standard)

This directory contains layout specifications, templates, and storage folders for the official **Room Utilization Schedule**.

---

## 📁 Subdirectory Purpose

- **`print/`**: Drop your official scanned prints, room reservation sign-offs, and PDF print proof documents here.
  - *Example files*: `Room_Utilization_CL1_Signed.pdf`, `Room_Schedule_Print_Proof.pdf`
- **`save-image/`**: Drop high-resolution PNG snapshots, mockups, or color-calibrated layout images here.
  - *Example files*: `Room_Utilization_CL1_Preview.png`
- **`word-docs/`**: Drop official institution `.docx` or `.doc` template files here.
  - Contains `sample_room_utilization_iso.doc` — an editable Word standard template matching the code output.
- **`template_reference.html`**: Open this file directly in any browser (Chrome, Edge) to inspect the exact HTML/CSS layout.

---

## 📐 Layout Specifications

| Property | Value |
| :--- | :--- |
| **Document Title** | ROOM UTILIZATION |
| **Institution** | Republic of the Philippines / Capiz State University - Mambusao Satellite College |
| **Paper Orientation** | **Portrait** (US Letter: `8.5 in × 11 in`) |
| **Target Grid Width** | `560pt` fixed width (for Word) / `100%` container (for Web & Print) |
| **Primary Font** | `Arial`, sans-serif |
| **Header Accent** | Navy University title (`#002060`) with Gold bottom border (`#f2a900`) |
| **Room Badge** | Yellow highlight box (`#ffff00` background, 1px solid black border) |
| **Booked Slot Color** | Cyan highlight (`#00b0f0` background) |
| **Timetable Time Span** | 7:00 AM – 6:00 PM (30-minute intervals) |
| **Signatories** | Prepared by (Program Chair), Noted by (Dean / Dept Chair), Approved (Campus Administrator) |

---

## 🛠️ Associated Implementation Code
- React Component: [`src/components/PrintableRoomUtilization/PrintableRoomUtilization.jsx`](file:///c:/Users/user/Desktop/New%20folder/scheduler/src/components/PrintableRoomUtilization/PrintableRoomUtilization.jsx)
- Export Handler: `exportRoomUtilizationToWord()` in [`src/utils/scheduleExportUtils.js`](file:///c:/Users/user/Desktop/New%20folder/scheduler/src/utils/scheduleExportUtils.js)
- UI Dropdown: [`src/pages/management/components/ExportOptions.jsx`](file:///c:/Users/user/Desktop/New%20folder/scheduler/src/pages/management/components/ExportOptions.jsx)

