# Class Schedule Word Document References (`INS-CLS-08`)

Save Microsoft Word document templates (`.docx`, `.doc`) and layout references in this folder.

### 📝 Microsoft Word Architecture Standards
The export engine generates a standard Microsoft Office Word HTML+VML envelope that Microsoft Word opens directly:
- **Envelope Standard**: `xmlns:w="urn:schemas-microsoft-com:office:word"`
- **Orientation Tag**: `mso-page-orientation: landscape;`
- **Page Size**: `11.0in 8.5in;` (Letter Landscape)
- **Table Width**: Fixed `700pt` to `720pt` layout to avoid Word's automatic table stretching.
- **Header Structure**: Fixed 5-column grid (`90pt + 110pt + 280pt + 110pt + 110pt = 700pt`).
- **Timetable Grid**: Fixed 6-column grid (`110pt + 5 × 118pt = 700pt`).

### Included Sample:
- `sample_class_schedule_iso.doc`: A complete, standalone Word document ready to be opened in Microsoft Word. Double-click it in Windows File Explorer to verify formatting!

### 📥 Suggested File Names:
- `INS_CLS_08_Official_Admin_Template.docx`
- `Class_Schedule_ISO_Word_Benchmark.doc`

