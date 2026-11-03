# Faculty Workload Word Document References (`INS F22`)

Save Microsoft Word document templates (`.docx`, `.doc`) and layout references in this folder.

### 📝 Microsoft Word Architecture Standards
The export engine generates a standard Microsoft Office Word HTML+VML envelope that Microsoft Word opens directly:
- **Envelope Standard**: `xmlns:w="urn:schemas-microsoft-com:office:word"`
- **Orientation Tag**: `mso-page-orientation: portrait;`
- **Page Size**: `8.5in 11.0in;` (Letter Portrait)
- **Table Width**: Strict fixed `540pt` layout ensuring zero column clipping or wrapping issues in Microsoft Word.
- **Header Structure**: 4 rows, fixed-width columns (`80pt + 240pt + 110pt + 110pt = 540pt`).
- **Profile & Assignments Tables**: Standard 1pt solid black borders, Times New Roman typeface.

### Included Sample:
- `sample_faculty_workload_iso.doc`: A complete, standalone Word document ready to be opened in Microsoft Word. Double-click it in Windows File Explorer to verify formatting!

### 📥 Suggested File Names:
- `INS_F22_Official_Faculty_Workload_Template.docx`
- `Faculty_Workload_ISO_Word_Benchmark.doc`

