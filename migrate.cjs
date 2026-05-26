const fs = require('fs');
const path = require('path');

const srcDir = path.join(process.cwd(), 'src');

const moveMap = {
  'firebase.js': 'config/firebase.js',
  'initial.js': 'config/initialData.js',
  'index.js': 'config/constants.js',
  'ScheduleGA.js': 'utils/ScheduleGA.js',
  'App.css': 'styles/App.css',
  'AutoScheduler.css': 'styles/AutoScheduler.css',
  'PrintableSchedule.css': 'styles/PrintableSchedule.css',
  'ProfessorWorkload.css': 'styles/ProfessorWorkload.css',
  'SchedulerForm.css': 'styles/SchedulerForm.css',
  'ScheduleTable.css': 'styles/ScheduleTable.css',
  'AutoScheduler.jsx': 'components/AutoScheduler/AutoScheduler.jsx',
  'PrintableSchedule.jsx': 'components/PrintableSchedule/PrintableSchedule.jsx',
  'ProfessorWorkload.jsx': 'components/ProfessorWorkload/ProfessorWorkload.jsx',
  'ScheduleForm.jsx': 'components/ScheduleForm/ScheduleForm.jsx',
  'ScheduleTable.jsx': 'components/ScheduleTable/ScheduleTable.jsx',
  'Dashboard.jsx': 'pages/Dashboard/Dashboard.jsx',
  'Login.jsx': 'pages/Login/Login.jsx',
  'FacultyManagement.jsx': 'pages/management/FacultyManagement.jsx',
  'RoomManagement.jsx': 'pages/management/RoomManagement.jsx',
  'SubjectManagement.jsx': 'pages/management/SubjectManagement.jsx',
  'SectionManagement.jsx': 'pages/management/SectionManagement.jsx',
  'UserManagement.jsx': 'pages/management/UserManagement.jsx',
  'RoomUtilization.jsx': 'pages/management/RoomUtilization.jsx',
  'ScheduleViewer.jsx': 'pages/management/ScheduleViewer.jsx'
};

// 1. Move files
Object.entries(moveMap).forEach(([oldName, newPath]) => {
  const oldPath = path.join(srcDir, oldName);
  const destPath = path.join(srcDir, newPath);
  if (fs.existsSync(oldPath)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.renameSync(oldPath, destPath);
  }
});

// Helper to get relative import
function getRel(fromPath, toPath) {
  const fromDir = path.dirname(fromPath);
  let rel = path.relative(fromDir, toPath).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel.replace(/\.(js|jsx|css)$/, ''); // Strip extension for js/jsx
}

function getCssRel(fromPath, toPath) {
  const fromDir = path.dirname(fromPath);
  let rel = path.relative(fromDir, toPath).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel; // Keep extension for CSS
}

// Define the old module name to new path mapping
const modToPath = {
  './firebase': 'config/firebase.js',
  './initial': 'config/initialData.js',
  './index': 'config/constants.js',
  './ScheduleGA': 'utils/ScheduleGA.js',
  './App.css': 'styles/App.css',
  './AutoScheduler.css': 'styles/AutoScheduler.css',
  './PrintableSchedule.css': 'styles/PrintableSchedule.css',
  './ProfessorWorkload.css': 'styles/ProfessorWorkload.css',
  './SchedulerForm.css': 'styles/SchedulerForm.css',
  './ScheduleTable.css': 'styles/ScheduleTable.css',
  './AutoScheduler': 'components/AutoScheduler/AutoScheduler.jsx',
  './PrintableSchedule': 'components/PrintableSchedule/PrintableSchedule.jsx',
  './ProfessorWorkload': 'components/ProfessorWorkload/ProfessorWorkload.jsx',
  './ScheduleForm': 'components/ScheduleForm/ScheduleForm.jsx',
  './ScheduleTable': 'components/ScheduleTable/ScheduleTable.jsx',
  './Dashboard': 'pages/Dashboard/Dashboard.jsx',
  './Login': 'pages/Login/Login.jsx',
  './FacultyManagement': 'pages/management/FacultyManagement.jsx',
  './RoomManagement': 'pages/management/RoomManagement.jsx',
  './SubjectManagement': 'pages/management/SubjectManagement.jsx',
  './SectionManagement': 'pages/management/SectionManagement.jsx',
  './UserManagement': 'pages/management/UserManagement.jsx',
  './RoomUtilization': 'pages/management/RoomUtilization.jsx',
  './ScheduleViewer': 'pages/management/ScheduleViewer.jsx'
};

function processFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace imports
  const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
  content = content.replace(importRegex, (match, p1) => {
    if (modToPath[p1]) {
      const targetAbs = path.join(srcDir, modToPath[p1]);
      return `from '${getRel(filePath, targetAbs)}'`;
    }
    return match;
  });

  // Replace CSS imports like import './App.css'
  const cssImportRegex = /import\s+['"](\.[^'"]+\.css)['"]/g;
  content = content.replace(cssImportRegex, (match, p1) => {
    if (modToPath[p1]) {
      const targetAbs = path.join(srcDir, modToPath[p1]);
      return `import '${getCssRel(filePath, targetAbs)}'`;
    }
    return match;
  });

  fs.writeFileSync(filePath, content);
}

// Process all newly moved files
Object.values(moveMap).forEach(newPath => {
  processFile(path.join(srcDir, newPath));
});
// Process root files
processFile(path.join(srcDir, 'App.jsx'));
processFile(path.join(srcDir, 'main.jsx'));

console.log('Migration completed successfully.');
