export const showAutoScheduleModal = async (mode, { professors, rooms, sections }, dialogs) => {
  const { confirm, prompt } = dialogs;

  if (mode === 'ga') {
    const isConfirmed = await confirm({
      title: 'Generate Full Timetable?',
      text: 'This will use the scheduling engine to automatically generate conflict-free schedules for all sections.',
      icon: 'info',
      confirmButtonText: 'Generate Now',
    });
    
    if (isConfirmed) {
      return { mode: 'ga' };
    } else {
      return null;
    }
  } else {
    let options = {};
    let title = '';
    
    if (mode === 'faculty') {
      title = 'Faculty';
      professors.forEach(p => { options[p.id] = p.name; });
    } else if (mode === 'room') {
      title = 'Room';
      rooms.forEach(r => { options[r.id] = r.name; });
    } else if (mode === 'section') {
      title = 'Section';
      sections.forEach(s => { options[s.id] = s.name; });
    }

    const result = await prompt({
      title: `Generate by ${title}`,
      text: `Please select a specific ${title.toLowerCase()} to generate an optimized schedule for.`,
      icon: 'info',
      inputPlaceholder: `Choose a ${title.toLowerCase()}...`,
      inputOptions: options,
      confirmButtonText: 'Generate Now',
    });

    if (result) {
      return { mode, targetId: result };
    } else {
      return null;
    }
  }
};
