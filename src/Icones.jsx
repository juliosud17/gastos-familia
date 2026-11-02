const p = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const IconeCasa = () => (
  <svg {...p}><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></svg>
)
export const IconeLista = () => (
  <svg {...p}><path d="M5 5h14v15H5z" /><path d="M8 9h8M8 12.5h8M8 16h5" /></svg>
)
export const IconePizza = () => (
  <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 4v8l5.7 5.7" /></svg>
)
export const IconeAjustes = () => (
  <svg {...p}><path d="M5 7h9M18 7h1M5 17h1M10 17h9" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
)
export const IconeMais = () => (
  <svg {...p} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>
)
export const Seta = ({ dir }) => (
  <svg {...p} strokeWidth={2}>{dir === 'esq' ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}</svg>
)
export const IconeCofre = () => (
  <svg {...p}><rect x="4" y="6" width="16" height="13" rx="2" /><circle cx="12" cy="12.5" r="2.5" /><path d="M7 19v1.5M17 19v1.5M12 6V4" /></svg>
)
export const IconeCalendario = () => (
  <svg {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /><path d="M9 14.5l2 2 4-4" /></svg>
)
