export interface BrandProfile {
  brandName: string;
  websiteUrl: string;
  primaryDomain: string;
  monitoredDomains: string[];
  checkoutSubdomain: string;
  apiEndpoint: string;
  platformType: string;
  logoUrl: string; // Base64 data URL or image URL
  darkLogoUrl?: string;
  faviconUrl?: string;
  primaryColor: string; // Hex e.g. #6D1735
  secondaryColor: string; // Hex e.g. #E8DDE2
  textColor: string; // Hex e.g. #1E181B
  fontFamily: string; // e.g. 'Plus Jakarta Sans'
  brandOwnerEmail: string;
  brandOwnerName: string;
  isAuthenticated: boolean;
  lastUpdated: string;
}

export const DEFAULT_BRAND_PROFILE: BrandProfile = {
  brandName: 'Allura Luxe Global',
  websiteUrl: 'https://alluraluxe.com',
  primaryDomain: 'alluraluxe.com',
  monitoredDomains: [
    'alluraluxe.com',
    'shop.alluraluxe.com',
    'checkout.alluraluxe.com',
    'alluraluxe.store',
  ],
  checkoutSubdomain: 'checkout.alluraluxe.com',
  apiEndpoint: 'https://api.alluraluxe.com/v1',
  platformType: 'Shopify Plus / Headless',
  logoUrl: '',
  primaryColor: '#6D1735',
  secondaryColor: '#E8DDE2',
  textColor: '#1E181B',
  fontFamily: 'Plus Jakarta Sans',
  brandOwnerEmail: 'owner@alluraluxe.com',
  brandOwnerName: 'Helena Vance',
  isAuthenticated: true,
  lastUpdated: new Date().toISOString(),
};

export const BRAND_FONTS = [
  { id: 'Plus Jakarta Sans', name: 'Plus Jakarta Sans (Default Enterprise)', style: 'sans-serif' },
  { id: 'Inter', name: 'Inter (Clean Technical)', style: 'sans-serif' },
  { id: 'Outfit', name: 'Outfit (Modern Minimal)', style: 'sans-serif' },
  { id: 'Playfair Display', name: 'Playfair Display (Luxury Editorial)', style: 'serif' },
  { id: 'Cinzel', name: 'Cinzel (Classical High Fashion)', style: 'serif' },
  { id: 'DM Sans', name: 'DM Sans (Contemporary Clean)', style: 'sans-serif' },
  { id: 'Space Grotesk', name: 'Space Grotesk (Tech Monospace Edge)', style: 'sans-serif' },
  { id: 'Cabinet Grotesk', name: 'Cabinet Grotesk (Bold Editorial)', style: 'sans-serif' },
] as const;

export const COLOR_PRESETS = {
  primary: [
    { label: 'Burgundy Wine (Default)', hex: '#6D1735' },
    { label: 'Deep Sapphire', hex: '#1E3A8A' },
    { label: 'Emerald Forest', hex: '#065F46' },
    { label: 'Imperial Violet', hex: '#581C87' },
    { label: 'Crimson Velvet', hex: '#991B1B' },
    { label: 'Obsidian Black', hex: '#18181B' },
  ],
  text: [
    { label: 'Rich Ink (Default)', hex: '#1E181B' },
    { label: 'Deep Charcoal', hex: '#27272A' },
    { label: 'Midnight Slate', hex: '#0F172A' },
    { label: 'Warm Espresso', hex: '#291811' },
    { label: 'Pitch Pure', hex: '#000000' },
  ],
  secondary: [
    { label: 'Blush Rose (Default)', hex: '#E8DDE2' },
    { label: 'Soft Ivory', hex: '#FAF8F9' },
    { label: 'Champagne Warm', hex: '#FEF3C7' },
    { label: 'Platinum Cool', hex: '#F1F5F9' },
    { label: 'Lavender Mist', hex: '#EDE9FE' },
  ],
};
