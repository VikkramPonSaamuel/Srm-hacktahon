import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  Globe,
  Image as ImageIcon,
  Key,
  Lock,
  LogIn,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Upload,
  User,
  X,
} from 'lucide-react';
import { useShell } from '../context/ShellContext';
import {
  BRAND_FONTS,
  COLOR_PRESETS,
  DEFAULT_BRAND_PROFILE,
  type BrandProfile,
} from '../types/brand';
import { Button } from '../components/ui/Button';
import { Badge, MonoCode } from '../components/ui/Badge';

export const BrandLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { brandProfile, updateBrandProfile, resetBrandProfile } = useShell();

  // Active view tab: 'login' | 'onboarding'
  const [activeTab, setActiveTab] = useState<'login' | 'onboarding'>('onboarding');

  // Form states initialized from current brand profile
  const [brandName, setBrandName] = useState(brandProfile.brandName);
  const [websiteUrl, setWebsiteUrl] = useState(brandProfile.websiteUrl);
  const [primaryDomain, setPrimaryDomain] = useState(brandProfile.primaryDomain);
  const [monitoredDomains, setMonitoredDomains] = useState<string[]>(brandProfile.monitoredDomains);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [checkoutSubdomain, setCheckoutSubdomain] = useState(brandProfile.checkoutSubdomain);
  const [apiEndpoint, setApiEndpoint] = useState(brandProfile.apiEndpoint);
  const [platformType, setPlatformType] = useState(brandProfile.platformType);
  const [logoUrl, setLogoUrl] = useState(brandProfile.logoUrl);
  const [primaryColor, setPrimaryColor] = useState(brandProfile.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(brandProfile.secondaryColor);
  const [textColor, setTextColor] = useState(brandProfile.textColor);
  const [fontFamily, setFontFamily] = useState(brandProfile.fontFamily);
  const [ownerEmail, setOwnerEmail] = useState(brandProfile.brandOwnerEmail);
  const [ownerName, setOwnerName] = useState(brandProfile.brandOwnerName);
  const [password, setPassword] = useState('••••••••••••');
  const [isRememberMe, setIsRememberMe] = useState(true);

  // Status feedback toast / notice
  const [saveNotice, setSaveNotice] = useState<{ type: 'success' | 'info'; message: string } | null>(
    null
  );
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Handle image upload from file system
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSaveNotice({
        type: 'info',
        message: 'Please upload an image file (PNG, SVG, WEBP, or JPG).',
      });
      return;
    }

    setIsUploadingLogo(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setLogoUrl(result);
      setIsUploadingLogo(false);
      setSaveNotice({
        type: 'success',
        message: `Logo "${file.name}" uploaded and loaded into preview.`,
      });
      setTimeout(() => setSaveNotice(null), 4000);
    };
    reader.onerror = () => {
      setIsUploadingLogo(false);
      setSaveNotice({
        type: 'info',
        message: 'Failed to read image file. Please try another image.',
      });
    };
    reader.readAsDataURL(file);
  };

  // Add domain tag
  const handleAddDomain = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newDomainInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!clean) return;
    if (monitoredDomains.includes(clean)) {
      setNewDomainInput('');
      return;
    }
    setMonitoredDomains((prev) => [...prev, clean]);
    setNewDomainInput('');
  };

  const handleRemoveDomain = (domainToRemove: string) => {
    setMonitoredDomains((prev) => prev.filter((d) => d !== domainToRemove));
  };

  // Preset sample logo generator
  const handleApplySampleLogo = (variant: 'monogram' | 'crest' | 'wordmark') => {
    let svg = '';
    if (variant === 'monogram') {
      svg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48"><rect width="48" height="48" rx="10" fill="${encodeURIComponent(
        primaryColor
      )}"/><text x="24" y="31" font-family="${encodeURIComponent(
        fontFamily
      )}" font-size="22" font-weight="900" fill="%23ffffff" text-anchor="middle">${brandName.charAt(
        0
      )}</text><text x="60" y="30" font-family="${encodeURIComponent(
        fontFamily
      )}" font-size="16" font-weight="800" fill="${encodeURIComponent(
        textColor
      )}">${brandName.split(' ')[0]}</text></svg>`;
    } else if (variant === 'crest') {
      svg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="180" height="48" viewBox="0 0 180 48"><circle cx="24" cy="24" r="20" fill="none" stroke="${encodeURIComponent(
        primaryColor
      )}" stroke-width="3"/><polygon points="24,12 32,28 16,28" fill="${encodeURIComponent(
        primaryColor
      )}"/><text x="56" y="30" font-family="${encodeURIComponent(
        fontFamily
      )}" font-size="15" font-weight="700" letter-spacing="1.5" fill="${encodeURIComponent(
        textColor
      )}">${brandName.toUpperCase()}</text></svg>`;
    } else {
      svg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="48" viewBox="0 0 200 48"><text x="10" y="32" font-family="${encodeURIComponent(
        fontFamily
      )}" font-size="22" font-weight="900" letter-spacing="-0.5" fill="${encodeURIComponent(
        primaryColor
      )}">${brandName}</text><circle cx="185" cy="30" r="4" fill="${encodeURIComponent(
        primaryColor
      )}"/></svg>`;
    }
    setLogoUrl(svg);
    setSaveNotice({
      type: 'success',
      message: `Sample ${variant} logo generated using your brand color palette.`,
    });
    setTimeout(() => setSaveNotice(null), 3500);
  };

  // Save current brand profile
  const handleSaveProfile = () => {
    const updated: BrandProfile = {
      brandName,
      websiteUrl,
      primaryDomain,
      monitoredDomains,
      checkoutSubdomain,
      apiEndpoint,
      platformType,
      logoUrl,
      primaryColor,
      secondaryColor,
      textColor,
      fontFamily,
      brandOwnerEmail: ownerEmail,
      brandOwnerName: ownerName,
      isAuthenticated: true,
      lastUpdated: new Date().toISOString(),
    };

    updateBrandProfile(updated);
    setSaveNotice({
      type: 'success',
      message: 'Brand identity, logos, domains, and font colors saved to SYNESIS Sentinel.',
    });
    setTimeout(() => setSaveNotice(null), 4000);
  };

  // 1-Click fast login for judges / testing
  const handleOneClickDemoLogin = (presetBrand: 'Allura Luxe' | 'Aura Athletics' | 'Sovereign Watch') => {
    if (presetBrand === 'Allura Luxe') {
      setBrandName('Allura Luxe Global');
      setWebsiteUrl('https://alluraluxe.com');
      setPrimaryDomain('alluraluxe.com');
      setMonitoredDomains(['alluraluxe.com', 'shop.alluraluxe.com', 'checkout.alluraluxe.com', 'alluraluxe.store']);
      setCheckoutSubdomain('checkout.alluraluxe.com');
      setPrimaryColor('#6D1735');
      setSecondaryColor('#E8DDE2');
      setTextColor('#1E181B');
      setFontFamily('Playfair Display');
      setOwnerEmail('helena.vance@alluraluxe.com');
      setOwnerName('Helena Vance');
    } else if (presetBrand === 'Aura Athletics') {
      setBrandName('Aura Athletics');
      setWebsiteUrl('https://aura-athletics.io');
      setPrimaryDomain('aura-athletics.io');
      setMonitoredDomains(['aura-athletics.io', 'store.aura-athletics.io', 'pay.aura-athletics.io']);
      setCheckoutSubdomain('pay.aura-athletics.io');
      setPrimaryColor('#065F46');
      setSecondaryColor('#D1FAE5');
      setTextColor('#064E3B');
      setFontFamily('Outfit');
      setOwnerEmail('ops@aura-athletics.io');
      setOwnerName('Marcus Chen');
    } else {
      setBrandName('Sovereign Chrono');
      setWebsiteUrl('https://sovereignchrono.com');
      setPrimaryDomain('sovereignchrono.com');
      setMonitoredDomains(['sovereignchrono.com', 'vault.sovereignchrono.com', 'checkout.sovereignchrono.com']);
      setCheckoutSubdomain('checkout.sovereignchrono.com');
      setPrimaryColor('#1E3A8A');
      setSecondaryColor('#DBEAFE');
      setTextColor('#0F172A');
      setFontFamily('Cinzel');
      setOwnerEmail('director@sovereignchrono.com');
      setOwnerName('Julian St. Claire');
    }

    setSaveNotice({
      type: 'success',
      message: `Verified enterprise brand "${presetBrand}" loaded into portal.`,
    });
    setTimeout(() => setSaveNotice(null), 3000);
  };

  // Reset to factory defaults
  const handleResetDefaults = () => {
    resetBrandProfile();
    setBrandName(DEFAULT_BRAND_PROFILE.brandName);
    setWebsiteUrl(DEFAULT_BRAND_PROFILE.websiteUrl);
    setPrimaryDomain(DEFAULT_BRAND_PROFILE.primaryDomain);
    setMonitoredDomains(DEFAULT_BRAND_PROFILE.monitoredDomains);
    setCheckoutSubdomain(DEFAULT_BRAND_PROFILE.checkoutSubdomain);
    setApiEndpoint(DEFAULT_BRAND_PROFILE.apiEndpoint);
    setPlatformType(DEFAULT_BRAND_PROFILE.platformType);
    setLogoUrl(DEFAULT_BRAND_PROFILE.logoUrl);
    setPrimaryColor(DEFAULT_BRAND_PROFILE.primaryColor);
    setSecondaryColor(DEFAULT_BRAND_PROFILE.secondaryColor);
    setTextColor(DEFAULT_BRAND_PROFILE.textColor);
    setFontFamily(DEFAULT_BRAND_PROFILE.fontFamily);
    setOwnerEmail(DEFAULT_BRAND_PROFILE.brandOwnerEmail);
    setOwnerName(DEFAULT_BRAND_PROFILE.brandOwnerName);

    setSaveNotice({
      type: 'info',
      message: 'Brand settings reset to standard factory defaults.',
    });
    setTimeout(() => setSaveNotice(null), 3000);
  };

  // Export JSON manifest
  const handleExportManifest = () => {
    const manifest = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      brand: {
        name: brandName,
        website: websiteUrl,
        primaryDomain,
        monitoredDomains,
        checkoutSubdomain,
        apiEndpoint,
        platformType,
      },
      visualIdentity: {
        primaryColor,
        secondaryColor,
        textColor,
        fontFamily,
        hasCustomLogo: Boolean(logoUrl),
      },
      operator: {
        email: ownerEmail,
        name: ownerName,
      },
    };

    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brandName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-synesis-manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-surface-offwhite text-ink-primary flex flex-col font-sans selection:bg-burgundy/15 selection:text-burgundy">
      {/* =====================================================================
          TOP NAVIGATION BAR
          ===================================================================== */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-border-warm h-16 px-6 lg:px-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div
              style={{ backgroundColor: primaryColor }}
              className="w-9 h-9 rounded-lg text-white flex items-center justify-center font-heading font-black text-lg shadow-sm transition-transform group-hover:scale-105"
            >
              {brandName.charAt(0) || 'S'}
            </div>
            <div>
              <div className="font-heading font-bold text-base tracking-tight text-ink-primary flex items-center gap-2">
                <span>SYNESIS</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-burgundy/10 text-burgundy font-mono rounded font-semibold">
                  BRAND PORTAL
                </span>
              </div>
              <div className="text-[10px] font-medium text-ink-secondary uppercase tracking-widest -mt-0.5">
                Brand Owner Onboarding &amp; Identity Mesh
              </div>
            </div>
          </Link>
        </div>

        {/* Tab switchers & Exit to Overview */}
        <div className="flex items-center gap-3">
          <div className="flex bg-surface-secondary/80 p-0.5 rounded-lg border border-border-warm text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('onboarding')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'onboarding'
                  ? 'bg-white text-ink-primary shadow-subtle'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Identity &amp; Domains</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('login')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'login'
                  ? 'bg-white text-ink-primary shadow-subtle'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Owner Sign In</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/overview')}
            className="hidden sm:flex text-xs border-border-warm hover:bg-surface-secondary text-ink-primary items-center gap-1.5"
          >
            <span>Overview Dashboard</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      {/* Save Notification Banner */}
      {saveNotice && (
        <div className="sticky top-16 z-30 bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center justify-between text-xs text-emerald-800 animate-in fade-in">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveNotice(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* =====================================================================
          MAIN CONTENT AREA
          ===================================================================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-10 space-y-8">
        {/* Intro Hero Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-border-warm/70">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="burgundy" size="sm">
                BRAND ONBOARDING &amp; ASSET HUB
              </Badge>
              <span className="text-xs text-ink-secondary">• Enterprise Tenant Configuration</span>
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ink-primary tracking-tight">
              Brand Owner Portal
            </h1>
            <p className="text-xs sm:text-sm text-ink-secondary mt-1 max-w-2xl leading-relaxed">
              Upload your website, apex domains, brand logos, primary palette, and text font colours.
              SYNESIS Sentinel uses these assets to validate customer transaction journeys, detect
              impersonation domains, and brand your operational reports.
            </p>
          </div>

          {/* Quick presets for judges & testing */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
              Quick Brand Presets:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleOneClickDemoLogin('Allura Luxe')}
                className="px-2.5 py-1 text-xs rounded-md bg-white border border-border-warm hover:border-burgundy font-medium text-ink-primary shadow-subtle transition-colors"
              >
                Allura Luxe
              </button>
              <button
                type="button"
                onClick={() => handleOneClickDemoLogin('Aura Athletics')}
                className="px-2.5 py-1 text-xs rounded-md bg-white border border-border-warm hover:border-emerald-600 font-medium text-ink-primary shadow-subtle transition-colors"
              >
                Aura Athletics
              </button>
              <button
                type="button"
                onClick={() => handleOneClickDemoLogin('Sovereign Watch')}
                className="px-2.5 py-1 text-xs rounded-md bg-white border border-border-warm hover:border-blue-600 font-medium text-ink-primary shadow-subtle transition-colors"
              >
                Sovereign Chrono
              </button>
            </div>
          </div>
        </div>

        {/* =====================================================================
            VIEW 1: BRAND OWNER SIGN IN TAB
            ===================================================================== */}
        {activeTab === 'login' && (
          <div className="max-w-md mx-auto my-6 space-y-6">
            <div className="p-8 rounded-2xl bg-white border border-border-warm shadow-subtle space-y-6">
              <div className="text-center space-y-1.5">
                <div
                  style={{ backgroundColor: primaryColor }}
                  className="w-12 h-12 rounded-xl text-white flex items-center justify-center font-heading font-black text-xl mx-auto shadow-sm"
                >
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="font-heading font-bold text-xl text-ink-primary">
                  Sign In to Your Brand Workspace
                </h2>
                <p className="text-xs text-ink-secondary">
                  Access autonomous monitoring for <strong className="text-ink-primary">{brandName}</strong>
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveProfile();
                  navigate('/overview');
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-ink-primary mb-1">
                    Work Email / Brand Owner ID
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-ink-secondary absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      required
                      placeholder="owner@yourbrand.com"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-ink-primary">
                      Password or SSO Token
                    </label>
                    <a
                      href="#forgot"
                      onClick={(e) => e.preventDefault()}
                      className="text-[11px] text-burgundy hover:underline"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Key className="w-4 h-4 text-ink-secondary absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRememberMe}
                      onChange={(e) => setIsRememberMe(e.target.checked)}
                      className="rounded border-border-warm text-burgundy focus:ring-burgundy/30"
                    />
                    <span className="text-ink-secondary text-[11px]">Remember active session</span>
                  </label>
                  <span className="text-[11px] text-status-healthy font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    2FA Protected
                  </span>
                </div>

                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  className="w-full bg-burgundy hover:bg-burgundy-dark text-white font-medium text-xs py-2.5 shadow-subtle flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Authenticate &amp; Open Command Center</span>
                </Button>
              </form>

              <div className="pt-4 border-t border-border-warm text-center space-y-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('onboarding')}
                  className="text-xs text-burgundy font-semibold hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                  <span>Need to configure logos, domains, and colors?</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW 2: BRAND ASSETS, WEBSITES, DOMAINS, LOGOS & COLORS (DUAL-COLUMN)
            ===================================================================== */}
        {activeTab === 'onboarding' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* LEFT COLUMN: THE EDITING & CONFIGURATION FORM (7 COLS) */}
            <div className="lg:col-span-7 space-y-6">
              {/* -----------------------------------------------------------------
                  SECTION 1: BRAND ACCOUNT & DETAILS
                  ----------------------------------------------------------------- */}
              <div className="p-6 rounded-xl bg-white border border-border-warm shadow-subtle space-y-5">
                <div className="flex items-center gap-2.5 pb-3 border-b border-border-warm">
                  <div className="w-8 h-8 rounded-lg bg-burgundy/10 text-burgundy flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-heading font-bold text-sm text-ink-primary">
                      1. Brand Profile &amp; Ownership
                    </h2>
                    <p className="text-xs text-ink-secondary">
                      Company metadata and administrator authorization
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink-primary mb-1">
                      Brand / Enterprise Name
                    </label>
                    <input
                      type="text"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="e.g. Allura Luxe Global"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-primary mb-1">
                      Platform Engine
                    </label>
                    <select
                      value={platformType}
                      onChange={(e) => setPlatformType(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary"
                    >
                      <option value="Shopify Plus / Headless">Shopify Plus / Headless</option>
                      <option value="Salesforce Commerce Cloud">Salesforce Commerce Cloud</option>
                      <option value="WooCommerce Enterprise">WooCommerce Enterprise</option>
                      <option value="Magento 2 / Adobe Commerce">Magento 2 / Adobe Commerce</option>
                      <option value="BigCommerce B2B">BigCommerce B2B</option>
                      <option value="Custom Next.js & Node Backend">Custom Next.js &amp; Node Backend</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-primary mb-1">
                      Owner / Director Name
                    </label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. Helena Vance"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-primary mb-1">
                      Owner Notification Email
                    </label>
                    <input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="owner@yourbrand.com"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary"
                    />
                  </div>
                </div>
              </div>

              {/* -----------------------------------------------------------------
                  SECTION 2: WEBSITES & MONITORED DOMAINS
                  ----------------------------------------------------------------- */}
              <div className="p-6 rounded-xl bg-white border border-border-warm shadow-subtle space-y-5">
                <div className="flex items-center gap-2.5 pb-3 border-b border-border-warm">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-heading font-bold text-sm text-ink-primary">
                      2. Websites &amp; Monitored Domains
                    </h2>
                    <p className="text-xs text-ink-secondary">
                      Storefront URLs and apex domains evaluated for synthetic uptime and brand phishing
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink-primary mb-1">
                      Primary Storefront Website URL
                    </label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-ink-secondary absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="url"
                        value={websiteUrl}
                        onChange={(e) => {
                          setWebsiteUrl(e.target.value);
                          // Auto extract primary domain
                          try {
                            const url = new URL(e.target.value);
                            setPrimaryDomain(url.hostname);
                          } catch {
                            // ignore raw typing
                          }
                        }}
                        placeholder="https://alluraluxe.com"
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary font-mono"
                      />
                    </div>
                    <span className="text-[10px] text-ink-secondary mt-1 block">
                      Target URL for synthetic journey probes (Login, Browsing, Cart, Checkout, Payment).
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-ink-primary mb-1">
                        Apex Brand Domain
                      </label>
                      <input
                        type="text"
                        value={primaryDomain}
                        onChange={(e) => setPrimaryDomain(e.target.value)}
                        placeholder="alluraluxe.com"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-ink-primary mb-1">
                        Checkout &amp; Gateway Subdomain
                      </label>
                      <input
                        type="text"
                        value={checkoutSubdomain}
                        onChange={(e) => setCheckoutSubdomain(e.target.value)}
                        placeholder="checkout.alluraluxe.com"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary font-mono"
                      />
                    </div>
                  </div>

                  {/* Monitored Domains Tag Manager */}
                  <div>
                    <label className="block text-xs font-semibold text-ink-primary mb-1">
                      Monitored Domains &amp; Subdomains ({monitoredDomains.length})
                    </label>

                    <div className="p-3 rounded-lg border border-border-warm bg-surface-secondary/40 space-y-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {monitoredDomains.map((domain) => (
                          <span
                            key={domain}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-border-warm text-xs font-mono text-ink-primary shadow-subtle"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-status-healthy" />
                            <span>{domain}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDomain(domain)}
                              className="text-ink-secondary hover:text-status-critical ml-0.5"
                              title="Remove domain"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={newDomainInput}
                          onChange={(e) => setNewDomainInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddDomain();
                            }
                          }}
                          placeholder="Add domain (e.g. pay.yourbrand.com, brand.store)..."
                          className="flex-1 px-3 py-1.5 text-xs rounded-md border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary font-mono"
                        />
                        <Button
                          variant="secondary"
                          size="xs"
                          type="button"
                          onClick={() => handleAddDomain()}
                          leftIcon={<Plus className="w-3.5 h-3.5" />}
                        >
                          Add Domain
                        </Button>
                      </div>
                    </div>
                    <span className="text-[10px] text-ink-secondary mt-1 block">
                      SYNESIS monitors these domains for SSL health, HTTP responsiveness, and brand typosquatting variants.
                    </span>
                  </div>
                </div>
              </div>

              {/* -----------------------------------------------------------------
                  SECTION 3: BRAND LOGOS & ASSET UPLOADS
                  ----------------------------------------------------------------- */}
              <div className="p-6 rounded-xl bg-white border border-border-warm shadow-subtle space-y-5">
                <div className="flex items-center gap-2.5 pb-3 border-b border-border-warm">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-heading font-bold text-sm text-ink-primary">
                      3. Brand Logos &amp; Visual Marks
                    </h2>
                    <p className="text-xs text-ink-secondary">
                      Upload your logo files or generate instant vectors for your storefront and report headers
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* File Upload Zone */}
                  <div>
                    <label className="block text-xs font-semibold text-ink-primary mb-1">
                      Primary Brand Logo Upload (SVG, PNG, WebP, JPG)
                    </label>

                    <div className="border-2 border-dashed border-border-warm rounded-xl p-5 text-center hover:border-burgundy/50 transition-colors bg-surface-secondary/20 relative">
                      <input
                        type="file"
                        accept="image/png,image/svg+xml,image/webp,image/jpeg"
                        onChange={handleLogoFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        title="Upload logo file from your device"
                      />

                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-burgundy/10 text-burgundy flex items-center justify-center">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-ink-primary">
                            {isUploadingLogo ? 'Reading file...' : 'Click to upload or drag and drop your logo'}
                          </p>
                          <p className="text-[10px] text-ink-secondary mt-0.5">
                            High-resolution transparent PNG or vector SVG recommended (up to 5MB)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Logo preview & quick presets */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-surface-cream/60 border border-border-warm">
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-12 rounded bg-white border border-border-warm flex items-center justify-center p-1.5 shadow-subtle shrink-0">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt={`${brandName} Logo`}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span
                            style={{ color: primaryColor, fontFamily }}
                            className="font-bold text-sm tracking-tight truncate"
                          >
                            {brandName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs">
                        <div className="font-semibold text-ink-primary">
                          {logoUrl ? 'Active Logo Loaded' : 'Text Mark Active'}
                        </div>
                        <div className="text-[10px] text-ink-secondary">
                          {logoUrl ? 'Using uploaded brand asset' : 'No image uploaded yet'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap self-start sm:self-auto">
                      <span className="text-[10px] text-ink-secondary mr-1">Sample SVGs:</span>
                      <Button
                        variant="secondary"
                        size="xs"
                        type="button"
                        onClick={() => handleApplySampleLogo('monogram')}
                      >
                        Monogram
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        type="button"
                        onClick={() => handleApplySampleLogo('crest')}
                      >
                        Crest
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        type="button"
                        onClick={() => handleApplySampleLogo('wordmark')}
                      >
                        Wordmark
                      </Button>
                      {logoUrl && (
                        <Button
                          variant="ghost"
                          size="xs"
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="text-status-critical hover:bg-status-critical/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* -----------------------------------------------------------------
                  SECTION 4: BRAND COLORS & TEXT FONT COLOURS
                  ----------------------------------------------------------------- */}
              <div className="p-6 rounded-xl bg-white border border-border-warm shadow-subtle space-y-6">
                <div className="flex items-center gap-2.5 pb-3 border-b border-border-warm">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                    <Palette className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-heading font-bold text-sm text-ink-primary">
                      4. Brand Palette &amp; Text Font Colours
                    </h2>
                    <p className="text-xs text-ink-secondary">
                      Specify text font color, primary brand hue, and typography family
                    </p>
                  </div>
                </div>

                <div className="space-y-5">
                  {/* TEXT FONT COLOR */}
                  <div className="p-4 rounded-xl border border-border-warm bg-surface-secondary/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-ink-primary">
                          Text Font Colour
                        </label>
                        <p className="text-[11px] text-ink-secondary mt-0.5">
                          Controls the font color used for storefront headlines, body copy, and synthetic reports
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          className="w-8 h-8 rounded border border-border-warm cursor-pointer p-0.5 bg-white"
                          title="Choose custom text font colour"
                        />
                        <input
                          type="text"
                          value={textColor}
                          onChange={(e) => setTextColor(e.target.value)}
                          placeholder="#1E181B"
                          className="w-24 px-2 py-1 text-xs rounded border border-border-warm bg-white font-mono text-ink-primary font-medium uppercase"
                        />
                      </div>
                    </div>

                    {/* Text Color Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] text-ink-secondary mr-1">Presets:</span>
                      {COLOR_PRESETS.text.map((preset) => (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => setTextColor(preset.hex)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${
                            textColor.toLowerCase() === preset.hex.toLowerCase()
                              ? 'bg-burgundy/10 border-burgundy text-burgundy font-semibold'
                              : 'bg-white border-border-warm text-ink-primary hover:border-ink-secondary'
                          }`}
                        >
                          <span
                            style={{ backgroundColor: preset.hex }}
                            className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                          />
                          <span>{preset.label.split(' ')[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* PRIMARY BRAND COLOR */}
                  <div className="p-4 rounded-xl border border-border-warm bg-surface-secondary/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-ink-primary">
                          Primary Brand Colour
                        </label>
                        <p className="text-[11px] text-ink-secondary mt-0.5">
                          Accent hue for navigation bars, CTA buttons, and status highlight cards
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="w-8 h-8 rounded border border-border-warm cursor-pointer p-0.5 bg-white"
                          title="Choose custom primary brand colour"
                        />
                        <input
                          type="text"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          placeholder="#6D1735"
                          className="w-24 px-2 py-1 text-xs rounded border border-border-warm bg-white font-mono text-ink-primary font-medium uppercase"
                        />
                      </div>
                    </div>

                    {/* Primary Color Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] text-ink-secondary mr-1">Presets:</span>
                      {COLOR_PRESETS.primary.map((preset) => (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => setPrimaryColor(preset.hex)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${
                            primaryColor.toLowerCase() === preset.hex.toLowerCase()
                              ? 'bg-burgundy/10 border-burgundy text-burgundy font-semibold'
                              : 'bg-white border-border-warm text-ink-primary hover:border-ink-secondary'
                          }`}
                        >
                          <span
                            style={{ backgroundColor: preset.hex }}
                            className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                          />
                          <span>{preset.label.split(' ')[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SECONDARY / ACCENT COLOR */}
                  <div className="p-4 rounded-xl border border-border-warm bg-surface-secondary/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-bold text-ink-primary">
                          Secondary Accent Colour
                        </label>
                        <p className="text-[11px] text-ink-secondary mt-0.5">
                          Complementary background tint used for badges, ribbons, and subtle surfaces
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          className="w-8 h-8 rounded border border-border-warm cursor-pointer p-0.5 bg-white"
                          title="Choose secondary accent colour"
                        />
                        <input
                          type="text"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          placeholder="#E8DDE2"
                          className="w-24 px-2 py-1 text-xs rounded border border-border-warm bg-white font-mono text-ink-primary font-medium uppercase"
                        />
                      </div>
                    </div>

                    {/* Secondary Color Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] text-ink-secondary mr-1">Presets:</span>
                      {COLOR_PRESETS.secondary.map((preset) => (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => setSecondaryColor(preset.hex)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors ${
                            secondaryColor.toLowerCase() === preset.hex.toLowerCase()
                              ? 'bg-burgundy/10 border-burgundy text-burgundy font-semibold'
                              : 'bg-white border-border-warm text-ink-primary hover:border-ink-secondary'
                          }`}
                        >
                          <span
                            style={{ backgroundColor: preset.hex }}
                            className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                          />
                          <span>{preset.label.split(' ')[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* TYPOGRAPHY FONT SELECTION */}
                  <div>
                    <label className="block text-xs font-semibold text-ink-primary mb-1">
                      Typography Font Family
                    </label>
                    <div className="relative">
                      <Type className="w-4 h-4 text-ink-secondary absolute left-3 top-2.5 pointer-events-none" />
                      <select
                        value={fontFamily}
                        onChange={(e) => setFontFamily(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border-warm bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/30 text-ink-primary"
                      >
                        {BRAND_FONTS.map((font) => (
                          <option key={font.id} value={font.id}>
                            {font.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Dynamic font sample rendered in selected text font colour */}
                    <div
                      style={{ fontFamily, color: textColor }}
                      className="mt-2 p-3 rounded-lg bg-surface-secondary/50 border border-border-warm text-xs transition-all"
                    >
                      <div className="text-[10px] text-ink-secondary uppercase tracking-widest font-mono mb-0.5">
                        Font Preview in "{fontFamily}":
                      </div>
                      <div className="font-semibold text-sm">
                        Sphinx of black quartz, judge my vow.
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        Autonomous synthetic verification across checkout and payment gateways.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTON BAR */}
              <div className="p-4 rounded-xl bg-white border border-border-warm flex flex-col sm:flex-row items-center justify-between gap-3 shadow-subtle">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={handleResetDefaults}
                    leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                  >
                    Reset Defaults
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={handleExportManifest}
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                  >
                    Export JSON
                  </Button>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="md"
                    type="button"
                    onClick={handleSaveProfile}
                    className="flex-1 sm:flex-initial bg-burgundy hover:bg-burgundy-dark text-white font-medium text-xs px-5 shadow-subtle flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Brand Profile</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    type="button"
                    onClick={() => {
                      handleSaveProfile();
                      navigate('/overview');
                    }}
                    className="flex-1 sm:flex-initial text-xs flex items-center justify-center gap-1.5"
                  >
                    <span>Launch Overview</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: REAL-TIME INTERACTIVE LIVE BRAND PREVIEW (5 COLS) */}
            <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-burgundy" />
                  <h3 className="font-heading font-bold text-sm text-ink-primary">
                    Live Brand &amp; Sentinel Preview
                  </h3>
                </div>
                <Badge variant="healthy" size="sm" dot>
                  REAL-TIME REACTIVE
                </Badge>
              </div>

              {/* SIMULATED BRAND STOREFRONT CANVAS */}
              <div className="rounded-2xl border border-border-warm bg-white shadow-elevated overflow-hidden transition-all">
                {/* Storefront Browser Chrome */}
                <div className="bg-surface-secondary/80 border-b border-border-warm px-3.5 py-2 flex items-center justify-between text-[11px] text-ink-secondary">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[10px] bg-white px-2.5 py-0.5 rounded border border-border-warm text-ink-primary truncate max-w-[220px]">
                    <Lock className="w-2.5 h-2.5 text-status-healthy shrink-0" />
                    <span>{websiteUrl || 'https://yourbrand.com'}</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-burgundy">200 OK</span>
                </div>

                {/* Branded Storefront Top Header */}
                <div
                  style={{
                    borderBottomColor: secondaryColor,
                  }}
                  className="px-4 py-3 border-b flex items-center justify-between transition-colors bg-white"
                >
                  <div className="flex items-center gap-2.5">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Brand Preview"
                        className="h-8 max-w-[130px] object-contain"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div
                          style={{ backgroundColor: primaryColor }}
                          className="w-7 h-7 rounded text-white flex items-center justify-center font-bold text-sm"
                        >
                          {brandName.charAt(0)}
                        </div>
                        <span
                          style={{ color: textColor, fontFamily }}
                          className="font-bold text-sm tracking-tight"
                        >
                          {brandName}
                        </span>
                      </div>
                    )}
                  </div>

                  <div
                    style={{ color: textColor, fontFamily }}
                    className="flex items-center gap-3 text-xs font-semibold"
                  >
                    <span>Shop</span>
                    <span className="hidden sm:inline">Collections</span>
                    <button
                      type="button"
                      style={{
                        backgroundColor: primaryColor,
                        color: '#FFFFFF',
                      }}
                      className="px-3 py-1 rounded text-[11px] font-semibold transition-transform hover:scale-105 shadow-sm"
                    >
                      Cart (2)
                    </button>
                  </div>
                </div>

                {/* Branded Hero Banner Preview */}
                <div
                  style={{
                    backgroundColor: secondaryColor,
                  }}
                  className="p-6 transition-colors space-y-3"
                >
                  <span
                    style={{ color: primaryColor }}
                    className="text-[10px] font-bold uppercase tracking-widest block font-mono"
                  >
                    AUTUMN / WINTER ’26 CAPSULE
                  </span>

                  <h4
                    style={{
                      color: textColor,
                      fontFamily,
                    }}
                    className="text-xl sm:text-2xl font-bold tracking-tight leading-tight"
                  >
                    Elevated Luxury for the Modern Era.
                  </h4>

                  <p
                    style={{ color: textColor }}
                    className="text-xs opacity-85 leading-relaxed max-w-sm"
                  >
                    Crafted with architectural precision. Experience seamless transactions backed by
                    SYNESIS Autonomous Sentinel.
                  </p>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      style={{
                        backgroundColor: primaryColor,
                        color: '#FFFFFF',
                      }}
                      className="px-4 py-2 rounded-lg text-xs font-semibold shadow-subtle transition-transform hover:scale-105"
                    >
                      Explore Collection →
                    </button>
                    <button
                      type="button"
                      style={{
                        color: textColor,
                        borderColor: primaryColor,
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-medium border bg-white/70"
                    >
                      View Lookbook
                    </button>
                  </div>
                </div>

                {/* Simulated Monitored Journey Cart & Checkout Step */}
                <div className="p-4 bg-white border-t border-border-warm space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink-primary flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-status-healthy animate-pulse" />
                      <span>Synthetic Funnel Validation Step:</span>
                    </span>
                    <Badge variant="healthy" size="sm">
                      HEALTHY (185ms)
                    </Badge>
                  </div>

                  <div className="p-3 rounded-lg bg-surface-secondary/50 border border-border-warm text-xs space-y-1.5">
                    <div className="flex justify-between text-ink-secondary text-[11px]">
                      <span>Monitored Host:</span>
                      <MonoCode>{checkoutSubdomain || primaryDomain}</MonoCode>
                    </div>
                    <div className="flex justify-between text-ink-secondary text-[11px]">
                      <span>Typography Font Family:</span>
                      <strong className="text-ink-primary font-sans">{fontFamily}</strong>
                    </div>
                    <div className="flex justify-between text-ink-secondary text-[11px]">
                      <span>Text Font Colour:</span>
                      <span className="flex items-center gap-1">
                        <span
                          style={{ backgroundColor: textColor }}
                          className="w-2.5 h-2.5 rounded-full border border-black/10 inline-block"
                        />
                        <span className="font-mono">{textColor}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* SYNESIS Autonomous Sentinel Protection Ribbon */}
                <div className="px-4 py-3 bg-burgundy text-white flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-bold text-[11px] leading-tight">
                        Protected by SYNESIS Sentinel
                      </div>
                      <div className="text-[10px] text-white/80">
                        {monitoredDomains.length} domains active • Zero impersonation breaches
                      </div>
                    </div>
                  </div>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                </div>
              </div>

              {/* PALETTE SUMMARY CARD */}
              <div className="p-4 rounded-xl bg-white border border-border-warm shadow-subtle space-y-3">
                <span className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block">
                  Configured Visual Palette
                </span>
                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="p-2 rounded-lg border border-border-warm bg-surface-secondary/40 space-y-1">
                    <div
                      style={{ backgroundColor: primaryColor }}
                      className="w-full h-7 rounded shadow-subtle"
                    />
                    <span className="font-semibold text-ink-primary block truncate">Primary</span>
                    <MonoCode>{primaryColor}</MonoCode>
                  </div>

                  <div className="p-2 rounded-lg border border-border-warm bg-surface-secondary/40 space-y-1">
                    <div
                      style={{ backgroundColor: secondaryColor }}
                      className="w-full h-7 rounded shadow-subtle border border-black/5"
                    />
                    <span className="font-semibold text-ink-primary block truncate">Secondary</span>
                    <MonoCode>{secondaryColor}</MonoCode>
                  </div>

                  <div className="p-2 rounded-lg border border-border-warm bg-surface-secondary/40 space-y-1">
                    <div
                      style={{ backgroundColor: textColor }}
                      className="w-full h-7 rounded shadow-subtle"
                    />
                    <span className="font-semibold text-ink-primary block truncate">Text Font</span>
                    <MonoCode>{textColor}</MonoCode>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
