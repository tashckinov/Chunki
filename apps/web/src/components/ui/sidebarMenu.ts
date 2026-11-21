import { createContext } from 'react';

export const SidebarMenuContext = createContext<(() => void) | null>(null);
