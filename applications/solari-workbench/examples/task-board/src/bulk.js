// Intentional demonstration defect: the selected IDs are ignored.
// The independent regression test is expected to fail until repaired remotely.
export function applyPriority(tasks, selectedIds, visibleIds, priority) {
  return tasks.map(task => visibleIds.includes(task.id) ? {...task, priority} : task);
}
