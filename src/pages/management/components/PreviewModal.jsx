import React from 'react';

const PreviewModal = ({ previewImage, setPreviewImage, titleName }) => {
    if (!previewImage) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '900px', width: '90%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ margin: 0 }}>Schedule Preview</h3>
                    <button onClick={() => setPreviewImage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '20px', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'center' }}>
                    <img src={previewImage} alt="Schedule Preview" style={{ maxWidth: '100%', height: 'auto' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button className="btn" style={{ background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)' }} onClick={() => setPreviewImage(null)}>
                        Cancel
                    </button>
                    <button className="btn" onClick={() => {
                        const link = document.createElement('a');
                        link.download = `${titleName}-Schedule.png`;
                        link.href = previewImage;
                        link.click();
                        setPreviewImage(null);
                    }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Download Image
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PreviewModal;
