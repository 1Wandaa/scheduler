# Room Utilization Word Document References

Save Microsoft Word document templates (`.docx`, `.doc`) and layout references in this folder.

### 📝 Microsoft Word Architecture Standards
The export engine generates a standard Microsoft Office Word HTML+VML envelope that Microsoft Word opens directly:
- **Envelope Standard**: `xmlns:w="urn:schemas-microsoft-com:office:word"`
- **Orientation Tag**: `mso-page-orientation: portrait;`
- **Page Size**: `8.5in 11.0in;` (Letter Portrait)
- **Table Width**: Strict fixed `560pt` layout ensuring 1-page portrait fit in Microsoft Word.
- **Color Preservation**: Background colors encoded via standard inline CSS `background-color` and `bgcolor` attributes for MS Word rendering.
- **Timetable Geometry**: Fixed column widths: Time column `80pt`, 5 Day columns `96pt` each (`80 + 5 × 96 = 560pt`).

### Included Sample:
- `sample_room_utilization_iso.doc`: A complete, standalone Word document ready to be opened in Microsoft Word. Double-click it in Windows File Explorer to verify formatting!

### 📥 Suggested File Names:
- `Room_Utilization_Official_Template.docx`
- `Room_Utilization_Word_Benchmark.doc`

