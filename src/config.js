// Set to false to restore the homepage with all tools.
export const PLANNER_ONLY = true;

// First production rollout starts with fresh poll caches, queues and voter sessions.
// Keep this value stable after launch; changing it abandons pending local writes.
export const PLANNER_STORAGE_NAMESPACE = 'amigo-planner-live-v1';
