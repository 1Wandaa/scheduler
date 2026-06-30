import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, query, where, getDocs, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import './Profile.css';

const DEPARTMENT_PROGRAM = {
  'BSCS': 'BS Computer Science',
  'BAEL': 'Bachelor of Arts in English Language',
  'BSOA': 'Bachelor of Science in Office Administration',
  'BSFT': 'Bachelor of Science in Food Technology',
};

const DEPARTMENT_LABELS = {
  'BSCS': 'Bachelor of Science in Computer Science (BSCS)',
  'BAEL': 'Bachelor of Arts in English Language (BAEL)',
  'BSOA': 'Bachelor of Science in Office Administration (BSOA)',
  'BSFT': 'Bachelor of Science in Food Technology (BSFT)',
};

const YEAR_LEVELS = [
  { value: 1, label: '1st Year' },
  { value: 2, label: '2nd Year' },
  { value: 3, label: '3rd Year' },
  { value: 4, label: '4th Year' },
];

const Profile = ({ user, onBack, readOnly }) => {
  const [userData, setUserData] = useState(null);
  const [docId, setDocId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form states
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [studentId, setStudentId] = useState('');
  const [department, setDepartment] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [section, setSection] = useState('');

  // Sections from Firestore for dropdown
  const [firestoreSections, setFirestoreSections] = useState([]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const cleanUsername = user.username.replace('@', '').toLowerCase().trim();
        const q = query(collection(db, 'users'), where('username', '==', cleanUsername));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const uDoc = snap.docs[0];
          setDocId(uDoc.id);
          const data = uDoc.data();
          setUserData(data);

          setFullName(data.name || '');
          setAge(data.age ? data.age.toString() : '');
          setGender(data.gender || '');
          setStudentId(data.studentId || '');
          setDepartment(data.department || '');
          setYearLevel(data.yearLevel ? data.yearLevel.toString() : '');
          setSection(data.section || '');
        } else {
          // fallback query to try exact
          const q2 = query(collection(db, 'users'), where('username', '==', user.username));
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            const uDoc2 = snap2.docs[0];
            setDocId(uDoc2.id);
            const data2 = uDoc2.data();
            setUserData(data2);

            setFullName(data2.name || '');
            setAge(data2.age ? data2.age.toString() : '');
            setGender(data2.gender || '');
            setStudentId(data2.studentId || '');
            setDepartment(data2.department || '');
            setYearLevel(data2.yearLevel ? data2.yearLevel.toString() : '');
            setSection(data2.section || '');
          }
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.username) {
      fetchUser();
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'sections'), (snapshot) => {
      const secs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setFirestoreSections(secs);
    });
    return () => unsubscribe();
  }, []);

  const derivedProgram = department ? (DEPARTMENT_PROGRAM[department] || '') : '';

  const availableSections = firestoreSections.filter(sec => {
    if (!derivedProgram) return false;
    const matchesProgram = sec.program === derivedProgram;
    const matchesYear = yearLevel ? sec.yearLevel === parseInt(yearLevel) : true;
    return matchesProgram && matchesYear;
  });

  const handleDepartmentChange = (val) => {
    setDepartment(val);
    setSection('');
  };

  const handleYearLevelChange = (val) => {
    setYearLevel(val);
    setSection('');
  };

  const handleCancel = () => {
    if (userData) {
      setFullName(userData.name || '');
      setAge(userData.age ? userData.age.toString() : '');
      setGender(userData.gender || '');
      setStudentId(userData.studentId || '');
      setDepartment(userData.department || '');
      setYearLevel(userData.yearLevel ? userData.yearLevel.toString() : '');
      setSection(userData.section || '');
    }
    setIsEditing(false);
    setMessage({ type: '', text: '' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!docId) return;

    setMessage({ type: '', text: '' });
    setSaving(true);

    try {
      // Basic validation
      if (!fullName.trim()) throw new Error('Full Name is required.');
      if (!age || parseInt(age) <= 0) throw new Error('Age is required.');
      if (!gender) throw new Error('Gender is required.');
      if (!studentId.trim()) throw new Error('ID Number is required.');
      if (!department) throw new Error('Department is required.');

      // Check if ID is already used by another user
      const studentIdQuery = query(collection(db, 'users'), where('studentId', '==', studentId.trim()));
      const studentIdSnap = await getDocs(studentIdQuery);
      const duplicate = studentIdSnap.docs.find(d => d.id !== docId);
      if (duplicate) {
        throw new Error('An account with this ID Number already exists.');
      }

      const updateData = {
        name: fullName,
        age: parseInt(age) || null,
        gender: gender,
        studentId: studentId.trim(),
        department,
        program: derivedProgram,
        ...(yearLevel && { yearLevel: parseInt(yearLevel) }),
        ...(section && { section }),
      };

      await updateDoc(doc(db, 'users', docId), updateData);
      setUserData({ ...userData, ...updateData });
      setIsEditing(false);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="spinner"></div>
        <p>Loading Profile...</p>
      </div>
    );
  }

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="profile-wrapper animation-fade-in">
      {onBack && (
        <button className="btn-back-floating" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          Back to Dashboard
        </button>
      )}

      {message.text && (
        <div className={`profile-toast ${message.type}`}>
          {message.type === 'success' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          )}
          {message.text}
        </div>
      )}

      <div className="profile-hero">
        <div className="profile-hero-gradient"></div>
        <div className="profile-hero-content">
          <div className="profile-avatar-container">
            <div className="profile-avatar">
              {getInitials(fullName)}
            </div>
            <div className={`profile-role-badge ${(userData?.role || user.role)?.toLowerCase()}`}>
              {userData?.role || user.role}
            </div>
          </div>
          <div className="profile-hero-text">
            <h1 className="profile-name-title">{fullName || 'User'}</h1>
            <p className="profile-username-subtitle">@{user.username}</p>
          </div>

          <div className="profile-header-actions">
            {!readOnly && (
              !isEditing ? (
                <button className="btn-premium-edit" onClick={() => setIsEditing(true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  Edit Profile
                </button>
              ) : (
                <button className="btn-premium-cancel" onClick={handleCancel}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  Cancel Edit
                </button>
              )
            )}
          </div>
        </div>
      </div>

      <div className="profile-body">
        <form onSubmit={handleSave} className="profile-cards-grid">

          {/* PERSONAL INFO CARD */}
          <div className="profile-glass-card">
            <div className="glass-card-header">
              <div className="glass-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
              <h3>Personal Information</h3>
            </div>
            <div className="glass-card-content">
              <div className="form-grid">

                <div className="form-field full-width">
                  <label>Full Name</label>
                  {!isEditing ? (
                    <div className="read-only-value">{fullName}</div>
                  ) : (
                    <input required type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
                  )}
                </div>

                <div className="form-field">
                  <label>Age</label>
                  {!isEditing ? (
                    <div className="read-only-value">{age || '—'}</div>
                  ) : (
                    <input required type="number" min="1" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 20" />
                  )}
                </div>

                <div className="form-field">
                  <label>Gender</label>
                  {!isEditing ? (
                    <div className="read-only-value">{gender || '—'}</div>
                  ) : (
                    <select required value={gender} onChange={e => setGender(e.target.value)}>
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ACADEMIC INFO CARD */}
          <div className="profile-glass-card">
            <div className="glass-card-header">
              <div className="glass-card-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div>
              <h3>Academic Information</h3>
            </div>
            <div className="glass-card-content">
              <div className="form-grid">

                <div className="form-field full-width">
                  <label>ID Number</label>
                  {!isEditing ? (
                    <div className="read-only-value">{studentId || '—'}</div>
                  ) : (
                    <input required type="text" value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="e.g. 2023-131151" />
                  )}
                </div>

                <div className="form-field full-width">
                  <label>Department / Program</label>
                  {!isEditing ? (
                    <div className="read-only-value">{department ? (DEPARTMENT_LABELS[department] || department) : '—'}</div>
                  ) : (
                    <select required value={department} onChange={e => handleDepartmentChange(e.target.value)}>
                      <option value="">Select your program</option>
                      {Object.keys(DEPARTMENT_PROGRAM).map(dept => (
                        <option key={dept} value={dept}>{DEPARTMENT_LABELS[dept] || dept}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="form-field">
                  <label>Year Level {!isEditing && <span className="opt-label"></span>}</label>
                  {!isEditing ? (
                    <div className="read-only-value">{yearLevel ? YEAR_LEVELS.find(y => y.value.toString() === yearLevel)?.label : '—'}</div>
                  ) : (
                    <select value={yearLevel} onChange={e => handleYearLevelChange(e.target.value)} disabled={!department}>
                      <option value="">Select</option>
                      {YEAR_LEVELS.map(yl => (
                        <option key={yl.value} value={yl.value}>{yl.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="form-field">
                  <label>Section {!isEditing && <span className="opt-label"></span>}</label>
                  {!isEditing ? (
                    <div className="read-only-value">{section || '—'}</div>
                  ) : (
                    <select value={section} onChange={e => setSection(e.target.value)} disabled={!department || !yearLevel}>
                      <option value="">
                        {!department ? 'Select dept first' : !yearLevel ? 'Select year first' : availableSections.length === 0 ? 'No sections' : 'Select Section'}
                      </option>
                      {availableSections.map(sec => (
                        <option key={sec.id} value={sec.name}>{sec.name}</option>
                      ))}
                    </select>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* SAVE ACTIONS */}
          {isEditing && (
            <div className="profile-save-container">
              <button type="submit" className="btn-premium-save" disabled={saving}>
                {saving ? (
                  <span className="saving-text"><div className="mini-spinner"></div> Saving Changes...</span>
                ) : (
                  <span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save Changes</span>
                )}
              </button>
            </div>
          )}

        </form>
      </div>
    </div>
  );
};

export default Profile;
