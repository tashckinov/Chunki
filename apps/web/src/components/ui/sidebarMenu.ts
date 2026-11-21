import { createContext } from 'react';

export const SidebarMenuContext = createContext<{ collapsed: boolean; toggle: () => void } | null>(null);
