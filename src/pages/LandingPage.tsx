import React, { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Compass,
  Flame,
  Globe,
  LogIn,
  MessageSquare,
  Network,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Workflow,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge, MonoCode } from '../components/ui/Badge';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interactive 3D / Canvas Operational Core Visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 600);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // Nodes representing synthetic checkpoints and operational guardians
    const nodes = [
      { id: 'auth', label: 'Auth & Session', angle: 0, radius: 140, color: '#16845B', status: 'HEALTHY' },
      { id: 'cart', label: 'Cart Engine', angle: (Math.PI * 2) / 6, radius: 150, color: '#16845B', status: 'HEALTHY' },
      { id: 'checkout', label: 'Checkout Service', angle: (Math.PI * 4) / 6, radius: 145, color: '#C78625', status: 'DEGRADED' },
      { id: 'gateway_a', label: 'Primary Gateway', angle: (Math.PI * 6) / 6, radius: 160, color: '#C43C4B', status: 'TIMEOUT' },
      { id: 'gateway_b', label: 'Secondary Gateway', angle: (Math.PI * 8) / 6, radius: 155, color: '#16845B', status: 'STANDBY READY' },
      { id: 'threat_hub', label: 'L7 Threat WAF', angle: (Math.PI * 10) / 6, radius: 140, color: '#5578C7', status: 'FILTERING' },
    ];

    // Flying packets
    interface Packet {
      fromIndex: number;
      toIndex: number;
      progress: number;
      speed: number;
      color: string;
    }

    const packets: Packet[] = [];
    for (let i = 0; i < 9; i++) {
      packets.push({
        fromIndex: Math.floor(Math.random() * nodes.length),
        toIndex: Math.floor(Math.random() * nodes.length),
        progress: Math.random(),
        speed: 0.005 + Math.random() * 0.008,
        color: i % 2 === 0 ? '#6D1735' : '#16845B',
      });
    }

    let rotationAngle = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      rotationAngle += 0.002;

      // Draw outer ambient glow
      const radialGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        20,
        centerX,
        centerY,
        220
      );
      radialGradient.addColorStop(0, 'rgba(109, 23, 53, 0.06)');
      radialGradient.addColorStop(0.6, 'rgba(109, 23, 53, 0.02)');
      radialGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = radialGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 240, 0, Math.PI * 2);
      ctx.fill();

      // Draw concentric orbital rings
      const rings = [90, 150, 210];
      rings.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.strokeStyle = idx === 1 ? 'rgba(109, 23, 53, 0.22)' : 'rgba(232, 221, 226, 0.7)';
        ctx.lineWidth = idx === 1 ? 1.5 : 1;
        ctx.setLineDash(idx === 0 ? [4, 6] : idx === 2 ? [8, 8] : []);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // Draw Central Operational Core
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, 44, 0, Math.PI * 2);
      ctx.fillStyle = '#6D1735';
      ctx.shadowColor = 'rgba(109, 23, 53, 0.4)';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.restore();

      // Central core inner pulse
      ctx.beginPath();
      ctx.arc(centerX, centerY, 36, 0, Math.PI * 2);
      ctx.fillStyle = '#431024';
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SYNESIS', centerX, centerY - 6);
      ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText('CORE ACTUATOR', centerX, centerY + 8);

      // Calculate current node positions
      const currentPositions = nodes.map((n) => {
        const theta = n.angle + rotationAngle;
        return {
          x: centerX + Math.cos(theta) * n.radius,
          y: centerY + Math.sin(theta) * n.radius,
          node: n,
        };
      });

      // Draw connection vectors to center
      currentPositions.forEach((pos) => {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = 'rgba(109, 23, 53, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Draw packets traveling between nodes
      packets.forEach((pkt) => {
        pkt.progress += pkt.speed;
        if (pkt.progress >= 1) {
          pkt.progress = 0;
          pkt.fromIndex = pkt.toIndex;
          pkt.toIndex = Math.floor(Math.random() * nodes.length);
        }
        const p1 = currentPositions[pkt.fromIndex];
        const p2 = currentPositions[pkt.toIndex];
        const px = p1.x + (p2.x - p1.x) * pkt.progress;
        const py = p1.y + (p2.y - p1.y) * pkt.progress;

        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = pkt.color;
        ctx.fill();
      });

      // Render outer nodes
      currentPositions.forEach((pos) => {
        // Outer halo
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = pos.node.color;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        // Node center pip
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = pos.node.color;
        ctx.fill();

        // Node Label
        ctx.fillStyle = '#24151C';
        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(pos.node.label, pos.x, pos.y + 24);

        // Status badge
        ctx.font = '500 9px "JetBrains Mono", monospace';
        ctx.fillStyle = pos.node.color;
        ctx.fillText(pos.node.status, pos.x, pos.y + 36);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="min-h-screen bg-surface-offwhite text-ink-primary flex flex-col font-sans selection:bg-burgundy/15 selection:text-burgundy">
      {/* ========================================================= */}
      {/* TOP ENTERPRISE NAVIGATION BAR */}
      {/* ========================================================= */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-border-subtle h-16 px-6 lg:px-12 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-burgundy text-white flex items-center justify-center font-heading font-black text-lg shadow-sm border border-burgundy-dark transition-transform group-hover:scale-105">
              S
            </div>
            <div>
              <div className="font-heading font-bold text-base tracking-tight text-ink-primary flex items-center gap-2">
                SYNESIS
                <span className="text-[10px] px-1.5 py-0.5 bg-burgundy/10 text-burgundy font-mono rounded font-semibold">
                  ’26 ENTERPRISE
                </span>
              </div>
              <div className="text-[10px] font-medium text-ink-secondary uppercase tracking-widest -mt-0.5">
                Autonomous Business Reliability
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-ink-secondary">
            <a href="#capabilities" className="hover:text-burgundy transition-colors">
              Capabilities
            </a>
            <a href="#operational-core" className="hover:text-burgundy transition-colors">
              Operational Core
            </a>
            <a href="#architecture" className="hover:text-burgundy transition-colors">
              Self-Healing Mesh
            </a>
            <a href="#security" className="hover:text-burgundy transition-colors">
              Payment Safety
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink-primary hover:text-burgundy bg-surface-secondary/80 hover:bg-burgundy/10 rounded-md border border-border-warm transition-colors"
          >
            <LogIn className="w-3.5 h-3.5 text-burgundy" />
            <span>Brand Owner Login</span>
          </Link>
          <Link
            to="/intelligence/correlation"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-burgundy hover:bg-burgundy/5 rounded-md transition-colors"
          >
            <Network className="w-3.5 h-3.5" />
            Correlation Graph
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/overview')}
            className="flex items-center gap-2 shadow-elevated bg-burgundy hover:bg-burgundy-dark text-white font-medium px-4"
          >
            <Compass className="w-4 h-4" />
            <span>Open Overview</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-80" />
          </Button>
        </div>
      </header>

      {/* ========================================================= */}
      {/* CINEMATIC HERO SECTION */}
      {/* ========================================================= */}
      <section className="relative pt-12 pb-20 px-6 lg:px-12 max-w-7xl mx-auto w-full overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Mission & Narrative */}
          <div className="lg:col-span-7 space-y-6 z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-burgundy/5 border border-burgundy/15 text-burgundy text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-status-healthy animate-pulse" />
              Autonomous Business Monitoring, Intelligence &amp; Verified Recovery
            </div>

            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold text-ink-primary tracking-tight leading-[1.12]">
              Automated Synthetic{' '}
              <span className="text-burgundy">Transaction Monitoring.</span>
            </h1>

            <p className="text-base sm:text-lg text-ink-secondary max-w-2xl leading-relaxed">
              SYNESIS ’26 validates critical e-commerce journeys end-to-end—from customer search
              and cart to dual-gateway payment capture. When anomalies strike, SYNESIS unifies
              synthetic telemetry, customer sentiment, and threat bursts into verified recovery.
            </p>

            {/* Action Bar */}
            <div className="pt-2 flex flex-wrap items-center gap-4">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate('/overview')}
                className="bg-burgundy hover:bg-burgundy-deep text-white font-semibold px-6 shadow-elevated flex items-center gap-2.5 h-12"
              >
                <Compass className="w-5 h-5" />
                <span>Open Overview Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Button>

              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate('/login')}
                className="border-border-subtle hover:border-burgundy/40 text-ink-primary h-12 px-5 flex items-center gap-2 bg-white shadow-subtle"
              >
                <LogIn className="w-4 h-4 text-burgundy" />
                <span>Brand Owner Portal</span>
              </Button>

              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate('/intelligence/incidents')}
                className="border-border-subtle hover:border-burgundy/40 text-ink-primary h-12 px-5 flex items-center gap-2"
              >
                <ShieldAlert className="w-4 h-4 text-status-critical" />
                <span>Incident Response</span>
              </Button>
            </div>

            {/* Live Reliability Guardrails */}
            <div className="pt-4 grid grid-cols-3 gap-4 border-t border-border-subtle/80 max-w-xl">
              <div>
                <div className="text-2xl font-bold font-heading text-ink-primary tracking-tight">
                  99.98%
                </div>
                <div className="text-[11px] font-medium text-ink-secondary uppercase tracking-wider mt-0.5">
                  SLO Attainment
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold font-heading text-status-healthy tracking-tight">
                  &lt; 4.2s
                </div>
                <div className="text-[11px] font-medium text-ink-secondary uppercase tracking-wider mt-0.5">
                  Autonomous Cutover
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold font-heading text-burgundy tracking-tight">
                  Strict
                </div>
                <div className="text-[11px] font-medium text-ink-secondary uppercase tracking-wider mt-0.5">
                  Idempotent Safety
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive 3D Operational Visualization */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            <div className="w-full aspect-square max-w-[500px] rounded-2xl bg-white border border-border-subtle shadow-elevated relative overflow-hidden flex flex-col">
              {/* Header Bar */}
              <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between bg-surface-offwhite/50">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-status-healthy animate-ping" />
                  <span className="text-xs font-semibold text-ink-primary font-heading">
                    Autonomous Operational Core
                  </span>
                </div>
                <div className="text-[10px] font-mono text-ink-secondary">
                  MESH: ACTIVE • 200 OK
                </div>
              </div>

              {/* High-fidelity Canvas Render */}
              <div className="relative flex-1 w-full h-full flex items-center justify-center p-2">
                <canvas ref={canvasRef} className="w-full h-full block" />
              </div>

              {/* Status Footer */}
              <div className="px-4 py-2.5 bg-surface-light border-t border-border-subtle text-[11px] flex items-center justify-between text-ink-secondary">
                <span className="flex items-center gap-1.5 font-medium">
                  <Workflow className="w-3.5 h-3.5 text-burgundy" />
                  6 Probes • 2 Gateways Synchronized
                </span>
                <Link
                  to="/monitoring/service-health"
                  className="text-burgundy hover:underline font-semibold flex items-center gap-1"
                >
                  Inspect Health <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 4 REAL-TIME TELEMETRY STREAM TICKERS */}
      {/* ========================================================= */}
      <section className="bg-white border-y border-border-subtle py-6 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Tile 1: Synthetic Business Journeys */}
          <div
            onClick={() => navigate('/monitoring/journeys')}
            className="p-4 rounded-xl bg-surface-offwhite border border-border-subtle hover:border-burgundy/40 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-ink-secondary mb-2">
              <span className="flex items-center gap-1.5 font-semibold text-ink-primary">
                <Workflow className="w-4 h-4 text-burgundy" />
                Synthetic Journeys
              </span>
              <span className="text-[11px] font-mono text-status-healthy font-semibold">
                ACTIVE
              </span>
            </div>
            <div className="text-xl font-bold font-heading text-ink-primary">
              6 Monitored Flows
            </div>
            <div className="text-xs text-ink-secondary mt-1 flex items-center justify-between">
              <span>Login → Search → Cart → Pay</span>
              <span className="text-burgundy font-medium group-hover:translate-x-1 transition-transform">
                →
              </span>
            </div>
          </div>

          {/* Tile 2: Primary vs Secondary Gateway */}
          <div
            onClick={() => navigate('/monitoring/service-health')}
            className="p-4 rounded-xl bg-surface-offwhite border border-border-subtle hover:border-burgundy/40 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-ink-secondary mb-2">
              <span className="flex items-center gap-1.5 font-semibold text-ink-primary">
                <ShieldCheck className="w-4 h-4 text-status-warning" />
                Payment Gateways
              </span>
              <span className="text-[11px] font-mono text-status-warning font-semibold">
                DEGRADED
              </span>
            </div>
            <div className="text-xl font-bold font-heading text-ink-primary">
              Alpha vs. Beta Standby
            </div>
            <div className="text-xs text-ink-secondary mt-1 flex items-center justify-between">
              <span>Primary timeout &gt; 8000ms</span>
              <span className="text-burgundy font-medium group-hover:translate-x-1 transition-transform">
                →
              </span>
            </div>
          </div>

          {/* Tile 3: Threat & Bot Bursts */}
          <div
            onClick={() => navigate('/intelligence/threat-monitoring')}
            className="p-4 rounded-xl bg-surface-offwhite border border-border-subtle hover:border-burgundy/40 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-ink-secondary mb-2">
              <span className="flex items-center gap-1.5 font-semibold text-ink-primary">
                <Flame className="w-4 h-4 text-status-critical" />
                Threat Telemetry
              </span>
              <span className="text-[11px] font-mono text-status-critical font-semibold">
                4,200 RPS
              </span>
            </div>
            <div className="text-xl font-bold font-heading text-ink-primary">
              L7 HTTP Flood Filtered
            </div>
            <div className="text-xs text-ink-secondary mt-1 flex items-center justify-between">
              <span>Turnstile Challenge Enforced</span>
              <span className="text-burgundy font-medium group-hover:translate-x-1 transition-transform">
                →
              </span>
            </div>
          </div>

          {/* Tile 4: Brand Impersonation */}
          <div
            onClick={() => navigate('/intelligence/brand-protection')}
            className="p-4 rounded-xl bg-surface-offwhite border border-border-subtle hover:border-burgundy/40 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-ink-secondary mb-2">
              <span className="flex items-center gap-1.5 font-semibold text-ink-primary">
                <Globe className="w-4 h-4 text-burgundy" />
                Brand Protection
              </span>
              <span className="text-[11px] font-mono text-burgundy font-semibold">
                TAKEDOWN READY
              </span>
            </div>
            <div className="text-xl font-bold font-heading text-ink-primary">
              syndicate-pay-portal.com
            </div>
            <div className="text-xs text-ink-secondary mt-1 flex items-center justify-between">
              <span>Risk 98/100 • ICANN Draft</span>
              <span className="text-burgundy font-medium group-hover:translate-x-1 transition-transform">
                →
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 6 OPERATIONAL PILLARS SHOWCASE */}
      {/* ========================================================= */}
      <section id="capabilities" className="py-20 px-6 lg:px-12 max-w-7xl mx-auto w-full">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <Badge variant="neutral" size="sm" className="bg-burgundy/10 text-burgundy font-semibold">
            PLATFORM CAPABILITIES
          </Badge>
          <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-ink-primary tracking-tight">
            Designed for mission-critical e-commerce operations.
          </h2>
          <p className="text-ink-secondary text-base leading-relaxed">
            Eliminate blind spots between customer friction, third-party gateway downtime, and
            external threat vectors with full algorithmic correlation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-white border border-border-subtle shadow-subtle hover:shadow-elevated transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-burgundy/10 text-burgundy flex items-center justify-center">
                <Workflow className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-lg font-bold text-ink-primary">
                Synthetic Transaction Probes
              </h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Deterministic synthetic probes execute simulated shopper journeys every 60 seconds.
                Verifies login tokens, product catalog index, cart state, checkout mutations, and
                order webhooks with millisecond telemetry.
              </p>
            </div>
            <div className="pt-6 border-t border-border-subtle mt-6 flex items-center justify-between text-xs">
              <span className="font-mono text-ink-secondary">6 Flows Configured</span>
              <Link
                to="/monitoring/journeys"
                className="text-burgundy font-semibold hover:underline flex items-center gap-1"
              >
                Inspect Journeys <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-white border border-border-subtle shadow-subtle hover:shadow-elevated transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-status-healthy/10 text-status-healthy flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-lg font-bold text-ink-primary">
                Payment Gateway Auto-Failover
              </h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Autonomous health comparison between Primary (PayEngine-Alpha) and Secondary
                (PayShield-Beta) gateways. Pre-flight verification and idempotent keys guarantee
                zero double-charging during cutovers.
              </p>
            </div>
            <div className="pt-6 border-t border-border-subtle mt-6 flex items-center justify-between text-xs">
              <span className="font-mono text-ink-secondary">Dual-Gateway Mesh</span>
              <Link
                to="/monitoring/service-health"
                className="text-burgundy font-semibold hover:underline flex items-center gap-1"
              >
                Compare Gateways <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-white border border-border-subtle shadow-subtle hover:shadow-elevated transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-status-warning/10 text-status-warning flex items-center justify-center">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-lg font-bold text-ink-primary">
                Brand Impersonation Intelligence
              </h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Sentinel crawlers monitor global Certificate Transparency logs and WHOIS registrations
                for homoglyphs and combosquatting domains. Instantly drafts binding ICANN takedown
                notices with pre-attached evidence.
              </p>
            </div>
            <div className="pt-6 border-t border-border-subtle mt-6 flex items-center justify-between text-xs">
              <span className="font-mono text-ink-secondary">4 Impersonations Tracked</span>
              <Link
                to="/intelligence/brand-protection"
                className="text-burgundy font-semibold hover:underline flex items-center gap-1"
              >
                View Threat Queue <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 4 */}
          <div className="p-6 rounded-2xl bg-white border border-border-subtle shadow-subtle hover:shadow-elevated transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-burgundy/10 text-burgundy flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-lg font-bold text-ink-primary">
                Customer Complaint Intelligence
              </h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Aggregates customer friction from Zendesk, social media mentions, and mobile app reviews.
                Detects complaint volume surges (+340%) and automatically correlates user sentiment
                with active synthetic failures.
              </p>
            </div>
            <div className="pt-6 border-t border-border-subtle mt-6 flex items-center justify-between text-xs">
              <span className="font-mono text-ink-secondary">+340% Surge Active</span>
              <Link
                to="/intelligence/complaints"
                className="text-burgundy font-semibold hover:underline flex items-center gap-1"
              >
                Analyze Sentiments <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 5 */}
          <div className="p-6 rounded-2xl bg-white border border-border-subtle shadow-subtle hover:shadow-elevated transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-status-critical/10 text-status-critical flex items-center justify-center">
                <Flame className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-lg font-bold text-ink-primary">
                Threat &amp; Bot Burst Mitigation
              </h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Real-time traffic telemetry isolates DDoS HTTP floods, credential stuffing, and cart
                scraping bots. Human-in-the-loop controls allow instant activation of Turnstile
                challenges and CIDR blocks on sensitive endpoints.
              </p>
            </div>
            <div className="pt-6 border-t border-border-subtle mt-6 flex items-center justify-between text-xs">
              <span className="font-mono text-ink-secondary">62% Bot Ratio Detected</span>
              <Link
                to="/intelligence/threat-monitoring"
                className="text-burgundy font-semibold hover:underline flex items-center gap-1"
              >
                Inspect Traffic <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 6 */}
          <div className="p-6 rounded-2xl bg-white border border-border-subtle shadow-subtle hover:shadow-elevated transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-status-info/10 text-status-info flex items-center justify-center">
                <Network className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-lg font-bold text-ink-primary">
                Unified Incident Correlation
              </h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Replaces siloed alerts with a synchronized causal graph. Links synthetic journey
                timeouts, gateway latency surges, customer complaints, and external bot attacks into
                a single coherent incident timeline.
              </p>
            </div>
            <div className="pt-6 border-t border-border-subtle mt-6 flex items-center justify-between text-xs">
              <span className="font-mono text-ink-secondary">96% RCA Confidence</span>
              <Link
                to="/intelligence/correlation"
                className="text-burgundy font-semibold hover:underline flex items-center gap-1"
              >
                Open Correlation <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* ENTERPRISE SECURITY & QUORUM GUARANTEES */}
      {/* ========================================================= */}
      <section id="security" className="bg-white border-t border-border-subtle py-16 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-5">
            <Badge variant="neutral" size="sm" className="bg-burgundy/10 text-burgundy font-semibold">
              SECURITY ARCHITECTURE
            </Badge>
            <h2 className="font-heading text-3xl font-extrabold text-ink-primary tracking-tight">
              Zero-Trust Autonomous Execution.
            </h2>
            <p className="text-ink-secondary text-sm leading-relaxed">
              Automated self-healing must never introduce new risks. SYNESIS operates under four
              uncompromising security invariants audited by enterprise cybersecurity standards.
            </p>

            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded bg-status-healthy/10 text-status-healthy flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-ink-primary">
                    Dual-Key Approval Quorum
                  </div>
                  <div className="text-xs text-ink-secondary mt-0.5">
                    High-blast-radius countermeasures (e.g. gateway traffic drain) require cryptographically
                    signed approvals from two authorized on-call engineers.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded bg-status-healthy/10 text-status-healthy flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-ink-primary">
                    Strict Payment Idempotency (<MonoCode>X-Idempotency-Key</MonoCode>)
                  </div>
                  <div className="text-xs text-ink-secondary mt-0.5">
                    Payment mutations enforce UUIDv4 idempotency tokens. Timeouts are never inferred as
                    successful or retried blindly without backend quarantine confirmation.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded bg-status-healthy/10 text-status-healthy flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-ink-primary">
                    Zero Credential Exposure
                  </div>
                  <div className="text-xs text-ink-secondary mt-0.5">
                    Payment card PANs, CVVs, and secret webhook keys are never captured in synthetic logs,
                    browser memory, or incident transcripts.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 bg-surface-offwhite rounded-2xl p-6 border border-border-subtle space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <span className="text-xs font-mono font-semibold text-ink-primary flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-burgundy" />
                synesis-sentinel --verify-attestation
              </span>
              <span className="text-[10px] font-mono text-status-healthy bg-status-healthy/10 px-2 py-0.5 rounded">
                COMPLIANT
              </span>
            </div>
            <pre className="font-mono text-xs text-ink-primary bg-white p-4 rounded-xl border border-border-subtle overflow-x-auto leading-relaxed">
{`[SYNESIS-KERNEL] Invariant Guard Active
[AUDIT] Blast Radius Threshold: TIER-1 (STRICT)
[CRYPTO] Dual-Signature Quorum: 2/2 Operators Required
[PAYMENT] Pre-Flight Hold Verification: PASSED
[NETWORK] WAF Managed Challenge: ACTIVE (MIT-WAF-09)
[VERIFICATION] Reversible Rollback Plan: VALIDATED`}
            </pre>
            <div className="flex items-center justify-between text-xs text-ink-secondary pt-2">
              <span>Audited under SOC-2 Type II &amp; PCI-DSS v4.0</span>
              <Link to="/system/settings" className="text-burgundy hover:underline font-semibold">
                Platform Policies →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* CALL TO ACTION BANNER */}
      {/* ========================================================= */}
      <section className="bg-burgundy text-white py-16 px-6 lg:px-12 relative overflow-hidden">
        <div className="max-w-5xl mx-auto text-center space-y-6 relative z-10">
          <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">
            Ready to experience autonomous business reliability?
          </h2>
          <p className="text-white/80 max-w-2xl mx-auto text-base">
            Explore live synthetic e-commerce probes, investigate real-time incident graphs, and
            execute verified playbooks in the SYNESIS Command Center.
          </p>
          <div className="pt-2 flex justify-center gap-4">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/command-center')}
              className="bg-white text-burgundy hover:bg-surface-offwhite font-bold px-8 shadow-elevated h-12 flex items-center gap-2"
            >
              <Compass className="w-5 h-5 text-burgundy" />
              <span>Launch Command Center</span>
            </Button>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* FOOTER */}
      {/* ========================================================= */}
      <footer className="bg-white border-t border-border-subtle py-8 px-6 lg:px-12 text-xs text-ink-secondary">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-ink-primary">SYNESIS ’26</span>
            <span>•</span>
            <span>Autonomous Business Monitoring, Intelligence &amp; Verified Recovery</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/command-center" className="hover:text-burgundy transition-colors">
              Command Center
            </Link>
            <Link to="/monitoring/journeys" className="hover:text-burgundy transition-colors">
              Journeys
            </Link>
            <Link to="/intelligence/brand-protection" className="hover:text-burgundy transition-colors">
              Brand Protection
            </Link>
            <Link to="/recovery/playbooks" className="hover:text-burgundy transition-colors">
              Playbooks
            </Link>
            <Link to="/system/settings" className="hover:text-burgundy transition-colors">
              Settings
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
