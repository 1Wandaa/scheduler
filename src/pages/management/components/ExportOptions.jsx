import React, { useState, useEffect } from 'react';

const ExportOptions = ({ isGenerating, setIsGenerating, setPreviewImage }) => {
    const [isExportOpen, setIsExportOpen] = useState(false);

    // Close export dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (isExportOpen && e.target.closest && !e.target.closest('.export-dropdown-container')) {
                setIsExportOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside); // Added for better mobile support
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isExportOpen]);

    return (
        <div className="no-print export-dropdown-container" style={{ position: 'relative', marginLeft: 'auto' }}>
            <button className="btn btn-sm" onClick={() => setIsExportOpen(!isExportOpen)} style={{ background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                {isGenerating ? 'Generating...' : 'Export Options'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            {isExportOpen && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: '200px', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border-color)' }}>ISO FORMAT</div>
                    <button onClick={async () => {
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
                                .iso-schedule-table th, .iso-schedule-table td { border: 1px solid #000; padding: 0; text-align: center; vertical-align: middle; height: 52px; overflow: hidden; box-sizing: border-box; }
                                .iso-schedule-table th { background-color: #f0f0f0 !important; padding: 6px 4px; height: 32px; font-size: 9pt; }
                                .iso-schedule-table .time-cell { white-space: nowrap; font-weight: bold; font-size: 8pt; padding: 2px 4px; }
                                .iso-schedule-table .schedule-cell { padding: 0; height: 52px; overflow: hidden; }
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
                                scale: 2, 
                                useCORS: true,
                                width: 1100,
                                windowWidth: 1100
                            });
                            setPreviewImage(canvas.toDataURL('image/png'));
                        } catch (error) {
                            console.error('Failed to save image:', error);
                            alert('Failed to generate preview. Please try again.');
                        } finally {
                            document.body.removeChild(tempContainer);
                            setIsGenerating(false);
                        }
                    }} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                        Save Image
                    </button>
                    <button onClick={() => {
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
                                    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
                                    body { font-family: "Times New Roman", Times, serif; color: #000; padding: 0.4in; box-sizing: border-box; display: flex; flex-direction: column; page-break-inside: avoid; }
                                    .print-wrapper { width: 100%; max-height: 100%; overflow: hidden; page-break-inside: avoid; }
                                    .iso-header-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 9pt; }
                                    .iso-header-table td, .iso-header-table th { border: 1px solid #000; padding: 4px; text-align: left; }
                                    .iso-header-table .bold { font-weight: bold; }
                                    .iso-header-table .center { text-align: center; }
                                    .meta-info { display: flex; justify-content: space-between; font-size: 9pt; font-weight: bold; margin-bottom: 6px; text-transform: uppercase; }
                                    .meta-value { font-weight: normal; text-decoration: underline; }
                                    .iso-schedule-table { width: 100%; border-collapse: collapse; font-size: 9pt; table-layout: fixed; }
                                    .iso-schedule-table th, .iso-schedule-table td { border: 1px solid #000; padding: 0; text-align: center; vertical-align: middle; height: 48px; overflow: hidden; box-sizing: border-box; }
                                    .iso-schedule-table th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 4px 4px; height: 28px; font-size: 8pt; }
                                    .iso-schedule-table .time-cell { white-space: nowrap; font-weight: bold; font-size: 7pt; padding: 2px 3px; }
                                    .iso-schedule-table .schedule-cell { padding: 0; height: 48px; overflow: hidden; }
                                    .cell-content { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1px 2px; height: 100%; overflow: hidden; box-sizing: border-box; }
                                    .cell-subject { font-weight: bold; font-size: 8pt; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
                                    .cell-professor { font-size: 7pt; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                    .cell-room { font-size: 7pt; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; margin-top: 1px; }
                                    .lunch-break { background-color: #e0e0e0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; letter-spacing: 5px; padding: 2px; height: 26px; overflow: hidden; font-size: 8pt; }
                                    .lunch-break-time { background-color: #e0e0e0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; height: 26px; font-size: 7pt; }
                                </style>
                            </head>
                            <body><div class="print-wrapper">${printContent.innerHTML}</div></body>
                            </html>
                        `);
                        doc.close();
                        iframe.contentWindow.focus();
                        setTimeout(() => {
                            iframe.contentWindow.print();
                            setTimeout(() => document.body.removeChild(iframe), 1000);
                        }, 250);
                    }} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        Print Document
                    </button>
                    <div style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border-color)' }}>ORDINARY GRID</div>
                    <button onClick={() => {
                        setIsExportOpen(false);
                        window.dispatchEvent(new Event('export-ordinary-image'));
                    }} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                        Save Image
                    </button>
                    <button onClick={() => {
                        setIsExportOpen(false);
                        window.dispatchEvent(new Event('export-ordinary-print'));
                    }} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        Print Document
                    </button>
                </div>
            )}
        </div>
    );
};

export default ExportOptions;
