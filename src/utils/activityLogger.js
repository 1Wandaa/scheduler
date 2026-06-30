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

  // User management
  ADD_USER: 'ADD_USER',
  UPDATE_USER: 'UPDATE_USER',
  DELETE_USER: 'DELETE_USER',

  // General
  VIEW_PAGE: 'VIEW_PAGE',
  EXPORT: 'EXPORT',
};

/** Maps action to a human-readable label */
export const ACTION_LABELS = {
  LOGIN:            'Logged In',
  LOGOUT:           'Logged Out',
  ADD_SCHEDULE:     'Added Schedule',
  UPDATE_SCHEDULE:  'Updated Schedule',
  DELETE_SCHEDULE:  'Deleted Schedule',
  CLEAR_SCHEDULES:  'Cleared All Schedules',
  AUTO_SCHEDULE:    'Auto-Scheduled',
  PUBLISH_TERM:     'Published Term',
  UNPUBLISH_TERM:   'Unpublished Term',
  ADD_FACULTY:      'Added Faculty',
  UPDATE_FACULTY:   'Updated Faculty',
  DELETE_FACULTY:   'Deleted Faculty',
  ADD_SUBJECT:      'Added Subject',
  UPDATE_SUBJECT:   'Updated Subject',
  DELETE_SUBJECT:   'Deleted Subject',
  ADD_ROOM:         'Added Room',
  UPDATE_ROOM:      'Updated Room',
  DELETE_ROOM:      'Deleted Room',
  ADD_SECTION:      'Added Section',
  UPDATE_SECTION:   'Updated Section',
  DELETE_SECTION:   'Deleted Section',
  ADD_USER:         'Added User',
  UPDATE_USER:      'Updated User',
  DELETE_USER:      'Deleted User',
  VIEW_PAGE:        'Viewed Page',
  EXPORT:           'Exported Data',
};

/** Maps action to a color for the badge */
export const ACTION_COLORS = {
  LOGIN:            '#10b981',
  LOGOUT:           '#64748b',
  ADD_SCHEDULE:     '#6366f1',
  UPDATE_SCHEDULE:  '#f59e0b',
  DELETE_SCHEDULE:  '#ef4444',
  CLEAR_SCHEDULES:  '#ef4444',
  AUTO_SCHEDULE:    '#8b5cf6',
  PUBLISH_TERM:     '#10b981',
  UNPUBLISH_TERM:   '#f59e0b',
  ADD_FACULTY:      '#0ea5e9',
  UPDATE_FACULTY:   '#f59e0b',
  DELETE_FACULTY:   '#ef4444',
  ADD_SUBJECT:      '#0ea5e9',
  UPDATE_SUBJECT:   '#f59e0b',
  DELETE_SUBJECT:   '#ef4444',
  ADD_ROOM:         '#0ea5e9',
  UPDATE_ROOM:      '#f59e0b',
  DELETE_ROOM:      '#ef4444',
  ADD_SECTION:      '#0ea5e9',
  UPDATE_SECTION:   '#f59e0b',
  DELETE_SECTION:   '#ef4444',
  ADD_USER:         '#0ea5e9',
  UPDATE_USER:      '#f59e0b',
  DELETE_USER:      '#ef4444',
  VIEW_PAGE:        '#64748b',
  EXPORT:           '#8b5cf6',
};

/** Maps action to an SVG icon path for the badge */
export const ACTION_ICONS = {
  LOGIN:            'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  LOGOUT:           'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  ADD_SCHEDULE:     'M12 5v14M5 12h14',
  UPDATE_SCHEDULE:  'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  DELETE_SCHEDULE:  'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  CLEAR_SCHEDULES:  'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  AUTO_SCHEDULE:    'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  PUBLISH_TERM:     'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  UNPUBLISH_TERM:   'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
  ADD_FACULTY:      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  UPDATE_FACULTY:   'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  DELETE_FACULTY:   'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ADD_SUBJECT:      'M12 2l10 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z',
  UPDATE_SUBJECT:   'M12 2l10 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z',
  DELETE_SUBJECT:   'M12 2l10 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z',
  ADD_ROOM:         'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  UPDATE_ROOM:      'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  DELETE_ROOM:      'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ADD_SECTION:      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  UPDATE_SECTION:   'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  DELETE_SECTION:   'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ADD_USER:         'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  UPDATE_USER:      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  DELETE_USER:      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  VIEW_PAGE:        'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  EXPORT:           'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
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
