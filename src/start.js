import { loadIdentityFonts } from './typography.js';

// Canvas lettering is baked once. Resolve local fonts before constructing the level.
loadIdentityFonts().then(() => import('./main.js'));
