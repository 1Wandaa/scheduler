# Faculty Workload Reference Guide (ISO 9001:2015: INS F22)

This directory contains layout specifications, templates, and storage folders for the official **ISO 9001:2015 Faculty Workload (`INS F22`)**.

---

## 📁 Subdirectory Purpose

- **`print/`**: Drop your official scanned prints, signed faculty loading sheets, and PDF print proof documents here.
  - *Example files*: `INS_F22_Signed_Sample.pdf`, `Faculty_Workload_Scan_2026.pdf`
- **`save-image/`**: Drop high-resolution PNG snapshots, mockups, or pixel-perfect layout verification images here.
  - *Example files*: `Faculty_Workload_INS_F22_Preview.png`
- **`word-docs/`**: Drop official institution `.docx` or `.doc` template files here.
  - Contains `sample_faculty_workload_iso.doc` — an editable Word standard template matching the code output.
- **`template_reference.html`**: Open this file directly in any browser (Chrome, Edge) to inspect the exact ISO HTML/CSS layout.

---

## 📐 Layout Specifications

| Property | Value |
| :--- | :--- |
| **Document Code** | `INS F22` |
| **Document Type** | FORM |
| **Document Title** | FACULTY WORKLOAD |
| **Revision No.** | `00` |
| **Effective Date** | August 5, 2024 |
| **Paper Orientation** | **Portrait** (US Letter: `8.5 in × 11 in`) |
| **Target Grid Width** | `540pt` fixed width (for Word) / `100%` container (for Web & Print) |
| **Primary Font** | `Times New Roman`, serif |
| **Sections Included** | Header, Semester Title, Faculty Name, Profile Table, Teaching Assignments Table, Timetable, Signatories |
| **Signatories** | Concurred (Faculty), Verified (Program Chair), Recommending Approval (Dean), Approved (Campus Administrator) |

---

## 🛠️ Associated Implementation Code
- React Component: [`src/components/PrintableFacultyWorkload/PrintableFacultyWorkload.jsx`](file:///c:/Users/user/Desktop/New%20folder/scheduler/src/components/PrintableFacultyWorkload/PrintableFacultyWorkload.jsx)
- Workload Page Component: [`src/components/ProfessorWorkload/ProfessorWorkload.jsx`](file:///c:/Users/user/Desktop/New%20folder/scheduler/src/components/ProfessorWorkload/ProfessorWorkload.jsx)
- Export Handler: `exportFacultyWorkloadToWord()` in [`src/utils/scheduleExportUtils.js`](file:///c:/Users/user/Desktop/New%20folder/scheduler/src/utils/scheduleExportUtils.js)
- UI Dropdown: [`src/pages/management/components/ExportOptions.jsx`](file:///c:/Users/user/Desktop/New%20folder/scheduler/src/pages/management/components/ExportOptions.jsx)

