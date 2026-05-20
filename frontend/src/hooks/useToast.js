import { create } from 'zustand';

export const useToastStore = create((set) => ({
  toasts: [],
  push: (toast) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, ...toast }] }));
    return id;
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience helpers — call from anywhere (outside React tree too)
export const toast = {
  success: (message, title) => useToastStore.getState().push({ type: 'success', message, title }),
  warning: (message, title) => useToastStore.getState().push({ type: 'warning', message, title }),
  error:   (message, title) => useToastStore.getState().push({ type: 'error',   message, title }),
  info:    (message, title) => useToastStore.getState().push({ type: 'info',    message, title }),
};
