// Lucide icon nodes (ISC license, lucide-react dependency).
const nodes={updates:['path d="M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6M4 13a8 8 0 0 0 14 5l3-3m0 6v-6h-6"'],
 media:['rect x="2" y="3" width="20" height="18" rx="2"','path d="m9 8 7 4-7 4z"'],
 projects:['path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"'],
 browser:['circle cx="12" cy="12" r="10"','path d="M2 12h20"','path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"'],
 terminal:['path d="m4 17 6-5-6-5"','path d="M12 19h8"'],
 packages:['path d="m7.5 4.27 9 5.15"','path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"','path d="m3.3 7 8.7 5 8.7-5M12 22V12"'],
 extensions:['path d="M19.44 15a2 2 0 1 0 0-6H21V4h-5V2.56a2 2 0 1 0-6 0V4H5v5H3.56a2 2 0 1 0 0 6H5v5h5v-1.44a2 2 0 1 1 6 0V20h5v-5Z"'],
 device:['rect width="14" height="20" x="5" y="2" rx="2"','path d="M12 18h.01"'],
 opencv:['circle cx="12" cy="12" r="9"','circle cx="12" cy="12" r="3"','path d="M12 3v6M12 15v6M3 12h6M15 12h6"'],
 camera:['path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"','circle cx="12" cy="13" r="3"'],
 agent:['rect x="3" y="8" width="18" height="12" rx="2"','path d="M12 8V4H8M7 12h.01M17 12h.01M7 16h10"']
};
export const studioIcon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(nodes[name]||nodes.terminal).map(n=>`<${n}/>`).join('')}</svg>`;
