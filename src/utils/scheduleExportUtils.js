/**
 * scheduleExportUtils.js
 * Advanced export engine for class schedules into editable Microsoft Word (.doc) and Excel (.xls)
 * Both ISO 9001:2015 and Ordinary Grid formats use strict 700pt fixed-point geometry
 * ensuring 100% symmetrical, non-stretched, 1-page fit.
 */

import { toast } from 'sonner';
import { logActivity, LOG_ACTIONS } from './activityLogger';
import { getMeetingTimeLabel, parseTimeToMinutes } from './scheduleUtils';

/**
 * Downloads content as a file with a given MIME type
 */
function downloadFile(content, fileName, mimeType) {
  const blob = new Blob(['\ufeff' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Converts a local image URL to base64 Data URI for standalone embedding in Word/Excel
 */
async function getImageAsBase64(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
}

/**
 * Wraps HTML content into Microsoft Word Document standard envelope with Landscape Letter page formatting
 * Uses strict fixed-width layout (700pt total) to prevent column distortion.
 */
function wrapWordHtml(bodyHtml, title = 'Class Schedule') {
  return `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>${title}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 11.0in 8.5in; /* 792pt x 612pt landscape */
      mso-page-orientation: landscape;
      margin: 0.15in 0.25in 0.15in 0.25in;
      mso-header-margin: 0in;
      mso-footer-margin: 0in;
      mso-paper-source: 0;
    }
    div.Section1 {
      page: Section1;
      width: 720pt;
      margin: 0 auto;
    }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 6pt;
      line-height: 1.0;
      color: #000000;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      mso-pagination: none;
    }
    p, p.MsoNormal, div, h1, h2, h3 {
      margin: 0;
      padding: 0;
      line-height: 1.0;
      mso-pagination: none;
      mso-line-height-rule: exactly;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
      mso-table-bspace: 0pt;
      mso-table-tspace: 0pt;
      width: 720pt;
      table-layout: fixed;
      page-break-inside: avoid;
      mso-padding-alt: 0pt;
      margin: 0;
    }
    tr {
      mso-height-rule: exactly;
      page-break-inside: avoid;
    }
    .iso-header-table, .grid-header-table {
      width: 720pt;
      border-collapse: collapse;
      border: 1.0pt solid #000000;
      margin-bottom: 1pt;
      table-layout: fixed;
    }
    .iso-header-table td, .iso-header-table th, .grid-header-table td, .grid-header-table th {
      border: 1.0pt solid #000000;
      padding: 1pt 2.5pt;
      font-family: "Times New Roman", Times, serif;
      vertical-align: middle;
    }
    .meta-table {
      width: 700pt;
      border: none;
      margin-bottom: 1pt;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .meta-table td {
      border: none;
      padding: 0.5pt 0;
      font-family: "Times New Roman", Times, serif;
      font-size: 9pt;
      font-weight: bold;
    }
    .meta-value {
      font-weight: normal;
      text-decoration: underline;
    }
    .summary-section {
      width: 700pt;
      margin: 0.5pt 0 1pt 0;
      text-align: center;
    }
    .summary-table {
      width: 700pt;
      border-collapse: collapse;
      border: 1.0pt solid #000000;
      margin-bottom: 1pt;
      table-layout: fixed;
    }
    .summary-table th, .summary-table td {
      border: 1.0pt solid #000000;
      padding: 0.5pt 1.5pt;
      font-family: "Times New Roman", Times, serif;
      font-size: 5.5pt;
      line-height: 1.0;
      vertical-align: middle;
    }
    .summary-table th {
      background-color: #f2f2f2;
      font-weight: bold;
      height: 8.5pt;
    }
    .iso-schedule-table, .ordinary-schedule-table {
      width: 700pt;
      border-collapse: collapse;
      border: 1.0pt solid #000000;
      table-layout: fixed;
      margin-bottom: 1pt;
    }
    .iso-schedule-table th, .iso-schedule-table td, .ordinary-schedule-table th, .ordinary-schedule-table td {
      border: 1.0pt solid #000000;
      padding: 0.5pt 1.5pt;
      text-align: center;
      vertical-align: middle;
      font-family: "Times New Roman", Times, serif;
      box-sizing: border-box;
      overflow: hidden;
    }
    .iso-schedule-table th, .ordinary-schedule-table th {
      background-color: #f2f2f2;
      font-weight: bold;
      font-size: 10pt;
      height: 16pt;
    }
    .time-cell {
      font-weight: bold;
      font-size: 6pt;
      white-space: nowrap;
      background-color: #f8fafc;
    }
    .lunch-break {
      background-color: #d1d5db;
      font-weight: bold;
      letter-spacing: 2pt;
      font-size: 6pt;
      text-align: center;
      height: 10pt;
      padding: 0.5pt;
    }
    .signatures-table {
      width: 700pt;
      border: none;
      margin-top: 4pt;
      border-collapse: collapse;
      table-layout: fixed;
      page-break-inside: avoid;
      page-break-after: avoid;
    }
    .signatures-table td {
      border: none;
      padding: 0 10pt;
      font-family: "Times New Roman", Times, serif;
      font-size: 5.5pt;
      line-height: 1.0;
      vertical-align: top;
    }
    .bold { font-weight: bold; }
    .center { text-align: center; }
  </style>
</head>
<body>
  <div class="Section1">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

/**
 * Wraps HTML content into Microsoft Word Document standard envelope with Portrait Letter page formatting
 * Uses strict fixed-width layout (570pt total) and portrait geometry for 1-page fit.
 */
function wrapPortraitWordHtml(bodyHtml, title = 'Room Utilization Schedule') {
  return `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>${title}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 8.5in 11.0in; /* Portrait letter: 612pt x 792pt */
      mso-page-orientation: portrait;
      margin: 0.1in 0.35in 0.1in 0.35in;
      mso-header-margin: 0in;
      mso-footer-margin: 0in;
      mso-paper-source: 0;
    }
    div.Section1 {
      page: Section1;
      width: 560pt;
      margin: 0 auto;
    }
    body {
      font-family: Arial, Helvetica, sans-serif !important;
      font-size: 8.5pt;
      line-height: 1.0;
      color: #000000;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      mso-pagination: none;
    }
    p, p.MsoNormal, div, h1, h2, h3, h4, h5, h6 {
      margin: 0;
      padding: 0;
      line-height: 1.0;
      font-family: Arial, Helvetica, sans-serif !important;
      mso-pagination: none;
      mso-line-height-rule: exactly;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
      mso-table-bspace: 0pt;
      mso-table-tspace: 0pt;
      table-layout: fixed;
      page-break-inside: avoid;
      mso-padding-alt: 0pt;
      margin: 0 auto;
      font-family: Arial, Helvetica, sans-serif !important;
    }
    table.room-util-timetable-grid {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
      border: 1.0pt solid #000000;
      mso-border-alt: solid #000000 1.0pt;
    }
    table.room-util-signatures-table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
      border: 0.5pt solid #ffffff;
      mso-border-alt: solid #ffffff 0.5pt;
    }
    table.room-util-signatures-table td {
      border: 0.5pt solid #ffffff;
      mso-border-alt: solid #ffffff 0.5pt;
      vertical-align: top;
      padding: 0 4pt;
      overflow: visible;
    }
    table.room-util-signatures-table p {
      margin: 0;
      padding: 0;
      line-height: 1.25;
      mso-line-height-rule: at-least;
    }
    tr {
      mso-height-rule: at-least;
      page-break-inside: avoid;
    }
    td, th {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    table.room-util-timetable-grid td {
      overflow: visible;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
  </style>
</head>
<body>
  <div class="Section1">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

/**
 * Wraps Faculty Workload HTML into Microsoft Word document standard envelope with Portrait Letter page formatting.
 * Uses strict fixed-width layout (540pt total) and Times New Roman typography to prevent distortion.
 */
function wrapFacultyWorkloadWordHtml(bodyHtml, title = 'Faculty Workload') {
  return `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>${title}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 8.5in 11.0in; /* Portrait letter: 612pt x 792pt */
      mso-page-orientation: portrait;
      margin: 0.25in 0.35in 0.25in 0.35in;
      mso-header-margin: 0in;
      mso-footer-margin: 0in;
      mso-paper-source: 0;
    }
    div.Section1 {
      page: Section1;
      width: 540pt;
      margin: 0 auto;
    }
    body {
      font-family: "Times New Roman", Times, serif !important;
      font-size: 8pt;
      line-height: 1.15;
      color: #000000;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      mso-pagination: none;
    }
    p, p.MsoNormal, div, h1, h2, h3, h4, h5, h6 {
      margin: 0;
      padding: 0;
      line-height: 1.15;
      font-family: "Times New Roman", Times, serif !important;
      mso-pagination: none;
      mso-line-height-rule: exactly;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
      mso-table-bspace: 0pt;
      mso-table-tspace: 0pt;
      table-layout: fixed;
      page-break-inside: avoid;
      mso-padding-alt: 0pt;
      margin: 0 auto;
      width: 540pt;
    }
    td, th {
      font-family: "Times New Roman", Times, serif !important;
      border: 1.0pt solid #000000;
      vertical-align: middle;
      text-align: center;
      padding: 1.5pt 2pt;
    }
    .fw-bold {
      font-weight: bold;
    }
    .fw-left {
      text-align: left;
    }
    .fw-right {
      text-align: right;
    }
    .fw-center {
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="Section1">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

/**
 * Wraps HTML content into Microsoft Excel format
 */
function wrapExcelHtml(bodyHtml, title = 'Class Schedule') {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${title.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 30)}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    table { border-collapse: collapse; font-family: "Calibri", sans-serif; font-size: 9pt; }
    th, td { border: 0.5pt solid #000000; padding: 3px 6px; vertical-align: middle; }
    th { background-color: #e2e8f0; font-weight: bold; text-align: center; }
    .bold { font-weight: bold; }
    .center { text-align: center; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

/**
 * Builds the pure, FIXED-GEOMETRY 1-PAGE Microsoft Word table for the ISO 9001:2015 Schedule
 */
export async function exportIsoToWord(user) {
  const isoDoc = document.querySelector('.printable-iso-document');
  if (!isoDoc) {
    toast.error('Could not locate printable ISO schedule. Please select a section or department first.');
    return;
  }

  // 1. Fetch base64 logo if possible
  const logoBase64 = await getImageAsBase64('/download.jpg') || await getImageAsBase64('/capsu-logo.jpg') || await getImageAsBase64('/logo.png');

  // 2. Extract Meta values from the DOM
  const metaTextDivs = isoDoc.querySelectorAll('.meta-info > div');
  let col1Html = 'DEGREE PROGRAM: <span class="meta-value">BACHELOR OF SCIENCE IN COMPUTER SCIENCE</span>';
  let col2Html = 'COURSE &amp; YEAR: <span class="meta-value">BSCS 4C</span>';
  let col3Html = 'SEMESTER &amp; AY: <span class="meta-value">1ST Sem 2025-2026</span>';

  if (metaTextDivs.length >= 3) {
    col1Html = metaTextDivs[0].innerHTML;
    col2Html = metaTextDivs[1].innerHTML;
    col3Html = metaTextDivs[2].innerHTML;
  }

  // 3. Extract Signatures
  let prepName = 'PROF. PROGRAM CHAIR';
  let prepTitle = 'Program Chair';
  let appName = 'RAMY LLOYD LOTILLA, EdD';
  let appTitle = 'Campus Administrator';

  const sigBlocks = isoDoc.querySelectorAll('.printable-iso-document > div:last-child > div');
  if (sigBlocks.length >= 2) {
    const pLines = sigBlocks[0].querySelectorAll('div');
    if (pLines.length >= 3) {
      prepName = pLines[1].textContent.trim();
      prepTitle = pLines[2].textContent.trim();
    }
    const aLines = sigBlocks[1].querySelectorAll('div');
    if (aLines.length >= 3) {
      appName = aLines[1].textContent.trim();
      appTitle = aLines[2].textContent.trim();
    }
  }

  // 4. Build ISO Header Table (Exact 700pt fixed width: 90 + 110 + 280 + 110 + 110 = 700pt)
  const logoHtml = logoBase64 
    ? `<img src="${logoBase64}" width="40" height="40" style="display: block; margin: 0 auto;" alt="Logo" />`
    : `<p align="center" style="font-weight: bold; font-size: 8.5pt; color: #1e3a8a; margin: 0;">CapSU</p><p align="center" style="font-size: 6pt; font-weight: bold; margin: 0;">Capiz State University</p>`;

  const headerTableHtml = `
    <table class="iso-header-table" border="1" bordercolor="#000000" cellspacing="0" cellpadding="2">
      <colgroup>
        <col width="90" style="width: 90pt;">
        <col width="110" style="width: 110pt;">
        <col width="280" style="width: 280pt;">
        <col width="110" style="width: 110pt;">
        <col width="110" style="width: 110pt;">
      </colgroup>
      <tr>
        <td rowspan="4" align="center" valign="middle" width="90" style="width: 90pt; text-align: center; vertical-align: middle; padding: 1pt;">
          ${logoHtml}
        </td>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 9pt;">Document Type:</td>
        <td rowspan="2" align="center" valign="middle" width="280" style="width: 280pt; font-weight: bold; font-size: 11pt; text-align: center; vertical-align: middle;">
          DOCUMENTED INFORMATION
        </td>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 9pt;">Document Code</td>
        <td width="110" style="width: 110pt; font-size: 9pt;">INS-CLS-08</td>
      </tr>
      <tr>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 9pt;">ISO 9001:2015</td>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 9pt;">Revision No.</td>
        <td width="110" style="width: 110pt; font-size: 9pt;">00</td>
      </tr>
      <tr>
        <td rowspan="2" width="110" style="width: 110pt; font-weight: bold; font-size: 9pt;">Document Title:</td>
        <td rowspan="2" align="center" valign="middle" width="280" style="width: 280pt; font-weight: bold; font-size: 12pt; text-align: center; vertical-align: middle;">
          CLASS SCHEDULE
        </td>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 9pt;">Effective Date</td>
        <td width="110" style="width: 110pt; font-size: 9pt;">June 25, 2018</td>
      </tr>
      <tr>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 9pt;">Page</td>
        <td width="110" style="width: 110pt; font-size: 9pt;">1 of 1</td>
      </tr>
    </table>
  `;

  // 5. Build Meta Table (Exact 700pt fixed width: 280 + 220 + 200 = 700pt)
  const metaTableHtml = `
    <table class="meta-table" border="0" cellspacing="0" cellpadding="1">
      <colgroup>
        <col width="280" style="width: 280pt;">
        <col width="220" style="width: 220pt;">
        <col width="200" style="width: 200pt;">
      </colgroup>
      <tr>
        <td align="left" width="280" style="width: 280pt; text-align: left;">
          ${col1Html}
        </td>
        <td align="center" width="220" style="width: 220pt; text-align: center;">
          ${col2Html}
        </td>
        <td align="right" width="200" style="width: 200pt; text-align: right;">
          ${col3Html}
        </td>
      </tr>
    </table>
  `;

  // 6. Build Schedule Grid Table based on main timetable geometry (Exact 700pt fixed width)
  const originalTable = isoDoc.querySelector('.iso-schedule-table');
  let scheduleTableHtml = '';

  if (originalTable) {
    const cloneTable = originalTable.cloneNode(true);

    const ths = cloneTable.querySelectorAll('thead th');
    const dayCount = ths.length > 1 ? ths.length - 1 : 5;
    const timeWidth = 75;
    const dayWidth = (700 - timeWidth) / dayCount;

    // Apply strict column widths on header
    if (ths.length > 0) {
      ths[0].setAttribute('width', `${timeWidth}`);
      ths[0].style.width = `${timeWidth}pt`;
      ths[0].style.fontSize = '8pt';
      ths[0].style.height = '14pt';

      for (let i = 1; i < ths.length; i++) {
        ths[i].setAttribute('width', `${dayWidth}`);
        ths[i].style.width = `${dayWidth}pt`;
        ths[i].style.fontSize = '8pt';
        ths[i].style.height = '14pt';
      }
    }

    const tbodyRows = cloneTable.querySelectorAll('tbody tr');
    const totalRows = tbodyRows.length || 22;
    // Allocate ~350pt for table body so all rows + header + signatures fit strictly on 1 landscape page
    const dynamicRowHeight = Math.max(11, Math.min(16, Math.floor(350 / totalRows)));

    // Transform cell contents to crisp, fixed-width Word cells
    tbodyRows.forEach(tr => {
      tr.style.height = `${dynamicRowHeight}pt`;
      tr.style.msoHeightRule = 'exactly';

      const isHourRow = tr.classList.contains('hour-row');
      const isHalfHourRow = tr.classList.contains('half-hour-row');

      const tds = tr.querySelectorAll('td');
      tds.forEach((td) => {
        if (td.classList.contains('time-cell')) {
          td.setAttribute('width', `${timeWidth}`);
          td.style.width = `${timeWidth}pt`;
          td.style.fontSize = '7pt';
          td.style.fontWeight = 'bold';
          td.style.border = '1.0pt solid #000000';
          td.setAttribute('align', 'center');
          td.setAttribute('valign', 'middle');
        } else if (td.classList.contains('lunch-break-cell')) {
          td.setAttribute('width', `${dayWidth * dayCount}`);
          td.style.width = `${dayWidth * dayCount}pt`;
          td.style.fontSize = '8pt';
          td.style.fontWeight = 'bold';
          td.style.letterSpacing = '2pt';
          td.style.border = '1.0pt solid #000000';
          td.setAttribute('align', 'center');
          td.setAttribute('valign', 'middle');
          td.innerHTML = '<p style="font-weight: bold; font-size: 8pt; letter-spacing: 2pt; margin: 0; padding: 0; text-align: center; color: #000000;">LUNCH BREAK</p>';
        } else {
          td.setAttribute('width', `${dayWidth}`);
          td.style.width = `${dayWidth}pt`;

          const isScheduled = td.classList.contains('scheduled-cell');
          if (isScheduled) {
            td.style.border = '1.0pt solid #000000';
          } else {
            if (isHourRow) {
              td.style.borderBottom = '1px solid #ffffff';
            }
            if (isHalfHourRow) {
              td.style.borderTop = '1px solid #ffffff';
            }
          }

          const subj = td.querySelector('.cell-subject')?.textContent.trim() || '';
          const prof = td.querySelector('.cell-professor')?.textContent.trim() || '';
          const room = td.querySelector('.cell-room')?.textContent.trim() || '';

          if (subj || prof || room) {
            td.innerHTML = `
              <p style="font-weight: bold; font-size: 7.5pt; margin: 0; padding: 0; text-align: center; color: #000000; line-height: 1.1;">${subj}</p>
              ${prof ? `<p style="font-size: 6.5pt; margin: 0.5pt 0 0 0; padding: 0; text-align: center; color: #111827; line-height: 1.1;">${prof}</p>` : ''}
              ${room ? `<p style="font-size: 6.5pt; margin: 0.5pt 0 0 0; padding: 0; text-align: center; color: #374151; line-height: 1.1;">${room}</p>` : ''}
            `;
          } else {
            td.innerHTML = '';
          }
          td.setAttribute('align', 'center');
          td.setAttribute('valign', 'middle');
        }
      });
    });

    cloneTable.setAttribute('border', '1');
    cloneTable.setAttribute('bordercolor', '#000000');
    cloneTable.setAttribute('cellspacing', '0');
    cloneTable.setAttribute('cellpadding', '1');
    cloneTable.className = 'iso-schedule-table';
    cloneTable.style.borderCollapse = 'collapse';

    // Insert Colgroup for Word
    const colgroup = document.createElement('colgroup');
    let colsHtml = `<col width="${timeWidth}" style="width: ${timeWidth}pt;">`;
    for (let i = 0; i < dayCount; i++) {
      colsHtml += `<col width="${dayWidth}" style="width: ${dayWidth}pt;">`;
    }
    colgroup.innerHTML = colsHtml;
    cloneTable.insertBefore(colgroup, cloneTable.firstChild);

    scheduleTableHtml = cloneTable.outerHTML;
  }

  // 7. Build Signatures Table (Exact 700pt fixed width: 350 + 350 = 700pt)
  const signaturesTableHtml = `
    <table class="signatures-table" border="0" cellspacing="0" cellpadding="1" style="page-break-inside: avoid; page-break-after: avoid; margin-top: 4pt;">
      <colgroup>
        <col width="350" style="width: 350pt;">
        <col width="350" style="width: 350pt;">
      </colgroup>
      <tr>
        <td width="350" style="width: 350pt; text-align: left; vertical-align: top; padding: 0 10pt;">
          <p style="margin: 0 0 3pt 0; font-size: 10pt;">Prepared by:</p>
          <p style="margin: 0; font-weight: bold; text-decoration: underline; font-size: 11pt;">${prepName}</p>
          <p style="margin: 0.5pt 0 0 0; font-size: 10pt;">${prepTitle}</p>
        </td>
        <td width="350" style="width: 350pt; text-align: left; padding-left: 30pt; vertical-align: top;">
          <p style="margin: 0 0 3pt 0; font-size: 10pt;">Approved:</p>
          <p style="margin: 0; font-weight: bold; text-decoration: underline; font-size: 11pt;">${appName}</p>
          <p style="margin: 0.5pt 0 0 0; font-size: 10pt;">${appTitle}</p>
        </td>
      </tr>
    </table>
  `;

  // Assemble full document body
  const fullHtml = `
    ${headerTableHtml}
    ${metaTableHtml}
    ${scheduleTableHtml}
    ${signaturesTableHtml}
  `;

  const metaText = isoDoc.querySelector('.meta-info')?.textContent || 'Schedule';
  const cleanFileTag = metaText.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  const fileName = `ISO_Schedule_${cleanFileTag || 'Export'}_${Date.now()}.doc`;

  const wordDocument = wrapWordHtml(fullHtml, `ISO Class Schedule`);
  downloadFile(wordDocument, fileName, 'application/msword;charset=utf-8');

  logActivity({
    user,
    action: LOG_ACTIONS.EXPORT,
    details: `Exported fixed-layout 1-page ISO schedule to editable Word document: ${fileName}`
  });

  toast.success('Downloaded 1-page editable Word document (.doc)!');
}

/**
 * Export Room Utilization Schedule to fixed-geometry 1-Page Microsoft Word (.doc)
 * Guaranteed to fit on exactly 1 Portrait Letter page when printed, saved, or converted to .docx.
 */
export async function exportRoomUtilizationToWord(user) {
  try {
    const roomDoc = document.querySelector('.printable-room-utilization');
    if (!roomDoc) {
      toast.error('Could not locate printable Room Utilization schedule. Please select a room first.');
      return;
    }

    // 1. Fetch base64 logo if possible
    const logoBase64 = await getImageAsBase64('/download.jpg') || await getImageAsBase64('/capsu-logo.jpg') || await getImageAsBase64('/logo.png');

    // 2. Build Header (pure paragraph + float image, ZERO tables so Word CANNOT draw any dashed gridlines)
    const headerHtml = `
      <div style="width: 560pt; margin: 0 auto 2pt auto; border-bottom: 2.0pt solid #f2a900; padding-bottom: 1pt;">
        ${logoBase64 ? `<img src="${logoBase64}" width="30" height="30" align="left" hspace="6" vspace="0" style="float: left; margin-right: 6pt;" alt="CapSU" />` : ''}
        <div style="font-family: Arial, Helvetica, sans-serif;">
          <div style="font-size: 7.5pt; color: #000000; line-height: 8.5pt;">Republic of the Philippines</div>
          <div style="font-size: 11.5pt; font-weight: bold; color: #002060; letter-spacing: 0.5pt; line-height: 13pt;">CAPIZ STATE UNIVERSITY</div>
          <div style="font-size: 7.5pt; font-weight: bold; color: #002060; line-height: 8.5pt;">MAMBUSAO SATELLITE COLLEGE</div>
        </div>
        <div style="clear: both; font-size: 1pt; line-height: 1pt;">&nbsp;</div>
      </div>
    `;

    // 3. Titles Section (compact, perfectly aligned)
    const deptName = roomDoc.querySelector('.room-util-titles h2')?.textContent.trim() || 'DEPARTMENT';
    const titleText = roomDoc.querySelector('.room-util-titles h3')?.textContent.trim() || 'Room Utilization';
    const semText = roomDoc.querySelector('.room-util-titles p')?.textContent.trim() || 'First Semester, School Year 2026-2027';
    const titlesHtml = `
      <div style="text-align: center; margin-bottom: 2pt;">
        <div style="font-family: Arial, sans-serif; color: #2e5296; font-size: 8.5pt; font-weight: bold; text-transform: uppercase; line-height: 10pt;">${deptName}</div>
        <div style="font-family: Arial, sans-serif; font-size: 9.5pt; font-weight: bold; line-height: 11pt; margin-top: 1pt;">${titleText}</div>
        <div style="font-family: Arial, sans-serif; font-size: 7pt; line-height: 8.5pt; margin-top: 1pt;">${semText}</div>
      </div>
    `;

    // 4. Room Badge
    const roomBadgeText = roomDoc.querySelector('.room-util-room-name')?.textContent.trim() || 'Room: N/A';
    const roomBadgeHtml = `
      <div style="margin-bottom: 2pt;">
        <span style="font-family: Arial, sans-serif; font-size: 7.5pt; font-weight: bold; background-color: #ffff00; border: 1.0pt solid #000000; padding: 0.5pt 4pt; display: inline-block;">${roomBadgeText}</span>
      </div>
    `;

    // 5. Subjects Table (560pt width, solid 1.0pt borders, compact rows)
    const srcSubjTable = roomDoc.querySelector('.room-util-subjects');
    let subjTableHtml = '';
    if (srcSubjTable) {
      const rows = Array.from(srcSubjTable.querySelectorAll('tr'));
      subjTableHtml = `
        <table border="1" bordercolor="#000000" cellspacing="0" cellpadding="0" style="width: 560pt; border-collapse: collapse; table-layout: fixed; margin-bottom: 2pt; border: 1.0pt solid #000000; mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
          <colgroup>
            <col width="75" style="width: 75pt;">
            <col width="205" style="width: 205pt;">
            <col width="40" style="width: 40pt;">
            <col width="120" style="width: 120pt;">
            <col width="120" style="width: 120pt;">
          </colgroup>
          ${rows.map((tr, rIdx) => {
            const isHead = rIdx === 0;
            const cells = Array.from(tr.children);
            const rowHeight = isHead ? 11 : 9.5;
            return `
              <tr style="height: ${rowHeight}pt; mso-height-rule: at-least; page-break-inside: avoid;">
                ${cells.map((cell, cIdx) => {
                  const colSpan = cell.getAttribute('colspan') || '1';
                  const isHeaderCell = cell.tagName === 'TH' || isHead;
                  const isDesc = !isHeaderCell && cIdx === 1 && colSpan === '1';
                  const bg = isHeaderCell ? 'background-color: #f2f2f2;' : '';
                  const weight = isHeaderCell || cell.style.fontWeight === 'bold' ? 'font-weight: bold;' : '';
                  const align = isDesc ? 'text-align: left; padding: 0.5pt 3pt;' : 'text-align: center; padding: 0.5pt 1pt;';
                  return `
                    <${cell.tagName.toLowerCase()} colspan="${colSpan}" style="border: 1.0pt solid #000000; font-family: Arial, sans-serif; font-size: 6.5pt; vertical-align: middle; line-height: 1.1; ${align} ${bg} ${weight}">
                      ${cell.innerHTML}
                    </${cell.tagName.toLowerCase()}>
                  `;
                }).join('')}
              </tr>
            `;
          }).join('')}
        </table>
      `;
    }

    // 6. Timetable Grid: 14pt per slot (= 28pt/hour), compact, fits 100% on Page 1
    const srcTimetable = roomDoc.querySelector('.room-util-timetable');
    let timetableHtml = '';
    if (srcTimetable) {
      const ths = Array.from(srcTimetable.querySelectorAll('thead th'));
      const totalCols = ths.length || 7;
      const timetableWidth = 560;
      const timeColWidth = 56;
      const dayCount = totalCols > 1 ? totalCols - 1 : 6;
      const dayColWidth = Math.floor((timetableWidth - timeColWidth) / dayCount);
      const lastDayColWidth = timetableWidth - timeColWidth - (dayColWidth * (dayCount - 1));

      const bodyRows = Array.from(srcTimetable.querySelectorAll('tbody tr'));
      const totalRows = bodyRows.length || 22;
      const slotHeight = 14; // 14pt per slot = 28pt per hour: guarantees complete Page 1 fit

      // Build complete 2D matrix [totalRows][totalCols] from DOM
      const gridMatrix = [];
      for (let r = 0; r < totalRows; r++) {
        gridMatrix[r] = new Array(totalCols).fill(null);
      }

      const occupiedUntil = new Array(totalCols).fill(-1);

      bodyRows.forEach((tr, rIdx) => {
        let cellChildIdx = 0;
        for (let cIdx = 0; cIdx < totalCols; cIdx++) {
          if (occupiedUntil[cIdx] >= rIdx) {
            continue;
          }

          const td = tr.children[cellChildIdx++];
          if (!td) continue;

          const rowSpan = parseInt(td.getAttribute('rowspan') || '1', 10);
          const isTime = td.classList.contains('time-cell') || td.classList.contains('time-col') || cIdx === 0;
          const isScheduled = td.classList.contains('scheduled-cell') || td.classList.contains('cell-scheduled');

          const classesList = [];
          if (isScheduled) {
            const contentBlocks = Array.from(td.querySelectorAll('.cell-content'));
            if (contentBlocks.length > 0) {
              contentBlocks.forEach(blk => {
                const lines = Array.from(blk.querySelectorAll('.cell-line'));
                let subj = '';
                let comp = '';
                let prof = '';
                let rm = '';
                let sec = '';
                if (lines.length > 0) {
                  const l0 = lines[0];
                  const span = l0.querySelector('span');
                  if (span) {
                    comp = span.textContent.trim();
                    subj = l0.textContent.replace(comp, '').trim();
                  } else {
                    subj = l0.textContent.trim();
                  }
                }
                if (lines.length > 1) prof = lines[1].textContent.trim();
                if (lines.length > 2) rm = lines[2].textContent.trim();
                if (lines.length > 3) sec = lines[3].textContent.trim();
                classesList.push({ subj, comp, prof, rm, sec });
              });
            } else {
              const lines = Array.from(td.querySelectorAll('.cell-line'));
              if (lines.length > 0) {
                const subj = lines[0]?.textContent.trim() || '';
                const prof = lines[1]?.textContent.trim() || '';
                const rm = lines[2]?.textContent.trim() || '';
                const sec = lines[3]?.textContent.trim() || '';
                classesList.push({ subj, comp: '', prof, rm, sec });
              } else {
                classesList.push({ subj: td.textContent.trim(), comp: '', prof: '', rm: '', sec: '' });
              }
            }
          }

          const timeLabel = isTime ? td.textContent.trim() : '';

          for (let s = 0; s < rowSpan; s++) {
            const targetRow = rIdx + s;
            if (targetRow < totalRows) {
              gridMatrix[targetRow][cIdx] = {
                isTime,
                isScheduled,
                timeLabel,
                classesList,
                spanOffset: s,
                totalSpan: rowSpan,
                isHead: s === 0
              };
            }
          }

          occupiedUntil[cIdx] = rIdx + rowSpan - 1;
        }
      });

      const colgroupHtml = `
        <colgroup>
          <col width="${timeColWidth}" style="width: ${timeColWidth}pt;">
          ${ths.slice(1).map((_, idx) => {
            const w = idx === dayCount - 1 ? lastDayColWidth : dayColWidth;
            return `<col width="${w}" style="width: ${w}pt;">`;
          }).join('')}
        </colgroup>
      `;

      const theadHtml = `
        <thead>
          <tr style="height: 12pt; mso-height-rule: at-least; page-break-inside: avoid;">
            ${ths.map((th, idx) => {
              const w = idx === 0 ? timeColWidth : (idx === totalCols - 1 ? lastDayColWidth : dayColWidth);
              return `
                <th width="${w}" style="width: ${w}pt; border: 1.0pt solid #000000; mso-border-alt: solid #000000 1.0pt; padding: 1pt 1pt; font-size: 7pt; font-weight: bold; text-align: center; vertical-align: middle; background-color: #f2f2f2; font-family: Arial, Helvetica, sans-serif; line-height: 8.5pt;">
                  ${th.textContent.trim()}
                </th>
              `;
            }).join('')}
          </tr>
        </thead>
      `;

      const coveredUntil = new Array(totalCols).fill(-1);
      const rowsHtml = [];

      for (let r = 0; r < totalRows; r++) {
        const cellsHtml = [];

        // Col 0: Time cell (merges 2 slots into 1-hour display block)
        if (r % 2 === 0) {
          const timeCellData = gridMatrix[r] ? gridMatrix[r][0] : null;
          const timeLabel = timeCellData?.timeLabel || '';
          const timeSpan = (r + 1 < totalRows) ? 2 : 1;
          coveredUntil[0] = r + timeSpan - 1;
          const timeHeight = slotHeight * timeSpan;

          cellsHtml.push(`
            <td rowspan="${timeSpan}" width="${timeColWidth}" style="width: ${timeColWidth}pt; height: ${timeHeight}pt; mso-height-rule: at-least; border: 1.0pt solid #000000; mso-border-alt: solid #000000 1.0pt; background-color: #f8fafc; font-size: 6.5pt; font-weight: bold; text-align: center; vertical-align: middle; font-family: Arial, Helvetica, sans-serif; padding: 0 1pt; line-height: 8pt;">
              ${timeLabel}
            </td>
          `);
        }

        // Cols 1..6: Days (Monday to Saturday)
        for (let c = 1; c < totalCols; c++) {
          if (coveredUntil[c] >= r) {
            // Word requires completely omitting <td> in covered rows
            continue;
          }

          const w = c === totalCols - 1 ? lastDayColWidth : dayColWidth;
          const cellData = gridMatrix[r] ? gridMatrix[r][c] : null;

          if (cellData && cellData.isScheduled && cellData.classesList && cellData.classesList.length > 0) {
            const cls = cellData.classesList[0];
            const span = cellData.totalSpan || 1;
            coveredUntil[c] = r + span - 1;
            const totalCellHeight = slotHeight * span;

            // Parse subject and component cleanly so they don't awkwardly wrap
            let displaySubj = cls.subj || '';
            let displayComp = cls.comp ? cls.comp.replace(/^\(|\)$/g, '').trim() : '';
            if (!displayComp) {
              const m = displaySubj.match(/\((Lecture|Laboratory|Lec|Lab)\)/i);
              if (m) {
                displayComp = m[1];
                displaySubj = displaySubj.replace(m[0], '').trim();
              }
            }

            let contentHtml = '';
            if (span === 1) {
              // 30-min slot (14pt)
              contentHtml = `
                <div style="font-weight: bold; font-size: 6pt; line-height: 6.8pt; font-family: Arial, sans-serif; text-align: center; color: #000000; margin: 0; padding: 0;">${displaySubj}${displayComp ? ` (${displayComp})` : ''}</div>
                ${cls.prof ? `<div style="font-size: 5pt; font-weight: 600; line-height: 5.8pt; font-family: Arial, sans-serif; text-align: center; color: #111827; margin: 0.5pt 0 0 0; padding: 0;">${cls.prof}</div>` : ''}
              `;
            } else if (span === 2) {
              // 1-hour slot (28pt) - 4 compact lines that perfectly fit without clipping
              contentHtml = `
                <div style="font-weight: bold; font-size: 6pt; line-height: 6.8pt; font-family: Arial, sans-serif; text-align: center; color: #000000; margin: 0; padding: 0;">${displaySubj}</div>
                ${displayComp ? `<div style="font-size: 5pt; line-height: 5.8pt; font-family: Arial, sans-serif; text-align: center; color: #111827; margin: 0; padding: 0;">(${displayComp})</div>` : ''}
                ${cls.prof ? `<div style="font-size: 5.5pt; font-weight: 600; line-height: 6.2pt; font-family: Arial, sans-serif; text-align: center; color: #111827; margin: 0.5pt 0 0 0; padding: 0;">${cls.prof}</div>` : ''}
                <div style="font-size: 5pt; line-height: 5.8pt; font-family: Arial, sans-serif; text-align: center; color: #111827; margin: 0.5pt 0 0 0; padding: 0;">${cls.rm}${cls.sec ? ` - ${cls.sec}` : ''}</div>
              `;
            } else {
              // 1.5-hour or more (42pt+) - spacious, crisp formatting
              contentHtml = `
                <div style="font-weight: bold; font-size: 7pt; line-height: 8pt; font-family: Arial, sans-serif; text-align: center; color: #000000; margin: 0; padding: 0;">${displaySubj}</div>
                ${displayComp ? `<div style="font-size: 5.5pt; line-height: 6.5pt; font-family: Arial, sans-serif; text-align: center; color: #111827; margin: 0; padding: 0;">(${displayComp})</div>` : ''}
                ${cls.prof ? `<div style="font-size: 6pt; font-weight: 600; line-height: 7pt; font-family: Arial, sans-serif; text-align: center; color: #111827; margin: 1pt 0 0 0; padding: 0;">${cls.prof}</div>` : ''}
                <div style="font-size: 5.5pt; line-height: 6.5pt; font-family: Arial, sans-serif; text-align: center; color: #111827; margin: 0.5pt 0 0 0; padding: 0;">${cls.rm}</div>
                ${cls.sec ? `<div style="font-weight: bold; font-size: 5.5pt; line-height: 6.5pt; font-family: Arial, sans-serif; text-align: center; color: #1e3a8a; margin: 0.5pt 0 0 0; padding: 0;">${cls.sec}</div>` : ''}
              `;
            }

            cellsHtml.push(`
              <td rowspan="${span}" width="${w}" bgcolor="#00b0f0" style="width: ${w}pt; height: ${totalCellHeight}pt; mso-height-rule: at-least; border: 1.0pt solid #000000; mso-border-alt: solid #000000 1.0pt; background-color: #00b0f0; text-align: center; vertical-align: middle; padding: 0.5pt 1pt; overflow: visible; font-family: Arial, Helvetica, sans-serif;">
                ${contentHtml}
              </td>
            `);
          } else {
            // Empty slot: merge 2 half-hours of the same hour into 1 clean cell to eliminate internal dashed lines
            let emptySpan = 1;
            if (r % 2 === 0 && r + 1 < totalRows && (!gridMatrix[r + 1] || !gridMatrix[r + 1][c] || !gridMatrix[r + 1][c].isScheduled)) {
              emptySpan = 2;
            }
            coveredUntil[c] = r + emptySpan - 1;
            const emptyHeight = slotHeight * emptySpan;

            cellsHtml.push(`
              <td rowspan="${emptySpan}" width="${w}" style="width: ${w}pt; height: ${emptyHeight}pt; mso-height-rule: at-least; border: 1.0pt solid #000000; mso-border-alt: solid #000000 1.0pt; font-size: 1pt; line-height: 1pt; padding: 0; background-color: #ffffff;">
                &nbsp;
              </td>
            `);
          }
        }

        rowsHtml.push(`
          <tr style="height: ${slotHeight}pt; mso-height-rule: at-least; page-break-inside: avoid;">
            ${cellsHtml.join('')}
          </tr>
        `);
      }

      const tbodyHtml = `
        <tbody>
          ${rowsHtml.join('')}
        </tbody>
      `;

      timetableHtml = `
        <table class="room-util-timetable-grid" border="0" cellspacing="0" cellpadding="0" style="width: ${timetableWidth}pt; margin: 0 auto 3pt auto; border-collapse: collapse; table-layout: fixed; border: 1.0pt solid #000000; mso-border-alt: solid #000000 1.0pt; mso-table-lspace: 0pt; mso-table-rspace: 0pt; page-break-inside: avoid;">
          ${colgroupHtml}
          ${theadHtml}
          ${tbodyHtml}
        </table>
      `;
    }

    // 7. Signatures: 3-column table with individual underlines, compact margins, and invisible borders (guaranteed Page 1 fit)
    const sigBlocks = Array.from(roomDoc.querySelectorAll('.room-util-signatures .sig-block'));
    let prepLabel = 'Prepared by:';
    let prepName = 'CHERILYN G. VILLASIS';
    let prepTitle = 'Department Secretary';
    let notedLabel = 'Noted:';
    let notedName = 'JELLY L. PAREDES, EdD';
    let notedTitle = 'Program Chairman, BSCS';
    let approvedLabel = 'Approved:';
    let approvedName = 'RAMY LLOYD L. LOTILLA, EdD';
    let approvedTitle = 'Satellite College Director';

    if (sigBlocks.length >= 3) {
      prepLabel = sigBlocks[0].querySelector('.sig-label')?.textContent.trim() || prepLabel;
      prepName = sigBlocks[0].querySelector('.sig-name')?.textContent.trim() || prepName;
      prepTitle = sigBlocks[0].querySelector('.sig-title')?.textContent.trim() || prepTitle;
      notedLabel = sigBlocks[1].querySelector('.sig-label')?.textContent.trim() || notedLabel;
      notedName = sigBlocks[1].querySelector('.sig-name')?.textContent.trim() || notedName;
      notedTitle = sigBlocks[1].querySelector('.sig-title')?.textContent.trim() || notedTitle;
      approvedLabel = sigBlocks[2].querySelector('.sig-label')?.textContent.trim() || approvedLabel;
      approvedName = sigBlocks[2].querySelector('.sig-name')?.textContent.trim() || approvedName;
      approvedTitle = sigBlocks[2].querySelector('.sig-title')?.textContent.trim() || approvedTitle;
    }

    const sigsHtml = `
      <table class="room-util-signatures-table" border="1" bordercolor="#ffffff" cellspacing="0" cellpadding="0" style="width: 560pt; margin: 3pt auto 0 auto; border-collapse: collapse; border: 0.5pt solid #ffffff; mso-border-alt: solid #ffffff 0.5pt; table-layout: fixed; mso-table-lspace: 0pt; mso-table-rspace: 0pt; page-break-inside: avoid; page-break-after: avoid; page-break-before: avoid;">
        <colgroup>
          <col width="186" style="width: 186pt;">
          <col width="186" style="width: 186pt;">
          <col width="188" style="width: 188pt;">
        </colgroup>
        <tr style="page-break-inside: avoid;">
          <td width="186" style="width: 186pt; vertical-align: top; border: 0.5pt solid #ffffff; mso-border-alt: solid #ffffff 0.5pt; padding: 0 4pt; text-align: left; overflow: visible;">
            <p style="margin: 0 0 8pt 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #000000; line-height: 1.15; mso-line-height-rule: at-least;">
              ${prepLabel}
            </p>
            <p style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 8pt; font-weight: bold; color: #000000; line-height: 1.15; mso-line-height-rule: at-least;">
              <u>${prepName}</u>
            </p>
            <p style="margin: 1pt 0 0 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 6.5pt; color: #4b5563; line-height: 1.15; mso-line-height-rule: at-least;">
              ${prepTitle}
            </p>
          </td>
          <td width="186" style="width: 186pt; vertical-align: top; border: 0.5pt solid #ffffff; mso-border-alt: solid #ffffff 0.5pt; padding: 0 4pt; text-align: left; overflow: visible;">
            <p style="margin: 0 0 8pt 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #000000; line-height: 1.15; mso-line-height-rule: at-least;">
              ${notedLabel}
            </p>
            <p style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 8pt; font-weight: bold; color: #000000; line-height: 1.15; mso-line-height-rule: at-least;">
              <u>${notedName}</u>
            </p>
            <p style="margin: 1pt 0 0 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 6.5pt; color: #4b5563; line-height: 1.15; mso-line-height-rule: at-least;">
              ${notedTitle}
            </p>
          </td>
          <td width="188" style="width: 188pt; vertical-align: top; border: 0.5pt solid #ffffff; mso-border-alt: solid #ffffff 0.5pt; padding: 0 4pt; text-align: left; overflow: visible;">
            <p style="margin: 0 0 8pt 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #000000; line-height: 1.15; mso-line-height-rule: at-least;">
              ${approvedLabel}
            </p>
            <p style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 8pt; font-weight: bold; color: #000000; line-height: 1.15; mso-line-height-rule: at-least;">
              <u>${approvedName}</u>
            </p>
            <p style="margin: 1pt 0 0 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 6.5pt; color: #4b5563; line-height: 1.15; mso-line-height-rule: at-least;">
              ${approvedTitle}
            </p>
          </td>
        </tr>
      </table>
    `;

    // 8. Assemble full document body without trailing paragraph spacer to prevent empty Page 2
    const bodyHtml = `
      ${headerHtml}
      ${titlesHtml}
      ${roomBadgeHtml}
      ${subjTableHtml}
      ${timetableHtml}
      ${sigsHtml}
    `;

    const cleanRoomName = (roomBadgeText.replace(/^Room:\s*/i, '') || 'Room').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Room_Utilization_${cleanRoomName || 'Export'}_${Date.now()}.doc`;
    const wordDocument = wrapPortraitWordHtml(bodyHtml, `Room Utilization - ${cleanRoomName}`);
    downloadFile(wordDocument, fileName, 'application/msword;charset=utf-8');

    logActivity({
      user,
      action: LOG_ACTIONS.EXPORT,
      details: `Exported 1-page Room Utilization (${cleanRoomName}) to Word document: ${fileName}`
    });

    toast.success('Downloaded clean 1-page editable Word document (.doc)!');
  } catch (err) {
    console.error('Error exporting Room Utilization to Word:', err);
    toast.error('Failed to export Word document: ' + (err?.message || 'Unknown error'));
  }
}

/**
 * Export Faculty Workload Schedule (INS F22) to fixed-geometry 1-Page Microsoft Word (.doc)
 * Guaranteed to fit on 1 Portrait Letter page in Times New Roman with ISO 9001:2015 layout.
 */
export async function exportFacultyWorkloadToWord(optionsOrUser = {}) {
  try {
    let professor = null;
    let schedules = [];
    let semesterInfo = '';
    let user = null;

    if (optionsOrUser && optionsOrUser.professor) {
      professor = optionsOrUser.professor;
      schedules = optionsOrUser.schedules || [];
      semesterInfo = optionsOrUser.semesterInfo || '';
      user = optionsOrUser.user || null;
    } else {
      user = optionsOrUser;
      const workloadDoc = document.querySelector('.faculty-workload-iso-document');
      if (!workloadDoc) {
        toast.error('Could not locate printable Faculty Workload. Please select a professor first.');
        return;
      }
      
      const profNameFromDom = workloadDoc.querySelector('.fw-faculty-name-value')?.textContent.trim() || 'Faculty';
      const logoBase64 = await getImageAsBase64('/capsu-logo.jpg') || await getImageAsBase64('/download.jpg') || await getImageAsBase64('/logo.png');
      const cloneDoc = workloadDoc.cloneNode(true);
      if (logoBase64) {
        const img = cloneDoc.querySelector('img');
        if (img) img.src = logoBase64;
      }
      const bodyHtml = cloneDoc.innerHTML;
      const cleanProf = profNameFromDom.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `Faculty_Workload_${cleanProf}_${Date.now()}.doc`;
      const wordDocument = wrapFacultyWorkloadWordHtml(bodyHtml, `Faculty Workload - ${profNameFromDom}`);
      downloadFile(wordDocument, fileName, 'application/msword;charset=utf-8');
      
      logActivity({
        user,
        action: LOG_ACTIONS.EXPORT,
        details: `Exported 1-page Faculty Workload (${profNameFromDom}) to Word document: ${fileName}`
      });
      toast.success(`Downloaded Faculty Workload for ${profNameFromDom} as Word document (.doc)!`);
      return;
    }

    const profName = professor?.name || 'Faculty';
    const profRank = professor?.rank || '';
    const activeSemester = semesterInfo || '1st Semester, School Year 2026-2027';

    // 1. Process Unique Assignments
    const assignmentsMap = new Map();
    (schedules || []).forEach(s => {
      if (!s.subject || !s.section) return;
      const comp = s.component || '';
      const key = `${s.subject.id || s.subject.code}-${s.section.id || s.section.name}${comp ? '-' + comp : ''}`;
      const compHours = Number(s.hours) || (s.subject.hasLecLab 
          ? (comp === 'Lecture' ? (Number(s.subject.lectureHours) || 2) : (Number(s.subject.labHours) || 3))
          : (Number(s.subject.hoursPerMeeting) || 3));
      const compUnit = s.subject.hasLecLab
          ? (comp === 'Lecture' ? (Number(s.subject.lectureHours) || 2) : (Number(s.subject.labHours) || 3))
          : (s.subject.units ?? s.subject.credits ?? 3);
      if (!assignmentsMap.has(key)) {
        assignmentsMap.set(key, {
          id: key,
          subjectCode: (s.subject.code || 'N/A') + (comp ? ` (${comp})` : ''),
          subjectName: s.subject.name || s.subject.title || 'N/A',
          unit: compUnit,
          hoursPerWeek: compHours,
          sectionName: s.section.name || 'N/A',
          studentsCount: s.section.studentsCount || ''
        });
      }
    });
    const uniqueAssignments = Array.from(assignmentsMap.values());
    const totalUnits = uniqueAssignments.reduce((sum, a) => sum + Number(a.unit || 0), 0);
    const totalHours = uniqueAssignments.reduce((sum, a) => sum + Number(a.hoursPerWeek || 0), 0);

    // 2. Process Unique Time Blocks
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const rawUniqueTimes = new Set();
    (schedules || []).forEach(schedule => {
      if (!schedule.day || !schedule.timeSlot) return;
      const sHours = Number(schedule.hours) || (schedule.subject?.hasLecLab 
          ? (schedule.component === 'Lecture' ? ((Number(schedule.subject.lectureHours) || 2) / 2) : ((Number(schedule.subject.labHours) || 3) / 2))
          : (Number(schedule.subject?.hoursPerMeeting) || 1.5));
      const label = getMeetingTimeLabel(schedule.timeSlot, sHours, 'standard');
      if (label) rawUniqueTimes.add(label);
    });
    const uniqueTimeBlocks = Array.from(rawUniqueTimes).map(label => {
      const parts = label.split('-');
      const startStr = parts[0]?.trim() || '';
      const startMinutes = parseTimeToMinutes(startStr) || 0;
      return { label, startMinutes };
    }).sort((a, b) => a.startMinutes - b.startMinutes);

    // 3. Fetch Logo
    const logoBase64 = await getImageAsBase64('/capsu-logo.jpg') || await getImageAsBase64('/download.jpg') || await getImageAsBase64('/logo.png');
    const logoHtml = logoBase64 
      ? `<img src="${logoBase64}" width="46" height="46" style="display: block; margin: 0 auto;" alt="Logo" />`
      : `<p align="center" style="font-weight: bold; font-size: 8.5pt; color: #1e3a8a; margin: 0;">CapSU</p>`;

    // 4. ISO Header Table (540pt)
    const headerHtml = `
      <table border="1" bordercolor="#000000" cellspacing="0" cellpadding="2" style="width: 540pt; border-collapse: collapse; margin-bottom: 3pt; border: 1.0pt solid #000000;">
        <colgroup>
          <col width="70" style="width: 70pt;">
          <col width="230" style="width: 230pt;">
          <col width="120" style="width: 120pt;">
          <col width="120" style="width: 120pt;">
        </colgroup>
        <tr>
          <td rowspan="4" align="center" valign="middle" width="70" style="width: 70pt; text-align: center; vertical-align: middle; padding: 1pt;">
            ${logoHtml}
          </td>
          <td rowspan="2" valign="middle" width="230" style="width: 230pt; padding: 2pt 4pt; font-size: 8pt; vertical-align: middle;">
            <div style="font-size: 8pt;">Document Type: <span style="font-weight: bold; margin-left: 12pt;">FORM</span></div>
            <div style="font-size: 8pt; font-weight: bold; text-align: center; margin-top: 1pt;">ISO 9001:2015</div>
          </td>
          <td width="120" style="width: 120pt; font-size: 8pt; font-weight: bold; text-align: left; padding-left: 4pt;">Document Code</td>
          <td width="120" style="width: 120pt; font-size: 8pt; font-weight: bold; text-align: center;">INS F22</td>
        </tr>
        <tr>
          <td width="120" style="width: 120pt; font-size: 8pt; font-weight: bold; text-align: left; padding-left: 4pt;">Revision No.</td>
          <td width="120" style="width: 120pt; font-size: 8pt; font-weight: bold; text-align: center;">00</td>
        </tr>
        <tr>
          <td rowspan="2" valign="middle" width="230" style="width: 230pt; padding: 2pt 4pt; font-size: 8pt; vertical-align: middle;">
            <div style="font-size: 8pt;">Document Type:</div>
            <div style="font-size: 11pt; font-weight: bold; text-align: center; margin-top: 1pt;">FACULTY WORKLOAD</div>
          </td>
          <td width="120" style="width: 120pt; font-size: 8pt; font-weight: bold; text-align: left; padding-left: 4pt;">Effective Date</td>
          <td width="120" style="width: 120pt; font-size: 8pt; font-weight: bold; text-align: center;">August 5, 2024</td>
        </tr>
        <tr>
          <td width="120" style="width: 120pt; font-size: 8pt; font-weight: bold; text-align: left; padding-left: 4pt;">Page</td>
          <td width="120" style="width: 120pt; font-size: 8pt; font-weight: bold; text-align: center;">1 of 1</td>
        </tr>
      </table>
    `;

    // 5. Semester & Faculty Meta
    const metaHtml = `
      <p align="center" style="text-align: center; font-size: 9.5pt; font-weight: bold; margin: 3pt 0 2pt 0; text-decoration: underline;">
        ${activeSemester}
      </p>
      <p style="font-size: 8.5pt; margin: 2pt 0 3pt 0;">
        Name of Faculty: <span style="font-weight: bold; text-decoration: underline;">${profName}</span>
      </p>
    `;

    // 6. Faculty Profile Table (540pt)
    const profileTableHtml = `
      <table border="1" bordercolor="#000000" cellspacing="0" cellpadding="1" style="width: 540pt; border-collapse: collapse; margin-bottom: 3pt; border: 1.0pt solid #000000; font-size: 7pt;">
        <colgroup>
          <col width="130" style="width: 130pt;">
          <col width="70" style="width: 70pt;">
          <col width="170" style="width: 170pt;">
          <col width="170" style="width: 170pt;">
        </colgroup>
        <tr style="background-color: #f2f2f2;">
          <th colspan="4" style="font-weight: bold; font-size: 7.5pt; text-align: center; padding: 1.5pt;">FACULTY PROFILE</th>
        </tr>
        <tr>
          <td rowspan="3" style="font-weight: bold; text-align: center; vertical-align: middle;">BACCALAUREATE</td>
          <td style="text-align: left; padding-left: 4pt;">Degree</td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="text-align: left; padding-left: 4pt;">School</td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="text-align: left; padding-left: 4pt;">Major</td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td rowspan="3" style="font-weight: bold; text-align: center; vertical-align: middle;">MASTER'S DEGREE</td>
          <td style="text-align: left; padding-left: 4pt;">Degree</td>
          <td></td>
          <td style="text-align: left; padding-left: 4pt; font-size: 7pt;">Rank/Position: <b>${profRank}</b></td>
        </tr>
        <tr>
          <td style="text-align: left; padding-left: 4pt;">School</td>
          <td></td>
          <td style="text-align: left; padding-left: 4pt; font-size: 7pt;">Designation:</td>
        </tr>
        <tr>
          <td style="text-align: left; padding-left: 4pt;">Major</td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td rowspan="3" style="font-weight: bold; text-align: center; vertical-align: middle;">DOCTORATE</td>
          <td style="text-align: left; padding-left: 4pt;">Degree</td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="text-align: left; padding-left: 4pt;">School</td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td style="text-align: left; padding-left: 4pt;">Major</td>
          <td></td>
          <td></td>
        </tr>
      </table>
    `;

    // 7. Teaching Assignment Table (540pt)
    const teachingAssignmentHtml = `
      <p style="font-size: 7.5pt; font-weight: bold; margin: 3pt 0 1pt 0;">TEACHING ASSIGNMENT:</p>
      <table border="1" bordercolor="#000000" cellspacing="0" cellpadding="1" style="width: 540pt; border-collapse: collapse; margin-bottom: 3pt; border: 1.0pt solid #000000; font-size: 7pt;">
        <colgroup>
          <col width="75" style="width: 75pt;">
          <col width="215" style="width: 215pt;">
          <col width="40" style="width: 40pt;">
          <col width="50" style="width: 50pt;">
          <col width="100" style="width: 100pt;">
          <col width="60" style="width: 60pt;">
        </colgroup>
        <tr style="background-color: #f2f2f2; font-weight: bold;">
          <th rowspan="2" style="width: 75pt; vertical-align: middle;">Course No.</th>
          <th rowspan="2" style="width: 215pt; vertical-align: middle;">Course Title</th>
          <th rowspan="2" style="width: 40pt; vertical-align: middle;">Units</th>
          <th style="width: 50pt;">No. of Hours</th>
          <th rowspan="2" style="width: 100pt; vertical-align: middle;">Course and<br/>Year Level</th>
          <th rowspan="2" style="width: 60pt; vertical-align: middle;">No. of<br/>Students</th>
        </tr>
        <tr style="background-color: #f2f2f2; font-weight: bold;">
          <th style="font-size: 6.5pt;">Lec/Lab</th>
        </tr>
        ${uniqueAssignments.map(a => `
          <tr>
            <td style="text-align: center;">${a.subjectCode}</td>
            <td style="text-align: left; padding-left: 3pt;">${a.subjectName}</td>
            <td style="text-align: center; font-weight: bold;">${a.unit}</td>
            <td style="text-align: center;">${a.hoursPerWeek}</td>
            <td style="text-align: center;">${a.sectionName}</td>
            <td style="text-align: center; font-weight: bold;">${a.studentsCount}</td>
          </tr>
        `).join('')}
        ${uniqueAssignments.length === 0 ? `<tr><td colspan="6" style="height: 18pt; font-style: italic; text-align: center;">No teaching assignments recorded</td></tr>` : ''}
        <tr style="font-weight: bold; background-color: #fafafa;">
          <td colspan="2" style="text-align: right; padding-right: 6pt;">TOTAL</td>
          <td style="text-align: center;">${totalUnits > 0 ? totalUnits : ''}</td>
          <td style="text-align: center;">${totalHours > 0 ? totalHours : ''}</td>
          <td colspan="2"></td>
        </tr>
        <tr>
          <td colspan="6" style="text-align: left; font-weight: bold; padding-left: 3pt; font-size: 6.5pt;">Other Assignments:</td>
        </tr>
        <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
      </table>
    `;

    // 8. Class Schedule Table (540pt)
    const classScheduleHtml = `
      <p style="font-size: 7.5pt; font-weight: bold; margin: 3pt 0 1pt 0;">Class Schedule:</p>
      <table border="1" bordercolor="#000000" cellspacing="0" cellpadding="1" style="width: 540pt; border-collapse: collapse; margin-bottom: 3pt; border: 1.0pt solid #000000; font-size: 7pt;">
        <colgroup>
          <col width="75" style="width: 75pt;">
          <col width="93" style="width: 93pt;">
          <col width="93" style="width: 93pt;">
          <col width="93" style="width: 93pt;">
          <col width="93" style="width: 93pt;">
          <col width="93" style="width: 93pt;">
        </colgroup>
        <tr style="background-color: #f2f2f2; font-weight: bold;">
          <th style="width: 75pt;">TIME</th>
          <th style="width: 93pt;">MONDAY</th>
          <th style="width: 93pt;">TUESDAY</th>
          <th style="width: 93pt;">WEDNESDAY</th>
          <th style="width: 93pt;">THURSDAY</th>
          <th style="width: 93pt;">FRIDAY</th>
        </tr>
        ${uniqueTimeBlocks.map(block => `
          <tr>
            <td style="text-align: center; font-weight: bold; font-size: 6.5pt; white-space: nowrap;">${block.label.replace('-', '–')}</td>
            ${days.map(day => {
              const classes = (schedules || []).filter(s => {
                if (s.day !== day) return false;
                const sHours = Number(s.hours) || (s.subject?.hasLecLab 
                    ? (s.component === 'Lecture' ? ((Number(s.subject.lectureHours) || 2) / 2) : ((Number(s.subject.labHours) || 3) / 2))
                    : (Number(s.subject?.hoursPerMeeting) || 1.5));
                const label = getMeetingTimeLabel(s.timeSlot, sHours, 'standard');
                return label === block.label;
              });

              if (classes.length === 0) {
                return `<td></td>`;
              }

              return `
                <td style="text-align: center; vertical-align: middle; padding: 1pt;">
                  ${classes.map(cls => `
                    <div style="font-weight: bold; font-size: 6.5pt;">${cls.subject?.code || ''}</div>
                    <div style="font-size: 6pt; color: #111;">${cls.room?.name ? cls.room.name.replace('Room', 'RM').replace('ROOM', 'RM') : 'TBA'}${cls.section?.name ? ' - ' + cls.section.name : ''}</div>
                  `).join('<div style="height: 1.5pt;"></div>')}
                </td>
              `;
            }).join('')}
          </tr>
        `).join('')}
        ${uniqueTimeBlocks.length === 0 ? `<tr><td colspan="6" style="height: 18pt; font-style: italic; text-align: center;">No scheduled classes</td></tr>` : ''}
      </table>
    `;

    // 9. Signatures Block (540pt)
    const signaturesHtml = `
      <table border="0" cellspacing="0" cellpadding="0" style="width: 540pt; border-collapse: collapse; margin-top: 6pt; border: none;">
        <colgroup>
          <col width="280" style="width: 280pt;">
          <col width="260" style="width: 260pt;">
        </colgroup>
        <tr>
          <td style="border: none; text-align: left; vertical-align: top; padding: 0;">
            <div style="font-size: 7.5pt;">Prepared by:</div>
            <div style="height: 14pt;"></div>
            <div style="font-size: 8pt; font-weight: bold;"><u>JELLY L. PAREDES, EdD</u></div>
            <div style="font-size: 7pt; color: #333;">Program Chairperson</div>
            
            <div style="height: 8pt;"></div>
            <div style="font-size: 7.5pt;">Approved:</div>
            <div style="height: 14pt;"></div>
            <div style="font-size: 8pt; font-weight: bold;"><u>RAMY LLOYD L. LOTILLA, EdD</u></div>
            <div style="font-size: 7pt; color: #333;">Satellite College Director</div>
          </td>
          <td style="border: none; text-align: left; vertical-align: top; padding: 0 0 0 20pt;">
            <div style="font-size: 7.5pt;">Conforme:</div>
            <div style="height: 14pt;"></div>
            <div style="font-size: 8pt; font-weight: bold;"><u>${profName}</u></div>
            <div style="font-size: 7pt; color: #333;">Faculty</div>
          </td>
        </tr>
      </table>
    `;

    const fullDocHtml = `
      ${headerHtml}
      ${metaHtml}
      ${profileTableHtml}
      ${teachingAssignmentHtml}
      ${classScheduleHtml}
      ${signaturesHtml}
    `;

    const cleanProfName = (profName || 'Faculty').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Faculty_Workload_${cleanProfName}_${Date.now()}.doc`;
    const wordDocument = wrapFacultyWorkloadWordHtml(fullDocHtml, `Faculty Workload - ${profName}`);
    downloadFile(wordDocument, fileName, 'application/msword;charset=utf-8');

    logActivity({
      user,
      action: LOG_ACTIONS.EXPORT,
      details: `Exported 1-page Faculty Workload (${profName}) to Word document: ${fileName}`
    });

    toast.success(`Downloaded Faculty Workload for ${profName} as Word document (.doc)!`);
  } catch (err) {
    console.error('Error exporting Faculty Workload to Word:', err);
    toast.error('Failed to export Word document: ' + (err?.message || 'Unknown error'));
  }
}

/**
 * Export ISO Format Schedule to Microsoft Excel Spreadsheet (.xls)
 */
export function exportIsoToExcel(user) {
  const isoDoc = document.querySelector('.printable-iso-document');
  if (!isoDoc) {
    toast.error('Could not locate printable ISO schedule.');
    return;
  }

  const clone = isoDoc.cloneNode(true);
  const metaText = clone.querySelector('.meta-info')?.textContent || 'Schedule';
  const cleanName = metaText.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
  const fileName = `ISO_Schedule_${cleanName || 'Export'}_${Date.now()}.xls`;

  const excelHtml = wrapExcelHtml(clone.innerHTML, 'ISO Class Schedule');
  downloadFile(excelHtml, fileName, 'application/vnd.ms-excel;charset=utf-8');

  logActivity({
    user,
    action: LOG_ACTIONS.EXPORT,
    details: `Exported ISO schedule to editable Excel spreadsheet: ${fileName}`
  });

  toast.success('Downloaded editable Excel spreadsheet (.xls)!');
}

/**
 * Export Ordinary Grid Schedule to Editable 1-PAGE Microsoft Word Document (.doc)
 * Copies the exact layout (Header, Summary Section, Summary Table, Schedule Grid, Signatures)
 * precisely scaled to guarantee it NEVER spills onto Page 2.
 */
export async function exportGridToWord(tableContainer, user) {
  const container = tableContainer || document.querySelector('.schedule-table-container') || document.querySelector('.colored-schedule-wrapper');
  if (!container) {
    toast.error('Could not locate schedule grid table.');
    return;
  }

  // 1. Fetch base64 logo if possible
  const logoBase64 = await getImageAsBase64('/download.jpg') || await getImageAsBase64('/capsu-logo.jpg') || await getImageAsBase64('/logo.png');

  // 2. Extract Title, Department, Semester, and Document Metadata
  const titleEl = container.querySelector('.schedule-doc-title h3') || container.querySelector('.table-title-main') || document.querySelector('.card-title');
  const titleText = titleEl ? titleEl.textContent.trim() : 'Class Schedule';

  const deptEl = container.querySelector('.schedule-summary-container h3') || container.querySelector('.schedule-doc-title h2');
  const deptText = deptEl ? deptEl.textContent.trim() : '';

  const semEl = container.querySelector('.schedule-summary-container p');
  const semText = semEl ? semEl.textContent.trim() : 'First Semester, School Year 2026 - 2027';

  // Extract meta info (Doc Code, Revision No, Effectivity)
  const metaItems = container.querySelectorAll('.schedule-doc-meta div');
  let docCode = 'CAPSU-F-045';
  let revNo = '01';
  let effectivity = 'August 2026';
  metaItems.forEach(item => {
    const t = item.textContent.trim();
    if (t.includes('Doc. Code:')) docCode = t.replace('Doc. Code:', '').trim();
    else if (t.includes('Revision No.:')) revNo = t.replace('Revision No.:', '').trim();
    else if (t.includes('Effectivity:')) effectivity = t.replace('Effectivity:', '').trim();
  });

  // 3. Build Header Table (720pt fixed width: 75 + 485 + 160 = 720pt)
  const logoHtml = logoBase64 
    ? `<img src="${logoBase64}" width="28" height="28" style="display: block; margin: 0 auto;" alt="Logo" />`
    : `<p align="center" style="font-weight: bold; font-size: 8pt; color: #1e3a8a; margin: 0;">CapSU</p><p align="center" style="font-size: 5.5pt; font-weight: bold; margin: 0;">Capiz State University</p>`;

  const headerHtml = `
    <table class="grid-header-table" border="1" bordercolor="#000000" cellspacing="0" cellpadding="2" style="width: 720pt;">
      <colgroup>
        <col width="75" style="width: 75pt;">
        <col width="485" style="width: 485pt;">
        <col width="160" style="width: 160pt;">
      </colgroup>
      <tr>
        <td width="75" align="center" valign="middle" style="width: 75pt; text-align: center; vertical-align: middle; padding: 1pt;">
          ${logoHtml}
        </td>
        <td width="485" align="center" valign="middle" style="width: 485pt; text-align: center; vertical-align: middle;">
          <h2 style="margin: 0; font-size: 8.5pt; font-family: 'Times New Roman', serif; font-weight: bold; line-height: 1.0;">CAPIZ STATE UNIVERSITY</h2>
          <h3 style="margin: 1pt 0 0 0; font-size: 7.5pt; font-family: 'Times New Roman', serif; font-weight: bold; color: #1e3a8a; line-height: 1.0;">${titleText}</h3>
        </td>
        <td width="160" valign="middle" style="width: 160pt; font-size: 5.5pt; padding: 1pt 3pt; line-height: 1.0;">
          <p style="margin: 0;"><b>Doc. Code:</b> ${docCode}</p>
          <p style="margin: 0.5pt 0 0 0;"><b>Revision No.:</b> ${revNo}</p>
          <p style="margin: 0.5pt 0 0 0;"><b>Effectivity:</b> ${effectivity}</p>
          <p style="margin: 0.5pt 0 0 0;"><b>Page:</b> 1 of 1</p>
        </td>
      </tr>
    </table>
  `;

  // 4. Build Exact-Layout Compact Subject Summary Section
  let summarySectionHtml = '';
  const summaryContainer = container.querySelector('.schedule-summary-container');
  const summaryTableEl = container.querySelector('.schedule-summary-table');

  if (summaryContainer || summaryTableEl) {
    const summaryHeadHtml = `
      <div class="summary-section" style="text-align: center; margin: 0.5pt 0;">
        ${deptText ? `<p style="margin: 0; font-size: 6.5pt; font-family: 'Times New Roman', serif; font-weight: bold; color: #033279; text-transform: uppercase; line-height: 1.0;">${deptText}</p>` : ''}
        <p style="margin: 0.5pt 0 0 0; font-size: 6pt; font-family: 'Times New Roman', serif; font-weight: bold; color: #000000; line-height: 1.0;">SCHEDULE OF CLASSES</p>
        <p style="margin: 0.5pt 0 1pt 0; font-size: 5.5pt; font-family: 'Times New Roman', serif; color: #333333; line-height: 1.0;">${semText}</p>
      </div>
    `;

    let summaryTableHtml = '';
    if (summaryTableEl) {
      const cloneSumTable = summaryTableEl.cloneNode(true);
      cloneSumTable.className = 'summary-table';
      cloneSumTable.setAttribute('border', '1');
      cloneSumTable.setAttribute('bordercolor', '#000000');
      cloneSumTable.setAttribute('cellspacing', '0');
      cloneSumTable.setAttribute('cellpadding', '1');
      cloneSumTable.style.width = '720pt';
      cloneSumTable.style.borderCollapse = 'collapse';
      cloneSumTable.style.tableLayout = 'fixed';
      cloneSumTable.style.marginBottom = '1pt';

      // Set fixed colgroup: 70pt + 290pt + 40pt + 185pt + 135pt = 720pt
      const sumColgroup = document.createElement('colgroup');
      sumColgroup.innerHTML = `
        <col width="70" style="width: 70pt;">
        <col width="290" style="width: 290pt;">
        <col width="40" style="width: 40pt;">
        <col width="185" style="width: 185pt;">
        <col width="135" style="width: 135pt;">
      `;
      cloneSumTable.insertBefore(sumColgroup, cloneSumTable.firstChild);

      // Format header
      cloneSumTable.querySelectorAll('thead th').forEach((th, idx) => {
        th.style.backgroundColor = '#f2f2f2';
        th.style.border = '1.0pt solid #000000';
        th.style.padding = '0.5pt 1.5pt';
        th.style.fontSize = '5.5pt';
        th.style.fontWeight = 'bold';
        th.style.height = '8.5pt';
        th.style.lineHeight = '1.0';
        if (idx === 2) th.style.textAlign = 'center';
        else th.style.textAlign = 'left';
      });

      // Format rows
      cloneSumTable.querySelectorAll('tbody tr').forEach(tr => {
        tr.style.height = '7.5pt';
        tr.style.msoHeightRule = 'exactly';
        const tds = tr.querySelectorAll('td');
        tds.forEach((td, idx) => {
          td.style.border = '1.0pt solid #000000';
          td.style.padding = '0.5pt 1.5pt';
          td.style.fontSize = '5.5pt';
          td.style.lineHeight = '1.0';
          td.style.verticalAlign = 'middle';
          if (idx === 2) {
            td.style.textAlign = 'center';
          }
        });
      });

      summaryTableHtml = cloneSumTable.outerHTML;
    }

    summarySectionHtml = `
      ${summaryHeadHtml}
      ${summaryTableHtml}
    `;
  }

  // 5. Build Clean Dynamic 1-Page Main Schedule Grid Table (720pt fixed width)
  const originalGrid = container.querySelector('.schedule-table');
  let gridTableHtml = '';

  if (originalGrid) {
    const cloneGrid = originalGrid.cloneNode(true);
    cloneGrid.querySelectorAll('.delete-btn, .btn-icon, button, svg, .remove-btn, .schedule-drag-handle').forEach(el => el.remove());

    // Calculate number of day columns
    const ths = cloneGrid.querySelectorAll('thead th');
    const dayCount = Math.max(1, ths.length - 1);
    const timeWidth = 70;
    const dayWidth = Math.floor((720 - timeWidth) / dayCount);

    // Apply header widths and styles
    if (ths.length > 0) {
      ths[0].setAttribute('width', `${timeWidth}`);
      ths[0].style.width = `${timeWidth}pt`;
      ths[0].style.backgroundColor = '#f2f2f2';
      ths[0].style.fontSize = '7pt';
      ths[0].style.fontWeight = 'bold';
      ths[0].style.height = '14pt';
      ths[0].style.textAlign = 'center';
      ths[0].style.padding = '1pt 2pt';
      ths[0].style.border = '1.0pt solid #000000';

      for (let i = 1; i < ths.length; i++) {
        ths[i].setAttribute('width', `${dayWidth}`);
        ths[i].style.width = `${dayWidth}pt`;
        ths[i].style.backgroundColor = '#f2f2f2';
        ths[i].style.fontSize = '7pt';
        ths[i].style.fontWeight = 'bold';
        ths[i].style.height = '14pt';
        ths[i].style.textAlign = 'center';
        ths[i].style.padding = '1pt 2pt';
        ths[i].style.border = '1.0pt solid #000000';
      }
    }

    // Process tbody rows: exactly 18pt per slot so all 22 slots fit on 1 landscape page with square proportions
    cloneGrid.querySelectorAll('tbody tr').forEach(tr => {
      tr.style.height = '18pt';
      tr.style.msoHeightRule = 'exactly';

      const isHourHead = tr.classList.contains('hour-row');
      const isHalfHour = tr.classList.contains('half-hour-row');

      const tds = tr.querySelectorAll('td');
      tds.forEach((td) => {
        td.style.boxSizing = 'border-box';
        td.style.verticalAlign = 'middle';
        td.style.padding = '1pt 2pt';

        if (td.classList.contains('time-label')) {
          td.setAttribute('width', `${timeWidth}`);
          td.style.width = `${timeWidth}pt`;
          td.style.fontSize = '6.5pt';
          td.style.fontWeight = 'bold';
          td.style.backgroundColor = '#f8fafc';
          td.setAttribute('bgcolor', '#f8fafc');
          td.style.textAlign = 'center';
          td.style.lineHeight = '1.0';
          td.style.border = '1.0pt solid #000000';
        } else if (td.classList.contains('lunch-break')) {
          td.setAttribute('width', `${dayWidth}`);
          td.style.width = `${dayWidth}pt`;
          td.style.backgroundColor = '#d1d5db';
          td.setAttribute('bgcolor', '#d1d5db');
          td.style.letterSpacing = '2.5pt';
          td.style.fontWeight = 'bold';
          td.style.fontSize = '6.5pt';
          td.style.textAlign = 'center';
          td.style.border = '1.0pt solid #000000';
        } else {
          td.setAttribute('width', `${dayWidth}`);
          td.style.width = `${dayWidth}pt`;
          td.style.textAlign = 'center';

          // Extract schedule item info
          const subjEl = td.querySelector('.subject');
          const profEl = td.querySelector('.professor');
          const roomEl = td.querySelector('.room');
          const secEl = td.querySelector('.section');

          const subj = subjEl?.textContent.trim() || '';
          const prof = profEl?.textContent.trim() || '';
          const room = roomEl?.textContent.trim() || '';
          const sec = secEl?.textContent.trim().replace(/^\[|\]$/g, '') || '';

          if (subj || prof || room || sec || td.classList.contains('has-schedule')) {
            // Determine background color
            let bgColor = td.style.backgroundColor;
            if (!bgColor || bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
              const itemEl = td.querySelector('.schedule-item');
              if (itemEl && itemEl.style.backgroundColor) {
                bgColor = itemEl.style.backgroundColor;
              }
            }
            // Convert to hex
            let hexColor = '#109EEF';
            if (bgColor) {
              if (bgColor.startsWith('#')) {
                hexColor = bgColor;
              } else {
                const rgbMatch = bgColor.match(/\d+/g);
                if (rgbMatch && rgbMatch.length >= 3) {
                  hexColor = '#' + ((1 << 24) + (Number(rgbMatch[0]) << 16) + (Number(rgbMatch[1]) << 8) + Number(rgbMatch[2])).toString(16).slice(1);
                }
              }
            }

            td.setAttribute('bgcolor', hexColor);
            td.style.backgroundColor = hexColor;
            td.style.color = '#ffffff';
            td.style.border = '1.0pt solid #000000';

            td.innerHTML = `
              <p style="font-weight: bold; font-size: 7.2pt; margin: 0; padding: 0; text-align: center; color: #ffffff; line-height: 1.1;">${subj || '—'}</p>
              ${prof ? `<p style="font-size: 5.8pt; margin: 1pt 0 0 0; padding: 0; text-align: center; color: #ffffff; opacity: 0.95; line-height: 1.1;">${prof}</p>` : ''}
              ${room ? `<p style="font-size: 5.8pt; margin: 0.5pt 0 0 0; padding: 0; text-align: center; color: #ffffff; opacity: 0.95; line-height: 1.1;">${room}</p>` : ''}
              ${sec ? `<p style="font-size: 5.8pt; font-weight: bold; margin: 0.5pt 0 0 0; padding: 0; text-align: center; color: #ffffff; opacity: 0.95; line-height: 1.1;">${sec}</p>` : ''}
            `;
          } else {
            // Empty cell: keep clean, with border styling for 1-hour groups
            td.style.backgroundColor = '#ffffff';
            td.setAttribute('bgcolor', '#ffffff');
            td.style.borderLeft = '1.0pt solid #000000';
            td.style.borderRight = '1.0pt solid #000000';
            if (isHourHead) {
              td.style.borderTop = '1.0pt solid #000000';
              td.style.borderBottom = '0.5pt dashed #cbd5e1';
            } else if (isHalfHour) {
              td.style.borderTop = 'none';
              td.style.borderBottom = '1.0pt solid #000000';
            } else {
              td.style.border = '1.0pt solid #000000';
            }
            td.innerHTML = '&nbsp;';
          }
        }
      });
    });

    cloneGrid.setAttribute('border', '1');
    cloneGrid.setAttribute('bordercolor', '#000000');
    cloneGrid.setAttribute('cellspacing', '0');
    cloneGrid.setAttribute('cellpadding', '1');
    cloneGrid.className = 'ordinary-schedule-table';
    cloneGrid.style.width = '720pt';
    cloneGrid.style.tableLayout = 'fixed';
    cloneGrid.style.borderCollapse = 'collapse';
    cloneGrid.style.marginBottom = '2pt';

    // Insert colgroup for Word
    const colgroup = document.createElement('colgroup');
    let colsHtml = `<col width="${timeWidth}" style="width: ${timeWidth}pt;">`;
    for (let i = 0; i < dayCount; i++) {
      colsHtml += `<col width="${dayWidth}" style="width: ${dayWidth}pt;">`;
    }
    colgroup.innerHTML = colsHtml;
    cloneGrid.insertBefore(colgroup, cloneGrid.firstChild);

    gridTableHtml = cloneGrid.outerHTML;
  }

  // 6. Build Clean Dynamic Signatures Table (360pt + 360pt = 720pt)
  let prepName = 'PROGRAM CHAIRPERSON';
  let prepTitle = 'Program Chair';
  let appName = 'RAMY LLOYD LOTILLA, EdD';
  let appTitle = 'Campus Administrator';

  const sigBlocks = document.querySelectorAll('.printable-iso-document > div:last-child > div');
  if (sigBlocks.length >= 2) {
    const pLines = sigBlocks[0].querySelectorAll('div');
    if (pLines.length >= 3) {
      prepName = pLines[1].textContent.trim();
      prepTitle = pLines[2].textContent.trim();
    }
    const aLines = sigBlocks[1].querySelectorAll('div');
    if (aLines.length >= 3) {
      appName = aLines[1].textContent.trim();
      appTitle = aLines[2].textContent.trim();
    }
  }

  const signaturesTableHtml = `
    <table class="signatures-table" border="0" cellspacing="0" cellpadding="1" style="width: 720pt; page-break-inside: avoid; page-break-after: avoid; margin-top: 3pt;">
      <colgroup>
        <col width="360" style="width: 360pt;">
        <col width="360" style="width: 360pt;">
      </colgroup>
      <tr>
        <td width="360" style="width: 360pt; text-align: left; vertical-align: top; padding: 0 10pt;">
          <p style="margin: 0 0 2pt 0; font-size: 5.5pt;">Prepared by:</p>
          <p style="margin: 0; font-weight: bold; text-decoration: underline; font-size: 6.5pt;">${prepName}</p>
          <p style="margin: 0.5pt 0 0 0; font-size: 5.5pt;">${prepTitle}</p>
        </td>
        <td width="360" style="width: 360pt; text-align: left; padding-left: 30pt; vertical-align: top;">
          <p style="margin: 0 0 2pt 0; font-size: 5.5pt;">Approved:</p>
          <p style="margin: 0; font-weight: bold; text-decoration: underline; font-size: 6.5pt;">${appName}</p>
          <p style="margin: 0.5pt 0 0 0; font-size: 5.5pt;">${appTitle}</p>
        </td>
      </tr>
    </table>
  `;

  const fullHtml = `
    ${headerHtml}
    ${summarySectionHtml}
    ${gridTableHtml}
    ${signaturesTableHtml}
  `;

  const cleanFileTag = titleText.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  const fileName = `Grid_Schedule_${cleanFileTag || 'Export'}_${Date.now()}.doc`;
  const wordHtml = wrapWordHtml(fullHtml, titleText);
  downloadFile(wordHtml, fileName, 'application/msword;charset=utf-8');

  logActivity({
    user,
    action: LOG_ACTIONS.EXPORT,
    details: `Exported fixed-layout 1-page schedule grid to editable Word document: ${fileName}`
  });

  toast.success('Downloaded 1-page editable Word grid (.doc)!');
}

/**
 * Export Ordinary Grid Schedule to Editable Microsoft Excel Spreadsheet (.xls)
 */
export function exportGridToExcel(tableContainer, user) {
  const container = tableContainer || document.querySelector('.schedule-table-container') || document.querySelector('.colored-schedule-wrapper');
  if (!container) {
    toast.error('Could not locate schedule grid table.');
    return;
  }

  const clone = container.cloneNode(true);
  clone.querySelectorAll('.schedule-toolbar, .fullscreen-btn, .delete-btn, .btn-icon, button, svg').forEach(el => el.remove());

  const titleEl = container.querySelector('.schedule-doc-title h3') || container.querySelector('.table-title-main');
  const titleText = titleEl ? titleEl.textContent.trim() : 'Schedule Grid';

  const bodyHtml = `
    <table border="1">
      <tr><th colspan="7" style="font-size: 12pt; text-align: center; background: #e2e8f0; height: 24px;">${titleText}</th></tr>
    </table>
    ${clone.innerHTML}
  `;

  const fileName = `Grid_Schedule_${Date.now()}.xls`;
  const excelHtml = wrapExcelHtml(bodyHtml, titleText);
  downloadFile(excelHtml, fileName, 'application/vnd.ms-excel;charset=utf-8');

  logActivity({
    user,
    action: LOG_ACTIONS.EXPORT,
    details: `Exported schedule grid to editable Excel spreadsheet: ${fileName}`
  });

  toast.success('Downloaded editable Excel grid (.xls)!');
}
