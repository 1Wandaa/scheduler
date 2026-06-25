import Swal from 'sweetalert2';

export const showAutoScheduleModal = (mode, { professors, rooms, sections }, onConfirm) => {
  // --- Modernized Swal Styling Configuration ---
  if (!document.getElementById('modern-swal-styles')) {
    const style = document.createElement('style');
    style.id = 'modern-swal-styles';
    style.innerHTML = `
      .modern-glass-popup {
        border-radius: 24px !important;
        border: 1px solid var(--border-color) !important;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.2) inset !important;
        padding: 32px 24px 24px !important;
        background: var(--card-bg) !important;
        color: var(--text-main) !important;
        backdrop-filter: blur(20px) !important;
        font-family: inherit !important;
      }
      .modern-swal-confirm-btn {
        background: linear-gradient(135deg, var(--accent-primary, #6366f1), #8b5cf6) !important;
        color: white !important;
        border: none !important;
        border-radius: 14px !important;
        padding: 14px 28px !important;
        font-weight: 700 !important;
        font-size: 0.95rem !important;
        cursor: pointer !important;
        box-shadow: 0 6px 16px rgba(99, 102, 241, 0.25) !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        margin: 0 8px !important;
        letter-spacing: 0.02em !important;
      }
      .modern-swal-confirm-btn:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35) !important;
      }
      .modern-swal-cancel-btn {
        background: transparent !important;
        color: var(--text-muted) !important;
        border: 2px solid var(--border-color) !important;
        border-radius: 14px !important;
        padding: 12px 28px !important;
        font-weight: 700 !important;
        font-size: 0.95rem !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        margin: 0 8px !important;
      }
      .modern-swal-cancel-btn:hover {
        background: rgba(0, 0, 0, 0.03) !important;
        color: var(--text-main) !important;
        border-color: rgba(0,0,0,0.15) !important;
      }
      .modern-swal-input {
        border-radius: 12px !important;
        border: 2px solid var(--border-color) !important;
        padding: 14px 18px !important;
        font-size: 0.95rem !important;
        background: var(--bg-main) !important;
        color: var(--text-main) !important;
        margin: 24px 0 0 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        display: block !important;
        box-sizing: border-box !important;
        font-weight: 500 !important;
        box-shadow: inset 0 2px 6px rgba(0,0,0,0.02) !important;
        transition: all 0.2s ease !important;
        appearance: none !important;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") !important;
        background-repeat: no-repeat !important;
        background-position: right 16px center !important;
      }
      .modern-swal-input:focus {
        border-color: var(--accent-primary, #6366f1) !important;
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15) !important;
        outline: none !important;
      }
      .modern-swal-actions {
        display: flex !important;
        gap: 12px !important;
        width: 100% !important;
        margin-top: 1.5em !important;
        justify-content: center !important;
      }
      @media (max-width: 480px) {
        .modern-swal-actions {
          flex-direction: column !important;
          gap: 10px !important;
        }
        .modern-swal-confirm-btn, .modern-swal-cancel-btn {
          width: 100% !important;
          margin: 0 !important;
        }
        .modern-glass-popup {
          padding: 24px 16px 20px !important;
          width: 92% !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const swalConfig = {
    background: 'transparent',
    backdrop: 'rgba(15, 20, 35, 0.5)',
    customClass: {
      popup: 'modern-glass-popup',
      confirmButton: 'modern-swal-confirm-btn',
      cancelButton: 'modern-swal-cancel-btn',
      input: 'modern-swal-input',
      actions: 'modern-swal-actions'
    },
    buttonsStyling: false,
    showClass: { popup: 'animate__animated animate__zoomIn animate__faster' },
    hideClass: { popup: 'animate__animated animate__zoomOut animate__faster' }
  };

  if (mode === 'ga') {
    Swal.fire({
      ...swalConfig,
      html: `
        <div style="text-align: center;">
          <div style="width: 72px; height: 72px; background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12)); border-radius: 22px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; border: 1px solid rgba(99,102,241,0.25); box-shadow: 0 8px 20px rgba(99,102,241,0.15);">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          </div>
          <h2 style="margin: 0 0 12px; font-size: 1.5rem; font-weight: 800; color: var(--text-main); letter-spacing: -0.03em;">Generate Full Timetable?</h2>
          <p style="margin: 0; font-size: 0.95rem; color: var(--text-muted); line-height: 1.6;">This will use the powerful Genetic Algorithm engine to automatically generate conflict-free schedules for all sections.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Generate Now',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        onConfirm({ mode: 'ga' });
      } else {
        onConfirm(null);
      }
    });
  } else {
    let options = {};
    let title = '';
    let color = '';
    let icon = '';
    if (mode === 'faculty') {
      title = 'Faculty';
      color = '#10b981';
      icon = '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>';
      professors.forEach(p => { options[p.id] = p.name; });
    } else if (mode === 'room') {
      title = 'Room';
      color = '#f59e0b';
      icon = '<path d="M3 9l9-7 9 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-1"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>';
      rooms.forEach(r => { options[r.id] = r.name; });
    } else if (mode === 'section') {
      title = 'Section';
      color = '#8b5cf6';
      icon = '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>';
      sections.forEach(s => { options[s.id] = s.name; });
    }

    Swal.fire({
      ...swalConfig,
      html: `
        <div style="text-align: center; margin-bottom: 8px;">
          <div style="width: 72px; height: 72px; background: linear-gradient(135deg, ${color}1A, ${color}0D); border-radius: 22px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; border: 1px solid ${color}33; box-shadow: 0 8px 20px ${color}20;">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
          </div>
          <h2 style="margin: 0 0 12px; font-size: 1.5rem; font-weight: 800; color: var(--text-main); letter-spacing: -0.03em;">Generate by ${title}</h2>
          <p style="margin: 0; font-size: 0.95rem; color: var(--text-muted); line-height: 1.6;">Please select a specific ${title.toLowerCase()} to generate an optimized schedule for.</p>
        </div>
      `,
      input: 'select',
      inputOptions: options,
      inputPlaceholder: `Choose a ${title.toLowerCase()}...`,
      showCancelButton: true,
      confirmButtonText: 'Generate Now',
      cancelButtonText: 'Cancel',
      inputValidator: (value) => {
        return new Promise((resolve) => {
          if (value) resolve();
          else resolve(`You need to select a ${title.toLowerCase()}`);
        });
      }
    }).then((result) => {
      if (result.isConfirmed) {
        onConfirm({ mode, targetId: result.value });
      } else {
        onConfirm(null);
      }
    });
  }
};
