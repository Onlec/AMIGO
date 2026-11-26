import { useSyncExternalStore } from 'react';
import { getLocale, watchLocale } from './index.js';

export function useLocale() { return useSyncExternalStore(watchLocale, getLocale, getLocale); }
