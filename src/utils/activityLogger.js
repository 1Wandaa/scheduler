/**
 * activityLogger.js
 * Utility to write user activity logs to Firestore's `activityLogs` collection.
 *
 * Usage:
 *   import { logActivity } from '../../utils/activityLogger';
 *   await logActivity({ user, action: 'ADD_SCHEDULE', details: 'Added CS101 to Room A' });
 */

import { db } from '../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Categories / action types for filtering in the UI.
 */
export const LOG_ACTIONS = {
  // Auth
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',

  // Schedule
  ADD_SCHEDULE: 'ADD_SCHEDULE',
  UPDATE_SCHEDULE: 'UPDATE_SCHEDULE',
  DELETE_SCHEDULE: 'DELETE_SCHEDULE',
  BATCH_DELETE_SCHEDULES: 'BATCH_DELETE_SCHEDULES',
  CLEAR_SCHEDULES: 'CLEAR_SCHEDULES',
  AUTO_SCHEDULE: 'AUTO_SCHEDULE',
  PUBLISH_TERM: 'PUBLISH_TERM',
  UNPUBLISH_TERM: 'UNPUBLISH_TERM',

  // Faculty
  ADD_FACULTY: 'ADD_FACULTY',
  UPDATE_FACULTY: 'UPDATE_FACULTY',
  DELETE_FACULTY: 'DELETE_FACULTY',

  // Subject
  ADD_SUBJECT: 'ADD_SUBJECT',
  UPDATE_SUBJECT: 'UPDATE_SUBJECT',
  DELETE_SUBJECT: 'DELETE_SUBJECT',

  // Room
  ADD_ROOM: 'ADD_ROOM',
  UPDATE_ROOM: 'UPDATE_ROOM',
  DELETE_ROOM: 'DELETE_ROOM',

  // Section
  ADD_SECTION: 'ADD_SECTION',
  UPDATE_SECTION: 'UPDATE_SECTION',
  DELETE_SECTION: 'DELETE_SECTION',

  // Department
  ADD_DEPARTMENT: 'ADD_DEPARTMENT',
  UPDATE_DEPARTMENT: 'UPDATE_DEPARTMENT',
  DELETE_DEPARTMENT: 'DELETE_DEPARTMENT',

  // Course
  ADD_COURSE: 'ADD_COURSE',
  UPDATE_COURSE: 'UPDATE_COURSE',
  DELETE_COURSE: 'DELETE_COURSE',

  // Terms / Academic Settings
  ADD_TERM: 'ADD_TERM',
  UPDATE_TERM: 'UPDATE_TERM',
  DELETE_TERM: 'DELETE_TERM',

  // User management
  ADD_USER: 'ADD_USER',
  UPDATE_USER: 'UPDATE_USER',
  DELETE_USER: 'DELETE_USER',

  // Recycle Bin / Trash
  RESTORE_DATA: 'RESTORE_DATA',
  PERMANENT_DELETE: 'PERMANENT_DELETE',
  EMPTY_RECYCLE_BIN: 'EMPTY_RECYCLE_BIN',

  // General
  VIEW_PAGE: 'VIEW_PAGE',
  EXPORT: 'EXPORT',
};

/** Maps action to a human-readable label */
export const ACTION_LABELS = {
  LOGIN:                  'Logged In',
  LOGOUT:                 'Logged Out',
  ADD_SCHEDULE:           'Added Schedule',
  UPDATE_SCHEDULE:        'Updated Schedule',
  DELETE_SCHEDULE:        'Deleted Schedule',
  BATCH_DELETE_SCHEDULES: 'Batch Deleted Schedules',
  CLEAR_SCHEDULES:        'Cleared All Schedules',
  AUTO_SCHEDULE:          'Auto-Scheduled',
  PUBLISH_TERM:           'Published Term',
  UNPUBLISH_TERM:         'Unpublished Term',
  ADD_FACULTY:            'Added Faculty',
  UPDATE_FACULTY:         'Updated Faculty',
  DELETE_FACULTY:         'Deleted Faculty',
  ADD_SUBJECT:            'Added Subject',
  UPDATE_SUBJECT:         'Updated Subject',
  DELETE_SUBJECT:         'Deleted Subject',
  ADD_ROOM:               'Added Room',
  UPDATE_ROOM:            'Updated Room',
  DELETE_ROOM:            'Deleted Room',
  ADD_SECTION:            'Added Section',
  UPDATE_SECTION:         'Updated Section',
  DELETE_SECTION:         'Deleted Section',
  ADD_DEPARTMENT:         'Added Department',
  UPDATE_DEPARTMENT:      'Updated Department',
  DELETE_DEPARTMENT:      'Deleted Department',
  ADD_COURSE:             'Added Course',
  UPDATE_COURSE:          'Updated Course',
  DELETE_COURSE:          'Deleted Course',
  ADD_TERM:               'Added Term/Year',
  UPDATE_TERM:            'Updated Term/Year',
  DELETE_TERM:            'Deleted Term/Year',
  ADD_USER:               'Added User',
  UPDATE_USER:            'Updated User',
  DELETE_USER:            'Deleted User',
  RESTORE_DATA:           'Restored from Trash',
  PERMANENT_DELETE:       'Permanently Deleted',
  EMPTY_RECYCLE_BIN:      'Emptied Recycle Bin',
  VIEW_PAGE:              'Viewed Page',
  EXPORT:                 'Exported Data',
};

/** Maps action to a color for the badge */
export const ACTION_COLORS = {
  LOGIN:                  '#10b981',
  LOGOUT:                 '#64748b',
  ADD_SCHEDULE:           '#6366f1',
  UPDATE_SCHEDULE:        '#f59e0b',
  DELETE_SCHEDULE:        '#ef4444',
  BATCH_DELETE_SCHEDULES: '#ef4444',
  CLEAR_SCHEDULES:        '#dc2626',
  AUTO_SCHEDULE:          '#8b5cf6',
  PUBLISH_TERM:           '#10b981',
  UNPUBLISH_TERM:         '#f59e0b',
  ADD_FACULTY:            '#0ea5e9',
  UPDATE_FACULTY:         '#f59e0b',
  DELETE_FACULTY:         '#ef4444',
  ADD_SUBJECT:            '#0ea5e9',
  UPDATE_SUBJECT:         '#f59e0b',
  DELETE_SUBJECT:         '#ef4444',
  ADD_ROOM:               '#0ea5e9',
  UPDATE_ROOM:            '#f59e0b',
  DELETE_ROOM:            '#ef4444',
  ADD_SECTION:            '#0ea5e9',
  UPDATE_SECTION:         '#f59e0b',
  DELETE_SECTION:         '#ef4444',
  ADD_DEPARTMENT:         '#0ea5e9',
  UPDATE_DEPARTMENT:      '#f59e0b',
  DELETE_DEPARTMENT:      '#ef4444',
  ADD_COURSE:             '#0ea5e9',
  UPDATE_COURSE:          '#f59e0b',
  DELETE_COURSE:          '#ef4444',
  ADD_TERM:               '#0ea5e9',
  UPDATE_TERM:            '#f59e0b',
  DELETE_TERM:            '#ef4444',
  ADD_USER:               '#0ea5e9',
  UPDATE_USER:            '#f59e0b',
  DELETE_USER:            '#ef4444',
  RESTORE_DATA:           '#10b981',
  PERMANENT_DELETE:       '#dc2626',
  EMPTY_RECYCLE_BIN:      '#dc2626',
  VIEW_PAGE:              '#64748b',
  EXPORT:                 '#8b5cf6',
};

/** Maps action to an SVG icon path for the badge */
export const ACTION_ICONS = {
  LOGIN:                  'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  LOGOUT:                 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  ADD_SCHEDULE:           'M12 5v14M5 12h14',
  UPDATE_SCHEDULE:        'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  DELETE_SCHEDULE:        'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  BATCH_DELETE_SCHEDULES: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  CLEAR_SCHEDULES:        'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  AUTO_SCHEDULE:          'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  PUBLISH_TERM:           'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  UNPUBLISH_TERM:         'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
  ADD_FACULTY:            'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  UPDATE_FACULTY:         'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  DELETE_FACULTY:         'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ADD_SUBJECT:            'M12 2l10 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z',
  UPDATE_SUBJECT:         'M12 2l10 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z',
  DELETE_SUBJECT:         'M12 2l10 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z',
  ADD_ROOM:               'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  UPDATE_ROOM:            'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  DELETE_ROOM:            'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ADD_SECTION:            'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  UPDATE_SECTION:         'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  DELETE_SECTION:         'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ADD_DEPARTMENT:         'M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4',
  UPDATE_DEPARTMENT:      'M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4',
  DELETE_DEPARTMENT:      'M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4',
  ADD_COURSE:             'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  UPDATE_COURSE:          'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  DELETE_COURSE:          'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  ADD_TERM:               'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  UPDATE_TERM:            'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  DELETE_TERM:            'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  ADD_USER:               'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  UPDATE_USER:            'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  DELETE_USER:            'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  RESTORE_DATA:           'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8m0 0V3m0 5h5',
  PERMANENT_DELETE:       'M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16',
  EMPTY_RECYCLE_BIN:      'M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16',
  VIEW_PAGE:              'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  EXPORT:                 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
};

/**
 * Writes an activity log entry to Firestore.
 *
 * @param {object} params
 * @param {object|null} params.user       - The current user object from auth context
 * @param {string}      params.action     - One of LOG_ACTIONS values
 * @param {string}      [params.details]  - A human-readable description of what happened
 * @param {object}      [params.meta]     - Optional extra metadata to store
 */
export async function logActivity({ user, action, details = '', meta = {} }) {
  try {
    await addDoc(collection(db, 'activityLogs'), {
      action,
      details,
      meta,
      username: user?.username || user?.name || 'Unknown',
      userRole: user?.role || 'Unknown',
      timestamp: serverTimestamp(),
      // Store a client-side timestamp too as a fallback for immediate sorting
      clientTimestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Activity logging should never crash the app
    console.warn('[ActivityLogger] Failed to log activity:', err);
  }
}
