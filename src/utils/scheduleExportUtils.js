/**
 * scheduleExportUtils.js
 * Advanced export engine for class schedules into editable Microsoft Word (.doc) and Excel (.xls)
 * Both ISO 9001:2015 and Ordinary Grid formats use strict 700pt fixed-point geometry
 * ensuring 100% symmetrical, non-stretched, 1-page fit.
 */

import { toast } from 'sonner';
import { logActivity, LOG_ACTIONS } from './activityLogger';

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
      margin: 0.15in 0.4in 0.15in 0.4in;
      mso-header-margin: 0in;
      mso-footer-margin: 0in;
      mso-paper-source: 0;
    }
    div.Section1 {
      page: Section1;
      width: 700pt;
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
      width: 700pt;
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
      width: 700pt;
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
      font-size: 6pt;
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
      font-size: 6.5pt;
      height: 11pt;
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
      margin-top: 1pt;
      border-collapse: collapse;
      table-layout: fixed;
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
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 6.5pt;">Document Type:</td>
        <td rowspan="2" align="center" valign="middle" width="280" style="width: 280pt; font-weight: bold; font-size: 8.5pt; text-align: center; vertical-align: middle;">
          DOCUMENTED INFORMATION
        </td>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 6.5pt;">Document Code</td>
        <td width="110" style="width: 110pt; font-size: 6.5pt;">INS-CLS-08</td>
      </tr>
      <tr>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 6.5pt;">ISO 9001:2015</td>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 6.5pt;">Revision No.</td>
        <td width="110" style="width: 110pt; font-size: 6.5pt;">00</td>
      </tr>
      <tr>
        <td rowspan="2" width="110" style="width: 110pt; font-weight: bold; font-size: 6.5pt;">Document Title:</td>
        <td rowspan="2" align="center" valign="middle" width="280" style="width: 280pt; font-weight: bold; font-size: 10pt; text-align: center; vertical-align: middle;">
          CLASS SCHEDULE
        </td>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 6.5pt;">Effective Date</td>
        <td width="110" style="width: 110pt; font-size: 6.5pt;">June 25, 2018</td>
      </tr>
      <tr>
        <td width="110" style="width: 110pt; font-weight: bold; font-size: 6.5pt;">Page</td>
        <td width="110" style="width: 110pt; font-size: 6.5pt;">1 of 1</td>
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

  // 6. Build Schedule Grid Table (Exact 700pt fixed width: 80 + 124*5 = 700pt)
  const originalTable = isoDoc.querySelector('.iso-schedule-table');
  let scheduleTableHtml = '';

  if (originalTable) {
    const cloneTable = originalTable.cloneNode(true);

    // Apply strict column widths on header
    const ths = cloneTable.querySelectorAll('thead th');
    if (ths.length >= 6) {
      ths[0].setAttribute('width', '80');
      ths[0].style.width = '80pt';
      for (let i = 1; i < ths.length; i++) {
        ths[i].setAttribute('width', '124');
        ths[i].style.width = '124pt';
      }
    }

    // Transform cell contents to crisp, fixed-width Word cells
    cloneTable.querySelectorAll('tbody tr').forEach(tr => {
      tr.style.height = '18pt';
      tr.style.msoHeightRule = 'exactly';

      const tds = tr.querySelectorAll('td');
      tds.forEach((td) => {
        if (td.classList.contains('time-cell')) {
          td.setAttribute('width', '80');
          td.style.width = '80pt';
          td.style.height = '18pt';
        } else if (td.classList.contains('lunch-break')) {
          td.setAttribute('align', 'center');
          td.setAttribute('valign', 'middle');
          td.style.backgroundColor = '#d1d5db';
          td.style.letterSpacing = '2pt';
          td.style.fontWeight = 'bold';
          td.style.fontSize = '6.5pt';
          td.style.height = '14pt';
        } else {
          td.setAttribute('width', '124');
          td.style.width = '124pt';
          td.style.height = '18pt';

          const subj = td.querySelector('.cell-subject')?.textContent.trim() || '';
          const prof = td.querySelector('.cell-professor')?.textContent.trim() || '';
          const room = td.querySelector('.cell-room')?.textContent.trim() || '';

          if (subj || prof || room) {
            td.innerHTML = `
              <p style="font-weight: bold; font-size: 7pt; margin: 0; padding: 0; text-align: center; color: #000000; line-height: 1.0;">${subj}</p>
              ${prof ? `<p style="font-size: 5.5pt; margin: 0; padding: 0; text-align: center; color: #111827; line-height: 1.0;">${prof}</p>` : ''}
              ${room ? `<p style="font-size: 5.5pt; margin: 0; padding: 0; text-align: center; color: #374151; line-height: 1.0;">${room}</p>` : ''}
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

    // Insert Colgroup for Word
    const colgroup = document.createElement('colgroup');
    colgroup.innerHTML = `
      <col width="80" style="width: 80pt;">
      <col width="124" style="width: 124pt;">
      <col width="124" style="width: 124pt;">
      <col width="124" style="width: 124pt;">
      <col width="124" style="width: 124pt;">
      <col width="124" style="width: 124pt;">
    `;
    cloneTable.insertBefore(colgroup, cloneTable.firstChild);

    scheduleTableHtml = cloneTable.outerHTML;
  }

  // 7. Build Signatures Table (Exact 700pt fixed width: 350 + 350 = 700pt)
  const signaturesTableHtml = `
    <table class="signatures-table" border="0" cellspacing="0" cellpadding="1">
      <colgroup>
        <col width="350" style="width: 350pt;">
        <col width="350" style="width: 350pt;">
      </colgroup>
      <tr>
        <td width="350" style="width: 350pt; text-align: left; vertical-align: top; padding: 0 10pt;">
          <p style="margin: 0 0 3pt 0; font-size: 6pt;">Prepared by:</p>
          <p style="margin: 0; font-weight: bold; text-decoration: underline; font-size: 7pt;">${prepName}</p>
          <p style="margin: 0.5pt 0 0 0; font-size: 6pt;">${prepTitle}</p>
        </td>
        <td width="350" style="width: 350pt; text-align: left; padding-left: 30pt; vertical-align: top;">
          <p style="margin: 0 0 3pt 0; font-size: 6pt;">Approved:</p>
          <p style="margin: 0; font-weight: bold; text-decoration: underline; font-size: 7pt;">${appName}</p>
          <p style="margin: 0.5pt 0 0 0; font-size: 6pt;">${appTitle}</p>
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

  // 3. Build Header Table (700pt fixed width: 75 + 475 + 150 = 700pt)
  const logoHtml = logoBase64 
    ? `<img src="${logoBase64}" width="28" height="28" style="display: block; margin: 0 auto;" alt="Logo" />`
    : `<p align="center" style="font-weight: bold; font-size: 8pt; color: #1e3a8a; margin: 0;">CapSU</p><p align="center" style="font-size: 5.5pt; font-weight: bold; margin: 0;">Capiz State University</p>`;

  const headerHtml = `
    <table class="grid-header-table" border="1" bordercolor="#000000" cellspacing="0" cellpadding="2">
      <colgroup>
        <col width="75" style="width: 75pt;">
        <col width="475" style="width: 475pt;">
        <col width="150" style="width: 150pt;">
      </colgroup>
      <tr>
        <td width="75" align="center" valign="middle" style="width: 75pt; text-align: center; vertical-align: middle; padding: 1pt;">
          ${logoHtml}
        </td>
        <td width="475" align="center" valign="middle" style="width: 475pt; text-align: center; vertical-align: middle;">
          <h2 style="margin: 0; font-size: 8.5pt; font-family: 'Times New Roman', serif; font-weight: bold; line-height: 1.0;">CAPIZ STATE UNIVERSITY</h2>
          <h3 style="margin: 1pt 0 0 0; font-size: 7.5pt; font-family: 'Times New Roman', serif; font-weight: bold; color: #1e3a8a; line-height: 1.0;">${titleText}</h3>
        </td>
        <td width="150" valign="middle" style="width: 150pt; font-size: 5.5pt; padding: 1pt 3pt; line-height: 1.0;">
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
      cloneSumTable.style.width = '700pt';
      cloneSumTable.style.borderCollapse = 'collapse';
      cloneSumTable.style.tableLayout = 'fixed';
      cloneSumTable.style.marginBottom = '1pt';

      // Set fixed colgroup: 70pt + 280pt + 40pt + 180pt + 130pt = 700pt
      const sumColgroup = document.createElement('colgroup');
      sumColgroup.innerHTML = `
        <col width="70" style="width: 70pt;">
        <col width="280" style="width: 280pt;">
        <col width="40" style="width: 40pt;">
        <col width="180" style="width: 180pt;">
        <col width="130" style="width: 130pt;">
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

  // 5. Build Clean Dynamic 1-Page Main Schedule Grid Table (700pt fixed width)
  const originalGrid = container.querySelector('.schedule-table');
  let gridTableHtml = '';

  if (originalGrid) {
    const cloneGrid = originalGrid.cloneNode(true);
    cloneGrid.querySelectorAll('.delete-btn, .btn-icon, button, svg, .remove-btn, .schedule-drag-handle').forEach(el => el.remove());

    // Calculate number of day columns
    const ths = cloneGrid.querySelectorAll('thead th');
    const dayCount = Math.max(1, ths.length - 1);
    const timeWidth = 65;
    const dayWidth = Math.floor((700 - timeWidth) / dayCount);

    // 5b. Remove the middle dividing line within each 1-hour time slot
    // by merging half-hour cells (rowspan=2) across each hour group
    const rows = Array.from(cloneGrid.querySelectorAll('tbody tr'));
    const rowCount = rows.length;
    const cellMatrix = Array.from({ length: rowCount }, () => Array(dayCount).fill(null));

    // Map all cells to their logical grid positions
    for (let r = 0; r < rowCount; r++) {
      const tr = rows[r];
      const tds = Array.from(tr.querySelectorAll('td'));
      let tdIdx = 0;

      // Skip time-label cell if present in this row
      if (tds.length > 0 && (tds[0].classList.contains('time-label') || (tds[0].hasAttribute('rowspan') && tds[0].querySelector('strong')))) {
        tdIdx = 1;
      }

      for (let c = 0; c < dayCount; c++) {
        if (cellMatrix[r][c] !== null) {
          continue; // Cell position covered by a previous row's rowspan
        }
        if (tdIdx < tds.length) {
          const td = tds[tdIdx++];
          const rs = parseInt(td.getAttribute('rowspan') || '1', 10);
          for (let span = 0; span < rs; span++) {
            if (r + span < rowCount) {
              cellMatrix[r + span][c] = (span === 0) ? td : 'SPAN';
            }
          }
        }
      }
    }

    // For every 1-hour pair (r, r+1), merge consecutive half-hour cells
    for (let r = 0; r + 1 < rowCount; r += 2) {
      for (let c = 0; c < dayCount; c++) {
        const topCell = cellMatrix[r][c];
        const bottomCell = cellMatrix[r + 1][c];

        if (topCell && topCell !== 'SPAN' && bottomCell && bottomCell !== 'SPAN') {
          const topRs = parseInt(topCell.getAttribute('rowspan') || '1', 10);
          const bottomRs = parseInt(bottomCell.getAttribute('rowspan') || '1', 10);

          if (topRs === 1 && bottomRs === 1) {
            const topHasItem = topCell.querySelector('.subject, .professor, .room, .section') || topCell.textContent.trim().length > 0;
            const bottomHasItem = bottomCell.querySelector('.subject, .professor, .room, .section') || bottomCell.textContent.trim().length > 0;

            if (!bottomHasItem || (!topHasItem && !bottomHasItem)) {
              topCell.setAttribute('rowspan', '2');
              bottomCell.remove();
              cellMatrix[r + 1][c] = 'SPAN';
            }
          }
        }
      }
    }

    // Apply header widths
    if (ths.length > 0) {
      ths[0].setAttribute('width', `${timeWidth}`);
      ths[0].style.width = `${timeWidth}pt`;
      ths[0].style.backgroundColor = '#f2f2f2';
      ths[0].style.fontSize = '6.5pt';
      ths[0].style.fontWeight = 'bold';
      ths[0].style.height = '11pt';
      ths[0].style.textAlign = 'center';
      ths[0].style.padding = '0.5pt 1.5pt';
      ths[0].style.border = '1.0pt solid #000000';

      for (let i = 1; i < ths.length; i++) {
        ths[i].setAttribute('width', `${dayWidth}`);
        ths[i].style.width = `${dayWidth}pt`;
        ths[i].style.backgroundColor = '#f2f2f2';
        ths[i].style.fontSize = '6.5pt';
        ths[i].style.fontWeight = 'bold';
        ths[i].style.height = '11pt';
        ths[i].style.textAlign = 'center';
        ths[i].style.padding = '0.5pt 1.5pt';
        ths[i].style.border = '1.0pt solid #000000';
      }
    }

    // Process tbody rows with 16.5pt height and atLeast rule to fit signatures cleanly on 1 page with square proportions
    cloneGrid.querySelectorAll('tbody tr').forEach(tr => {
      tr.style.height = '16.5pt';
      tr.style.msoHeightRule = 'atLeast';

      const tds = tr.querySelectorAll('td');
      tds.forEach((td, idx) => {
        td.style.border = '1.0pt solid #000000';
        td.style.padding = '0.5pt 1pt';
        td.style.boxSizing = 'border-box';
        td.style.verticalAlign = 'middle';

        if (td.classList.contains('time-label') || (idx === 0 && td.hasAttribute('rowspan') && td.querySelector('strong'))) {
          td.setAttribute('width', `${timeWidth}`);
          td.style.width = `${timeWidth}pt`;
          td.style.fontSize = '6.5pt';
          td.style.fontWeight = 'bold';
          td.style.backgroundColor = '#f8fafc';
          td.style.textAlign = 'center';
          td.style.lineHeight = '1.0';
        } else if (td.classList.contains('lunch-break')) {
          td.setAttribute('width', `${dayWidth}`);
          td.style.width = `${dayWidth}pt`;
          td.style.backgroundColor = '#d1d5db';
          td.style.letterSpacing = '2.5pt';
          td.style.fontWeight = 'bold';
          td.style.fontSize = '6.5pt';
          td.style.textAlign = 'center';
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

          if (subj || prof || room || sec) {
            td.innerHTML = `
              <p style="font-weight: bold; font-size: 6.8pt; margin: 0; padding: 0; text-align: center; color: #000000; line-height: 1.0;">${subj}</p>
              ${prof ? `<p style="font-size: 5.5pt; margin: 0.5pt 0 0 0; padding: 0; text-align: center; color: #111827; line-height: 1.0;">${prof}</p>` : ''}
              ${room ? `<p style="font-size: 5.5pt; margin: 0.5pt 0 0 0; padding: 0; text-align: center; color: #374151; line-height: 1.0;">${room}</p>` : ''}
              ${sec ? `<p style="font-size: 5.5pt; font-weight: bold; margin: 0.5pt 0 0 0; padding: 0; text-align: center; color: #1e3a8a; line-height: 1.0;">${sec}</p>` : ''}
            `;
          } else {
            td.innerHTML = '';
          }
        }
      });
    });

    cloneGrid.setAttribute('border', '1');
    cloneGrid.setAttribute('bordercolor', '#000000');
    cloneGrid.setAttribute('cellspacing', '0');
    cloneGrid.setAttribute('cellpadding', '1');
    cloneGrid.className = 'ordinary-schedule-table';
    cloneGrid.style.width = '700pt';
    cloneGrid.style.tableLayout = 'fixed';
    cloneGrid.style.borderCollapse = 'collapse';
    cloneGrid.style.marginBottom = '1pt';

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

  // 6. Build Clean Dynamic Signatures Table (350pt + 350pt = 700pt)
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
    <table class="signatures-table" border="0" cellspacing="0" cellpadding="1">
      <colgroup>
        <col width="350" style="width: 350pt;">
        <col width="350" style="width: 350pt;">
      </colgroup>
      <tr>
        <td width="350" style="width: 350pt; text-align: left; vertical-align: top; padding: 0 10pt;">
          <p style="margin: 0 0 3pt 0; font-size: 5.5pt;">Prepared by:</p>
          <p style="margin: 0; font-weight: bold; text-decoration: underline; font-size: 6.5pt;">${prepName}</p>
          <p style="margin: 0.5pt 0 0 0; font-size: 5.5pt;">${prepTitle}</p>
        </td>
        <td width="350" style="width: 350pt; text-align: left; padding-left: 30pt; vertical-align: top;">
          <p style="margin: 0 0 3pt 0; font-size: 5.5pt;">Approved:</p>
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
