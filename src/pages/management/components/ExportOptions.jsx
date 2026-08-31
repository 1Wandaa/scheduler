import React, { useState, useEffect } from 'react';
import { logActivity, LOG_ACTIONS } from '../../../utils/activityLogger';
import { exportIsoToWord, exportGridToWord } from '../../../utils/scheduleExportUtils';

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
        <div className="no-print export-dropdown-container" style={{ position: 'relative', marginLeft: 'auto' }}>
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
                <div style={{ 
                    position: 'absolute', 
                    top: '100%', 
                    right: 0, 
                    marginTop: '8px', 
                    background: 'white', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '8px', 
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', 
                    zIndex: 100, 
                    minWidth: '220px', 
                    overflow: 'hidden' 
                }}>
                    {/* --- ISO FORMAT SECTION --- */}
                    <div style={{ padding: '8px 12px', fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--accent-primary)', backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-color)', letterSpacing: '0.5px' }}>
                        ISO 9001:2015 FORMAT
                    </div>
                    
                    {/* Word Document (.doc) */}
                    <button 
                        onClick={() => {
                            setIsExportOpen(false);
                            exportIsoToWord(user);
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
                            const printContent = document.querySelector('.printable-iso-document');
                            if (!printContent) {
                                setIsGenerating(false);
                                return;
                            }
                            const tempContainer = document.createElement('div');
                            tempContainer.style.position = 'absolute';
                            tempContainer.style.top = '-10000px';
                            tempContainer.style.left = '-10000px';
                            tempContainer.style.width = '1100px'; 
                            tempContainer.style.backgroundColor = 'white';
                            tempContainer.innerHTML = `
                                <style>
                                    .iso-header-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9pt; font-family: "Times New Roman", Times, serif; color: #000; }
                                    .iso-header-table td, .iso-header-table th { border: 1px solid #000; padding: 4px; text-align: left; }
                                    .iso-header-table .bold { font-weight: bold; }
                                    .iso-header-table .center { text-align: center; }
                                    .meta-info { display: flex; justify-content: space-between; font-size: 9pt; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; font-family: "Times New Roman", Times, serif; color: #000; }
                                    .meta-value { font-weight: normal; text-decoration: underline; }
                                    .iso-schedule-table { width: 100%; border-collapse: collapse; font-size: 9pt; font-family: "Times New Roman", Times, serif; color: #000; table-layout: fixed; }
                                    .iso-schedule-table tr { height: 38px; }
                                    .iso-schedule-table th, .iso-schedule-table td { border: 1px solid #000; padding: 0; text-align: center; vertical-align: middle; height: 38px; overflow: hidden; box-sizing: border-box; }
                                    .iso-schedule-table th { background-color: #f0f0f0 !important; padding: 6px 4px; height: 32px; font-size: 9pt; }
                                    .iso-schedule-table .time-cell { white-space: nowrap; font-weight: bold; font-size: 8pt; padding: 2px 4px; }
                                    .iso-schedule-table .schedule-cell { padding: 0; height: 38px; overflow: hidden; }
                                    .cell-content { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px 3px; height: 100%; overflow: hidden; box-sizing: border-box; }
                                    .cell-subject { font-weight: bold; font-size: 9pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
                                    .cell-professor { font-size: 8pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                    .cell-room { font-size: 8pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                    .lunch-break { background-color: #e0e0e0 !important; font-weight: bold; letter-spacing: 5px; padding: 4px; height: 30px; overflow: hidden; font-size: 9pt; }
                                    .lunch-break-time { background-color: #e0e0e0 !important; height: 30px; font-size: 8pt; }
                                </style>
                                <div style="padding: 40px;">
                                    ${printContent.innerHTML}
                                </div>
                            `;
                            document.body.appendChild(tempContainer);
                            
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
                            const printContent = document.querySelector('.printable-iso-document');
                            if (!printContent) return;
                            const iframe = document.createElement('iframe');
                            iframe.style.position = 'fixed';
                            iframe.style.top = '-10000px';
                            iframe.style.left = '-10000px';
                            iframe.style.width = '0';
                            iframe.style.height = '0';
                            document.body.appendChild(iframe);
                            const doc = iframe.contentDocument || iframe.contentWindow.document;
                            doc.open();
                            doc.write(`
                                <html>
                                <head>
                                    <style>
                                        @page { size: letter landscape; margin: 0; }
                                        html, body { margin: 0; padding: 0; height: 100vh; overflow: hidden; }
                                        body { font-family: "Times New Roman", Times, serif; color: #000; padding: 0.3in; box-sizing: border-box; display: flex; flex-direction: column; }
                                        .print-wrapper { width: 100%; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
                                        .printable-iso-document { display: flex; flex-direction: column; flex: 1; height: 100%; overflow: hidden; }
                                        .printable-iso-document > div:last-child { flex-shrink: 0; margin-top: 10px !important; }
                                        .iso-header-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 9pt; flex-shrink: 0; }
                                        .iso-header-table td, .iso-header-table th { border: 1px solid #000; padding: 4px; text-align: left; }
                                        .iso-header-table .bold { font-weight: bold; }
                                        .iso-header-table .center { text-align: center; }
                                        .meta-info { display: flex; justify-content: space-between; font-size: 9pt; font-weight: bold; margin-bottom: 6px; text-transform: uppercase; flex-shrink: 0; }
                                        .meta-value { font-weight: normal; text-decoration: underline; }
                                        .iso-schedule-table { width: 100%; border-collapse: collapse; font-size: 9pt; table-layout: fixed; flex: 1; height: 100%; margin: 0; }
                                        .iso-schedule-table tr { height: 38px; }
                                        .iso-schedule-table th, .iso-schedule-table td { border: 1px solid #000; padding: 0; text-align: center; vertical-align: middle; height: 38px; overflow: hidden; box-sizing: border-box; }
                                        .iso-schedule-table th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 2px 4px; font-size: 9pt; height: 4vh; }
                                        .iso-schedule-table .time-cell { white-space: nowrap; font-weight: bold; font-size: 8pt; padding: 2px 4px; }
                                        .iso-schedule-table .schedule-cell { padding: 0; overflow: hidden; }
                                        .cell-content { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px 3px; height: 100%; overflow: hidden; box-sizing: border-box; }
                                        .cell-subject { font-weight: bold; font-size: 9pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
                                        .cell-professor { font-size: 8pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                        .cell-room { font-size: 8pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                        .lunch-break { background-color: #e0e0e0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; letter-spacing: 5px; padding: 2px; overflow: hidden; font-size: 9pt; height: 4vh; }
                                        .lunch-break-time { background-color: #e0e0e0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 8pt; height: 4vh; }
                                    </style>
                                </head>
                                <body><div class="print-wrapper">${printContent.innerHTML}</div></body>
                                </html>
                            `);
                            doc.close();
                            iframe.contentWindow.focus();
                            logActivity({
                                user,
                                action: LOG_ACTIONS.EXPORT,
                                details: 'Printed ISO format schedule document'
                            });
                            setTimeout(() => {
                                iframe.contentWindow.print();
                                setTimeout(() => document.body.removeChild(iframe), 1000);
                            }, 250);
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
                            exportGridToWord(null, user);
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

