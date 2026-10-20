import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { logActivity, LOG_ACTIONS } from '../../../utils/activityLogger';
import { exportIsoToWord, exportGridToWord, exportRoomUtilizationToWord } from '../../../utils/scheduleExportUtils';

const ExportOptions = ({ isGenerating, setIsGenerating, setPreviewImage, user }) => {
    const [isExportOpen, setIsExportOpen] = useState(false);

    // Close export dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (isExportOpen && e.target.closest && !e.target.closest('.export-dropdown-container')) {
                setIsExportOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isExportOpen]);

    const itemStyle = {
        width: '100%',
        padding: '9px 14px',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid #f1f5f9',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        fontSize: '0.82rem',
        color: 'var(--text-main)',
        transition: 'background 0.15s ease'
    };

    return (
        <div className="no-print export-dropdown-container">
            <button 
                className="btn btn-sm" 
                onClick={() => setIsExportOpen(!isExportOpen)} 
                style={{ background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                {isGenerating ? 'Generating...' : 'Export Options'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>

            {isExportOpen && (
                <div className="export-dropdown-menu">
                    {/* --- ISO FORMAT SECTION --- */}
                    <div style={{ padding: '8px 12px', fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--accent-primary)', backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-color)', letterSpacing: '0.5px' }}>
                        ISO 9001:2015 FORMAT
                    </div>
                    
                    {/* Word Document (.doc) */}
                    <button 
                        onClick={() => {
                            setIsExportOpen(false);
                            const roomContent = document.querySelector('.printable-room-utilization');
                            const isoContent = document.querySelector('.printable-iso-document');
                            
                            if (roomContent) {
                                exportRoomUtilizationToWord(user);
                            } else if (isoContent) {
                                exportIsoToWord(user);
                            } else {
                                toast.error('No printable schedule found. Please select a schedule or room first.');
                            }
                        }} 
                        style={itemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="Export editable Word document with ISO header and class schedule"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <strong>Word Document (.doc)</strong>
                    </button>


                    {/* ISO Image (.png) */}
                    <button 
                        onClick={async () => {
                            setIsExportOpen(false);
                            setIsGenerating(true);
                            const roomContent = document.querySelector('.printable-room-utilization');
                            const isoContent = document.querySelector('.printable-iso-document');
                            const printContent = roomContent || isoContent;
                            if (!printContent) {
                                setIsGenerating(false);
                                toast.error('No printable schedule found. Please select a schedule or room first.');
                                return;
                            }
                            const isRoom = !!roomContent;
                            const tempContainer = document.createElement('div');
                            tempContainer.style.position = 'absolute';
                            tempContainer.style.top = '-10000px';
                            tempContainer.style.left = '-10000px';
                            tempContainer.style.width = '1100px'; 
                            tempContainer.style.backgroundColor = 'white';
                            
                            const isoStyles = `
                                    .iso-header-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 8.5pt; font-family: "Times New Roman", Times, serif; color: #000; }
                                    .iso-header-table td, .iso-header-table th { border: 1px solid #000; padding: 3px 6px; text-align: left; }
                                    .iso-header-table .bold { font-weight: bold; }
                                    .iso-header-table .center { text-align: center; }
                                    .meta-info { display: flex; justify-content: space-between; font-size: 9pt; font-weight: bold; margin-bottom: 6px; text-transform: uppercase; font-family: "Times New Roman", Times, serif; color: #000; }
                                    .meta-value { font-weight: normal; text-decoration: underline; }
                                    .iso-schedule-table { width: 100%; border-collapse: collapse; font-size: 8pt; font-family: "Times New Roman", Times, serif; color: #000; table-layout: fixed; border: 1px solid #000; }
                                    .iso-schedule-table tr { height: 19px; }
                                    .iso-schedule-table th, .iso-schedule-table td { border: 1px solid #000; padding: 0; text-align: center; vertical-align: middle; height: 19px; overflow: hidden; box-sizing: border-box; }
                                    .iso-schedule-table th { background-color: #f0f0f0 !important; padding: 4px 2px; height: 22px; font-size: 8.5pt; font-weight: bold; }
                                    .iso-schedule-table .time-cell { white-space: nowrap; font-weight: bold; font-size: 7.5pt; padding: 2px 4px; }
                                    .iso-schedule-table tr.hour-row td:not(.time-cell):not(.scheduled-cell) { border-bottom: none !important; }
                                    .iso-schedule-table tr.half-hour-row td:not(.time-cell):not(.scheduled-cell) { border-top: none !important; }
                                    .iso-schedule-table td.scheduled-cell { border: 1px solid #000 !important; }
                                    .iso-schedule-table .schedule-cell { padding: 0; overflow: hidden; }
                                    .cell-content { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px 3px; height: 100%; overflow: hidden; box-sizing: border-box; line-height: 1.15; }
                                    .cell-subject { font-weight: bold; font-size: 8.5pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
                                    .cell-professor { font-size: 7.5pt; font-weight: 600; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                    .cell-room { font-size: 7.5pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                    .signatures-section { display: flex; justify-content: space-between; margin-top: 8px; padding: 0 40px; font-size: 8.5pt; font-family: "Times New Roman", Times, serif; color: #000; }
                                    .signature-block { text-align: left; }
                                    .signature-block.right-aligned { text-align: left; padding-right: 40px; }
                                    .sig-label { margin-bottom: 16px; }
                                    .sig-name { text-decoration: underline; font-weight: bold; }
                            `;
                            
                            const roomStyles = `
                                .room-export-wrapper {
                                    font-family: Arial, "Times New Roman", Times, serif;
                                    color: #000;
                                    background: #fff;
                                    width: 1100px;
                                    padding: 25px 35px;
                                    box-sizing: border-box;
                                    display: block;
                                }
                                .printable-room-utilization,
                                .printable-room-utilization-wrapper {
                                    display: block !important;
                                    visibility: visible !important;
                                    width: 100% !important;
                                    max-width: 100% !important;
                                    padding: 0 !important;
                                    margin: 0 !important;
                                }
                                .room-util-header {
                                    display: flex;
                                    justify-content: flex-start;
                                    align-items: center;
                                    border-bottom: 3px solid #f2a900;
                                    padding-bottom: 12px;
                                    margin-bottom: 15px;
                                    position: relative;
                                    width: 100%;
                                    box-sizing: border-box;
                                }
                                .room-util-header img {
                                    height: 65px;
                                    object-fit: contain;
                                    margin-right: 15px;
                                }
                                .room-util-header-text {
                                    display: flex;
                                    flex-direction: column;
                                }
                                .room-util-header-text .republic {
                                    font-size: 8.5pt;
                                    font-family: Arial, sans-serif;
                                }
                                .room-util-header-text .univ {
                                    font-size: 15pt;
                                    font-weight: bold;
                                    color: #002060;
                                    font-family: Arial, sans-serif;
                                    letter-spacing: 0.5px;
                                }
                                .room-util-header-text .campus {
                                    font-size: 9.5pt;
                                    font-family: Arial, sans-serif;
                                    color: #002060;
                                    font-weight: bold;
                                }
                                .room-util-titles {
                                    text-align: center;
                                    margin-bottom: 15px;
                                    width: 100%;
                                }
                                .room-util-titles h2 {
                                    font-family: Arial, sans-serif;
                                    color: #2e5296;
                                    font-size: 12pt;
                                    font-weight: bold;
                                    text-transform: uppercase;
                                    margin: 0 0 4px 0;
                                }
                                .room-util-titles h3 {
                                    font-size: 12pt;
                                    font-weight: bold;
                                    margin: 0 0 4px 0;
                                    font-family: Arial, sans-serif;
                                }
                                .room-util-titles p {
                                    font-size: 9.5pt;
                                    margin: 0;
                                    font-family: Arial, sans-serif;
                                }
                                .room-util-room-name-wrapper {
                                    margin-bottom: 12px;
                                    width: 100%;
                                }
                                .room-util-room-name {
                                    font-size: 11pt;
                                    font-weight: bold;
                                    background-color: #ffff00 !important;
                                    display: inline-block;
                                    padding: 3px 8px;
                                    border: 1px solid #000;
                                    -webkit-print-color-adjust: exact;
                                    print-color-adjust: exact;
                                }
                                .room-util-subjects-wrapper {
                                    width: 100%;
                                    margin-bottom: 15px;
                                }
                                .room-util-subjects {
                                    width: 100%;
                                    border-collapse: collapse;
                                    font-family: Arial, sans-serif;
                                    font-size: 8.5pt;
                                    border: 1px solid #000;
                                }
                                .room-util-subjects th, .room-util-subjects td {
                                    border: 1px solid #000;
                                    padding: 5px 6px;
                                    text-align: center;
                                }
                                .room-util-subjects th {
                                    font-weight: bold;
                                    background-color: #f2f2f2 !important;
                                }
                                .room-util-timetable-wrapper {
                                    width: 100%;
                                    margin-bottom: 25px;
                                    overflow: visible;
                                }
                                .room-util-timetable {
                                    width: 100%;
                                    border-collapse: collapse;
                                    font-family: Arial, sans-serif;
                                    font-size: 8pt;
                                    table-layout: fixed;
                                    border: 1px solid #000;
                                }
                                .room-util-timetable th, .room-util-timetable td {
                                    border: 1px solid #000;
                                    text-align: center;
                                    vertical-align: middle;
                                    padding: 0;
                                    box-sizing: border-box;
                                }
                                .room-util-timetable th {
                                    font-size: 8pt;
                                    font-weight: bold;
                                    background-color: #f2f2f2 !important;
                                    padding: 5px 2px;
                                }
                                .room-util-timetable .time-col,
                                .room-util-timetable .time-cell {
                                    width: 13%;
                                    min-width: 90px;
                                    font-size: 7.5pt;
                                    font-weight: bold;
                                    background-color: #f8fafc !important;
                                    padding: 4px;
                                    border: 1px solid #000;
                                    position: static !important;
                                }
                                .room-util-timetable th.time-header {
                                    position: static !important;
                                }
                                .room-util-timetable tr.hour-row td:not(.time-cell):not(.scheduled-cell) {
                                    border-bottom: none;
                                }
                                .room-util-timetable tr.half-hour-row td:not(.time-cell):not(.scheduled-cell) {
                                    border-top: none;
                                }
                                .room-util-timetable td {
                                    height: 28px;
                                }
                                .room-util-timetable td.scheduled-cell,
                                .room-util-timetable td.cell-scheduled {
                                    background-color: #00b0f0 !important;
                                    border: 1px solid #000 !important;
                                    color: #000;
                                    -webkit-print-color-adjust: exact;
                                    print-color-adjust: exact;
                                }
                                .room-util-timetable .cell-content {
                                    display: flex;
                                    flex-direction: column;
                                    justify-content: center;
                                    align-items: center;
                                    width: 100%;
                                    height: 100%;
                                    padding: 2px 3px;
                                    box-sizing: border-box;
                                    overflow: visible;
                                }
                                .room-util-timetable .cell-line {
                                    white-space: nowrap;
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    max-width: 100%;
                                    text-align: center;
                                }
                                .room-util-signatures {
                                    display: flex;
                                    justify-content: space-between;
                                    padding: 0 10px;
                                    margin-top: 25px;
                                    font-family: Arial, "Times New Roman", Times, serif;
                                    font-size: 9.5pt;
                                    width: 100%;
                                    box-sizing: border-box;
                                }
                                .sig-block {
                                    text-align: left;
                                    flex: 1;
                                    max-width: 32%;
                                }
                                .sig-label {
                                    margin-bottom: 22px;
                                    font-size: 9.5pt;
                                }
                                .sig-name {
                                    font-weight: bold;
                                    text-decoration: underline;
                                    display: inline-block;
                                    font-size: 10pt;
                                }
                                .sig-title {
                                    font-size: 9pt;
                                    margin-top: 2px;
                                }
                            `;

                            let contentHtml = printContent.innerHTML;
                            if (isRoom) {
                                contentHtml = contentHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                            }

                            tempContainer.innerHTML = `
                                <style>
                                    ${isRoom ? roomStyles : isoStyles}
                                </style>
                                <div class="${isRoom ? 'room-export-wrapper' : ''}" style="${isRoom ? '' : 'padding: 40px;'}">
                                    ${contentHtml}
                                </div>
                            `;
                            document.body.appendChild(tempContainer);

                            const origImg = printContent.querySelector('img');
                            const cloneImg = tempContainer.querySelector('img');
                            if (origImg && cloneImg) {
                                if (origImg.complete && origImg.naturalWidth > 0) {
                                    try {
                                        const c = document.createElement('canvas');
                                        c.width = origImg.naturalWidth;
                                        c.height = origImg.naturalHeight;
                                        const ctx = c.getContext('2d');
                                        ctx.drawImage(origImg, 0, 0);
                                        cloneImg.src = c.toDataURL('image/png');
                                    } catch {
                                        cloneImg.src = origImg.src;
                                    }
                                } else {
                                    cloneImg.src = origImg.src;
                                }
                            }
                            
                            try {
                                const html2canvas = (await import('html2canvas')).default;
                                const canvas = await html2canvas(tempContainer, { 
                                    scale: 3, 
                                    useCORS: true,
                                    width: 1100,
                                    windowWidth: 1100
                                });
                                setPreviewImage(canvas.toDataURL('image/png'));
                                logActivity({
                                    user,
                                    action: LOG_ACTIONS.EXPORT,
                                    details: 'Generated ISO format schedule preview image'
                                });
                            } catch (error) {
                                console.error('Failed to save image:', error);
                                alert('Failed to generate preview. Please try again.');
                            } finally {
                                document.body.removeChild(tempContainer);
                                setIsGenerating(false);
                            }
                        }} 
                        style={itemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                        Save Image (.png)
                    </button>

                    {/* ISO Print */}
                    <button 
                        onClick={() => {
                            setIsExportOpen(false);
                            const roomContent = document.querySelector('.printable-room-utilization');
                            const isoContent = document.querySelector('.printable-iso-document');
                            const printContent = roomContent || isoContent;
                            if (!printContent) {
                                toast.error('No printable schedule found. Please select a schedule or room first.');
                                return;
                            }
                            const isRoom = !!roomContent;
                            const iframe = document.createElement('iframe');
                            iframe.style.position = 'fixed';
                            iframe.style.top = '-10000px';
                            iframe.style.left = '-10000px';
                            iframe.style.width = '0';
                            iframe.style.height = '0';
                            document.body.appendChild(iframe);
                            const doc = iframe.contentDocument || iframe.contentWindow.document;
                            doc.open();
                            
                            const isoPrintStyles = `
                                        @page { size: letter landscape; margin: 0; }
                                        html, body { margin: 0; padding: 0; height: 100vh; overflow: hidden; }
                                        body { font-family: "Times New Roman", Times, serif; color: #000; padding: 0.25in; box-sizing: border-box; display: flex; flex-direction: column; }
                                        .print-wrapper { width: 100%; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
                                        .printable-iso-document { display: flex; flex-direction: column; flex: 1; height: 100%; overflow: hidden; }
                                        .printable-iso-document > div:last-child { flex-shrink: 0; margin-top: 8px !important; }
                                        .iso-header-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 8.5pt; flex-shrink: 0; }
                                        .iso-header-table td, .iso-header-table th { border: 1px solid #000; padding: 3px 6px; text-align: left; }
                                        .iso-header-table .bold { font-weight: bold; }
                                        .iso-header-table .center { text-align: center; }
                                        .meta-info { display: flex; justify-content: space-between; font-size: 9pt; font-weight: bold; margin-bottom: 6px; text-transform: uppercase; flex-shrink: 0; }
                                        .meta-value { font-weight: normal; text-decoration: underline; }
                                        .iso-schedule-table { width: 100%; border-collapse: collapse; font-size: 8pt; table-layout: fixed; flex: 1; height: 100%; margin: 0; border: 1px solid #000; }
                                        .iso-schedule-table tr { height: 19px; }
                                        .iso-schedule-table th, .iso-schedule-table td { border: 1px solid #000; padding: 0; text-align: center; vertical-align: middle; height: 19px; overflow: hidden; box-sizing: border-box; }
                                        .iso-schedule-table th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 3px 2px; font-size: 8.5pt; height: 22px; }
                                        .iso-schedule-table .time-cell { white-space: nowrap; font-weight: bold; font-size: 7.5pt; padding: 2px 4px; }
                                        .iso-schedule-table tr.hour-row td:not(.time-cell):not(.scheduled-cell) { border-bottom: none !important; }
                                        .iso-schedule-table tr.half-hour-row td:not(.time-cell):not(.scheduled-cell) { border-top: none !important; }
                                        .iso-schedule-table td.scheduled-cell { border: 1px solid #000 !important; }
                                        .iso-schedule-table .schedule-cell { padding: 0; overflow: hidden; }
                                        .cell-content { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px 3px; height: 100%; overflow: hidden; box-sizing: border-box; line-height: 1.15; }
                                        .cell-subject { font-weight: bold; font-size: 8.5pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
                                        .cell-professor { font-size: 7.5pt; font-weight: 600; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                        .cell-room { font-size: 7.5pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                        .signatures-section { display: flex; justify-content: space-between; margin-top: 8px; padding: 0 40px; font-size: 8.5pt; font-family: "Times New Roman", Times, serif; color: #000; flex-shrink: 0; }
                                        .signature-block { text-align: left; }
                                        .signature-block.right-aligned { text-align: left; padding-right: 40px; }
                                        .sig-label { margin-bottom: 16px; }
                                        .sig-name { text-decoration: underline; font-weight: bold; }
                            `;
                            
                            const roomPrintStyles = `
                                @page { 
                                    size: letter portrait; 
                                    margin: 0.2in 0.25in; 
                                }
                                * {
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                    box-sizing: border-box !important;
                                }
                                html, body { 
                                    margin: 0 !important; 
                                    padding: 0 !important; 
                                    background: #fff !important; 
                                    color: #000 !important;
                                    font-family: Arial, "Times New Roman", Times, serif !important;
                                    height: auto !important;
                                    min-height: 0 !important;
                                    overflow: hidden !important;
                                }
                                .print-wrapper { 
                                    width: 100% !important; 
                                    max-width: 100% !important;
                                    margin: 0 !important; 
                                    padding: 0 !important; 
                                    page-break-after: avoid !important;
                                    break-after: avoid !important;
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .printable-room-utilization,
                                .printable-room-utilization-wrapper { 
                                    display: block !important; 
                                    visibility: visible !important; 
                                    width: 100% !important; 
                                    max-width: 100% !important; 
                                    padding: 0 !important; 
                                    margin: 0 !important; 
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .room-util-header { 
                                    display: flex !important; 
                                    justify-content: flex-start !important; 
                                    align-items: center !important; 
                                    border-bottom: 2.5px solid #f2a900 !important; 
                                    padding-bottom: 4px !important; 
                                    margin-bottom: 8px !important; 
                                    position: relative !important; 
                                    width: 100% !important; 
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .room-util-header img { 
                                    height: 50px !important; 
                                    object-fit: contain !important; 
                                    margin-right: 12px !important; 
                                }
                                .room-util-header-text { 
                                    display: flex !important; 
                                    flex-direction: column !important; 
                                }
                                .room-util-header-text .republic { 
                                    font-size: 8pt !important; 
                                    font-family: Arial, sans-serif !important; 
                                    line-height: 1.15 !important;
                                }
                                .room-util-header-text .univ { 
                                    font-size: 13.5pt !important; 
                                    font-weight: bold !important; 
                                    color: #002060 !important; 
                                    font-family: Arial, sans-serif !important; 
                                    letter-spacing: 0.5px !important; 
                                    line-height: 1.15 !important;
                                }
                                .room-util-header-text .campus { 
                                    font-size: 9pt !important; 
                                    font-family: Arial, sans-serif !important; 
                                    color: #002060 !important; 
                                    font-weight: bold !important; 
                                    line-height: 1.15 !important;
                                }
                                .room-util-titles { 
                                    text-align: center !important; 
                                    margin-bottom: 6px !important; 
                                    width: 100% !important; 
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .room-util-titles h2 { 
                                    font-family: Arial, sans-serif !important; 
                                    color: #2e5296 !important; 
                                    font-size: 10.5pt !important; 
                                    font-weight: bold !important; 
                                    text-transform: uppercase !important; 
                                    margin: 0 0 2px 0 !important; 
                                    line-height: 1.15 !important;
                                }
                                .room-util-titles h3 { 
                                    font-size: 10.5pt !important; 
                                    font-weight: bold !important; 
                                    margin: 0 0 2px 0 !important; 
                                    font-family: Arial, sans-serif !important; 
                                    line-height: 1.15 !important;
                                }
                                .room-util-titles p { 
                                    font-size: 8.5pt !important; 
                                    margin: 0 !important; 
                                    font-family: Arial, sans-serif !important; 
                                    line-height: 1.15 !important;
                                }
                                .room-util-room-name-wrapper { 
                                    margin-bottom: 6px !important; 
                                    width: 100% !important; 
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .room-util-room-name { 
                                    font-size: 9.5pt !important; 
                                    font-weight: bold !important; 
                                    background-color: #ffff00 !important; 
                                    display: inline-block !important; 
                                    padding: 2px 8px !important; 
                                    border: 1px solid #000 !important; 
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                }
                                .room-util-subjects-wrapper { 
                                    width: 100% !important; 
                                    margin-bottom: 8px !important; 
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .room-util-subjects { 
                                    width: 100% !important; 
                                    border-collapse: collapse !important; 
                                    font-family: Arial, sans-serif !important; 
                                    font-size: 7.5pt !important; 
                                    border: 1px solid #000 !important; 
                                    table-layout: fixed !important; 
                                }
                                .room-util-subjects th, .room-util-subjects td { 
                                    border: 1px solid #000 !important; 
                                    padding: 2.5px 4px !important; 
                                    text-align: center !important; 
                                    line-height: 1.15 !important;
                                    box-sizing: border-box !important; 
                                }
                                .room-util-subjects th { 
                                    font-weight: bold !important; 
                                    background-color: #f2f2f2 !important; 
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                }
                                .room-util-timetable-wrapper { 
                                    width: 100% !important; 
                                    margin-bottom: 8px !important; 
                                    overflow: visible !important;
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .room-util-timetable { 
                                    width: 100% !important; 
                                    min-width: unset !important; 
                                    border-collapse: collapse !important; 
                                    font-family: Arial, sans-serif !important; 
                                    font-size: 7.5pt !important; 
                                    table-layout: fixed !important; 
                                    border: 1px solid #000 !important; 
                                    flex: none !important;
                                }
                                .room-util-timetable th, .room-util-timetable td { 
                                    border: 1px solid #000 !important; 
                                    text-align: center !important; 
                                    vertical-align: middle !important; 
                                    padding: 0 !important; 
                                    box-sizing: border-box !important; 
                                }
                                .room-util-timetable th { 
                                    font-size: 7.5pt !important; 
                                    font-weight: bold !important; 
                                    background-color: #f2f2f2 !important; 
                                    padding: 2px 2px !important; 
                                    height: 19px !important;
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                }
                                .room-util-timetable .time-col,
                                .room-util-timetable .time-cell { 
                                    width: 13% !important; 
                                    min-width: 80px !important; 
                                    font-size: 7.5pt !important; 
                                    font-weight: bold !important; 
                                    background-color: #f8fafc !important; 
                                    padding: 1px 2px !important; 
                                    border: 1px solid #000 !important; 
                                    position: static !important; 
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                }
                                .room-util-timetable th.time-header { 
                                    position: static !important; 
                                }
                                .room-util-timetable tr.hour-row td:not(.time-cell):not(.scheduled-cell) { 
                                    border-bottom: none !important; 
                                }
                                .room-util-timetable tr.half-hour-row td:not(.time-cell):not(.scheduled-cell) { 
                                    border-top: none !important; 
                                }
                                .room-util-timetable td { 
                                    height: 19px !important; 
                                    max-height: 19px !important;
                                    line-height: 1.1 !important;
                                }
                                .room-util-timetable td.scheduled-cell,
                                .room-util-timetable td.cell-scheduled { 
                                    background-color: #00b0f0 !important; 
                                    border: 1px solid #000 !important; 
                                    color: #000 !important; 
                                    font-weight: bold !important;
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                }
                                .room-util-timetable .cell-content { 
                                    display: flex !important; 
                                    flex-direction: column !important; 
                                    justify-content: center !important; 
                                    align-items: center !important; 
                                    width: 100% !important; 
                                    height: 100% !important; 
                                    padding: 1px 2px !important; 
                                    box-sizing: border-box !important; 
                                    overflow: hidden !important;
                                }
                                .room-util-timetable .cell-line { 
                                    white-space: nowrap !important; 
                                    overflow: hidden !important; 
                                    text-overflow: ellipsis !important; 
                                    max-width: 100% !important; 
                                    text-align: center !important; 
                                }
                                .room-util-timetable .cell-line-subj {
                                    font-size: 7.5pt !important;
                                    font-weight: bold !important;
                                    line-height: 1.1 !important;
                                }
                                .room-util-timetable .cell-line-comp {
                                    font-size: 6.5pt !important;
                                    line-height: 1.0 !important;
                                    font-weight: normal !important;
                                    color: #111 !important;
                                }
                                .room-util-timetable .cell-line-prof {
                                    font-size: 7pt !important;
                                    font-weight: 600 !important;
                                    line-height: 1.1 !important;
                                }
                                .room-util-timetable .cell-line-room,
                                .room-util-timetable .cell-line-sec,
                                .room-util-timetable .cell-line-room-sec {
                                    font-size: 6.5pt !important;
                                    line-height: 1.05 !important;
                                }
                                .room-util-signatures { 
                                    display: flex !important; 
                                    justify-content: space-between !important; 
                                    padding: 0 10px !important; 
                                    margin-top: 10px !important; 
                                    font-family: Arial, "Times New Roman", Times, serif !important; 
                                    font-size: 8.5pt !important; 
                                    width: 100% !important; 
                                    box-sizing: border-box !important; 
                                    page-break-inside: avoid !important;
                                    page-break-after: avoid !important; 
                                    break-inside: avoid !important;
                                }
                                .sig-block { 
                                    text-align: left !important; 
                                    flex: 1 !important; 
                                    max-width: 32% !important; 
                                }
                                .sig-label { 
                                    margin-bottom: 14px !important; 
                                    font-size: 8.5pt !important; 
                                }
                                .sig-name { 
                                    font-weight: bold !important; 
                                    text-decoration: underline !important; 
                                    display: inline-block !important; 
                                    font-size: 9.5pt !important; 
                                }
                                .sig-title { 
                                    font-size: 8pt !important; 
                                    margin-top: 1px !important; 
                                }
                            `;
                            
                            let printHtml = printContent.innerHTML;
                            if (isRoom) {
                                printHtml = printHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                                const origImg = printContent.querySelector('img');
                                if (origImg && origImg.complete && origImg.naturalWidth > 0) {
                                    try {
                                        const c = document.createElement('canvas');
                                        c.width = origImg.naturalWidth;
                                        c.height = origImg.naturalHeight;
                                        const ctx = c.getContext('2d');
                                        ctx.drawImage(origImg, 0, 0);
                                        const dataUrl = c.toDataURL('image/png');
                                        printHtml = printHtml.replace(/<img[^>]+src="[^"]+"[^>]*>/i, (m) => m.replace(/src="[^"]+"/, `src="${dataUrl}"`));
                                    } catch {
                                        // Keep original src
                                    }
                                }
                            }
                            
                            doc.write(`
                                <html>
                                <head>
                                    <style>
                                        ${isRoom ? roomPrintStyles : isoPrintStyles}
                                    </style>
                                </head>
                                <body><div class="print-wrapper">${printHtml}</div></body>
                                </html>
                            `);
                            doc.close();
                            iframe.contentWindow.focus();
                            logActivity({
                                user,
                                action: LOG_ACTIONS.EXPORT,
                                details: isRoom ? 'Printed room utilization schedule document' : 'Printed ISO format schedule document'
                            });
                            setTimeout(() => {
                                iframe.contentWindow.print();
                                setTimeout(() => {
                                    if (iframe.parentNode) {
                                        document.body.removeChild(iframe);
                                    }
                                }, 2000);
                            }, 300);
                        }} 
                        style={itemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 6 2 18 2 18 9"></polyline>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                            <rect x="6" y="14" width="12" height="8"></rect>
                        </svg>
                        Print Document
                    </button>

                    {/* --- ORDINARY GRID SECTION --- */}
                    <div style={{ padding: '8px 12px', fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--accent-primary)', backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-color)', borderTop: '1px solid var(--border-color)', letterSpacing: '0.5px' }}>
                        ORDINARY GRID
                    </div>

                    {/* Grid Word (.doc) */}
                    <button 
                        onClick={() => {
                            setIsExportOpen(false);
                            window.dispatchEvent(new Event('export-ordinary-word'));
                            logActivity({
                                user,
                                action: LOG_ACTIONS.EXPORT,
                                details: 'Exported ordinary grid schedule to Word (.doc)'
                            });
                        }} 
                        style={itemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="Export editable Word document with schedule grid table"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                        <strong>Word Document (.doc)</strong>
                    </button>


                    {/* Grid Save Image */}
                    <button 
                        onClick={() => {
                            setIsExportOpen(false);
                            window.dispatchEvent(new Event('export-ordinary-image'));
                            logActivity({
                                user,
                                action: LOG_ACTIONS.EXPORT,
                                details: 'Exported ordinary grid schedule image'
                            });
                        }} 
                        style={itemStyle}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                        Save Image (.png)
                    </button>

                    {/* Grid Print */}
                    <button 
                        onClick={() => {
                            setIsExportOpen(false);
                            window.dispatchEvent(new Event('export-ordinary-print'));
                            logActivity({
                                user,
                                action: LOG_ACTIONS.EXPORT,
                                details: 'Printed ordinary grid schedule'
                            });
                        }} 
                        style={{ ...itemStyle, borderBottom: 'none' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 6 2 18 2 18 9"></polyline>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                            <rect x="6" y="14" width="12" height="8"></rect>
                        </svg>
                        Print Document
                    </button>
                </div>
            )}
        </div>
    );
};

export default ExportOptions;

