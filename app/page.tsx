"use client"

import Link from "next/link"
import { ArrowRight, Github, Zap, Lock, FileText, LayoutDashboard, Terminal, CheckCircle2, Trophy, BarChart2, Shield, XCircle, Users, Target, UserCheck, BookOpen, TrendingUp } from "lucide-react"
import { motion, useScroll, useTransform } from "framer-motion"
import { useRef } from "react"

import { 
  SvgOpenAI, 
  SvgAnthropic, 
  SvgGoogleGemini, 
  SvgPerplexity, 
  SvgMistral, 
  SvgCohere, 
  SvgGroq, 
  SvgTogetherAI 
} from "@/components/logos"

const GITHUB_URL = "https://github.com/Dphenomenal101/playcall"

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] }
}

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
}

export default function HomePage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  })
  
  // The inner content scrolls up by 75% of its height to reach the bottom.
  const y = useTransform(scrollYProgress, [0.1, 0.9], ["5%", "-55%"])
  
  // The mockup expands slightly as you scroll into it
  const scale = useTransform(scrollYProgress, [0.1, 0.3], [0.95, 1])

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-lime/30 overflow-x-hidden relative">
      {/* Dynamic Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-20 dark:opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-lime/40 to-emerald-500/40 blur-[100px] rounded-full mix-blend-screen transform -translate-y-1/2" />
      </div>

      {/* Navigation */}
      <motion.nav 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/10 dark:border-white/5 bg-background/60 backdrop-blur-xl"
      >
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-lime shadow-[0_0_15px_rgba(163,230,53,0.4)] flex items-center justify-center transition-transform group-hover:scale-105">
            <span className="text-lime-950 font-mono text-sm font-bold">P</span>
          </div>
          <span className="text-sm font-bold tracking-tight">Playcall</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="w-4 h-4" />
            GitHub
          </Link>
          <Link
            href="/auth"
            className="flex items-center gap-2 text-sm font-semibold bg-foreground text-background px-4 py-2 rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg"
          >
            Sign In
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </motion.nav>

      <main className="relative pt-28 lg:pt-36 pb-24 px-6 max-w-7xl mx-auto">
        {/* Hero Section */}
        <motion.section 
          variants={stagger}
          initial="initial"
          animate="animate"
          className="text-center max-w-4xl mx-auto mb-10"
        >
          <motion.h1 variants={fadeInUp} className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[1.05] mb-8 text-white drop-shadow-2xl">
            The open-source AI <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-lime-500 to-emerald-400 dark:from-lime-400 dark:to-emerald-300">
              alternative to{" "}
            </span>
            <span className="relative inline-block text-transparent bg-clip-text bg-gradient-to-r from-lime-500 to-emerald-400 dark:from-lime-400 dark:to-emerald-300">
              Gong
              <svg className="absolute top-full mt-2 left-0 w-full overflow-visible" viewBox="0 0 160 32" fill="none" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="ul-grad" x1="0" y1="0" x2="160" y2="0" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#84cc16"/>
                    <stop offset="1" stopColor="#34d399"/>
                  </linearGradient>
                </defs>
                {/* Single continuous back-and-forth scribble */}
                <path
                  d="M2 5 C30 2, 80 7, 130 4, 158 3
                     C145 8, 90 13, 40 11, 5 12
                     C35 16, 85 20, 135 17, 155 18"
                  stroke="url(#ul-grad)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </span>
          </motion.h1>
          
          
          <motion.p variants={fadeInUp} className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed font-medium">
            Call intelligence tools tell you what your rep said. Playcall scores it against your playbook and the buyer context. The account, contact, and deal stage.
          </motion.p>
          
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/auth"
              className="group relative flex items-center gap-2 bg-lime text-lime-950 font-bold px-8 py-4 rounded-full overflow-hidden transition-transform hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(163,230,53,0.3)] text-base"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <span className="relative">Set up your workspace</span>
              <ArrowRight className="relative w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href={GITHUB_URL}
              target="_blank"
              className="flex items-center gap-2 text-sm font-semibold text-foreground border border-border/60 bg-surface/30 backdrop-blur-md px-8 py-4 rounded-full hover:bg-surface/60 transition-all hover:scale-105 active:scale-95"
            >
              <Github className="w-4 h-4" />
              View on GitHub
            </Link>
          </motion.div>
          <motion.div variants={fadeInUp} className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground font-medium">
            <span>Sales rep?</span>
            <Link href="/auth" className="text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors">
              Sign in here
            </Link>
          </motion.div>
        </motion.section>

        {/* Dashboard Preview / Glassmorphism UI */}
        <section ref={containerRef} className="h-[100vh] max-h-[1000px] relative mb-0">
          <motion.div 
            style={{ scale }}
            className="sticky top-20 h-[85vh] max-h-[800px] select-none pointer-events-none"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-lime/20 via-lime/5 to-transparent blur-[80px] -z-10 rounded-[3rem]" />
            <div className="relative h-full rounded-[2rem] border border-black/10 dark:border-white/20 bg-white/40 dark:bg-black/60 backdrop-blur-2xl overflow-hidden shadow-[0_0_80px_rgba(163,230,53,0.12)] p-2 sm:p-4">
              <div className="rounded-[1.5rem] border border-border/40 bg-background h-full overflow-hidden relative flex flex-col">
                {/* Fake UI Header */}
                <div className="h-12 border-b border-border/40 bg-surface/30 flex items-center px-4 gap-2 z-20 shrink-0">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-rose-400/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                    <div className="w-3 h-3 rounded-full bg-lime-400/80" />
                  </div>
                  <div className="mx-auto px-4 py-1 rounded-md bg-surface border border-border/50 text-[10px] font-mono text-muted-foreground flex items-center gap-2 shadow-sm">
                    <Lock className="w-3 h-3" />
                    playcall.dphenomenal.com/manager
                  </div>
                </div>
                {/* Fake UI Body (Scrollable via Framer Motion) */}
                <div className="flex-1 overflow-hidden relative bg-surface/10">
                  <motion.div style={{ y }} className="p-4 sm:p-8 flex flex-col gap-6">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-lime animate-pulse" />
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Call Review</p>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold tracking-tight">Vektor Labs Discovery Call</h3>
                      <p className="text-sm text-muted-foreground mt-1">Enterprise Sales Playbook · Discovery · Today</p>
                    </div>

                    {/* Scoreboard */}
                    <div className="rounded-3xl border border-border/40 bg-card/40 p-6 backdrop-blur-xl shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                        <div>
                          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Overall score</p>
                          <div className="mt-2 flex items-end gap-2">
                            <span className="text-5xl font-mono text-amber-500">58</span>
                            <span className="pb-1 text-sm text-muted-foreground">/100</span>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="rounded-2xl border border-border/40 bg-surface/30 p-4 min-w-[120px]">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Playbook adherence</p>
                            <p className="mt-1 text-2xl font-light tracking-tight text-amber-500">52%</p>
                          </div>
                          <div className="rounded-2xl border border-border/40 bg-surface/30 p-4 min-w-[140px]">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Talk / listen</p>
                            <div className="mt-1 flex items-baseline gap-2 text-sm">
                              <span className="text-lg font-medium text-foreground/90">75%</span>
                              <span className="text-[10px] text-muted-foreground">talk</span>
                              <div className="h-3 w-px bg-border/60 mx-1" />
                              <span className="text-lg font-medium text-foreground/90">25%</span>
                              <span className="text-[10px] text-muted-foreground">listen</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Two Column Layout: Evidence vs Action */}
                    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] items-start pb-20">
                      
                      {/* Left Column */}
                      <div className="flex flex-col gap-6">
                        {/* Buyer-aware summary mock */}
                        <div className="rounded-3xl border border-border/40 bg-card/40 p-6 backdrop-blur-xl transition-all">
                          <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-500">
                              <Zap className="w-4 h-4" />
                            </div>
                            <h2 className="text-lg font-semibold tracking-tight">Buyer-aware summary</h2>
                          </div>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            For a Series A company vendor-evaluating their first sales tool, current-process pain and budget authority should have surfaced earlier. Sarah is the decision-maker — the rep asked about team size but never confirmed her budget scope. That's the miss that killed the Q3 timeline.
                          </p>
                          
                          <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <div className="rounded-2xl border border-lime-500/20 bg-lime-500/5 p-5">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-lime-500">Best moment</p>
                              <p className="mt-3 text-sm leading-relaxed text-foreground/90">Validated the prospect's primary challenge before pitching.</p>
                              <p className="mt-2 text-xs text-lime-500/70 italic">"I completely agree that scaling is your top priority right now..."</p>
                            </div>
                            <div className="rounded-2xl border border-border/30 bg-surface/30 p-5">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top missed moment</p>
                              <p className="mt-3 text-sm leading-relaxed text-foreground/90">Talked over the prospect during the core security objection.</p>
                              <p className="mt-2 text-xs text-muted-foreground/70 italic">"Let me stop you right there, our SOC2 actually covers..."</p>
                            </div>
                          </div>
                        </div>

                        {/* Category Breakdown Mock */}
                        <div className="rounded-3xl border border-border/40 bg-card/40 p-6 backdrop-blur-xl transition-all">
                          <h2 className="text-lg font-semibold tracking-tight mb-5">Category breakdown</h2>
                          <div className="flex flex-col gap-5">
                            {/* Mediocre category first */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">Pain Discovery</span>
                                <span className="text-sm font-mono font-bold text-amber-500">62/100</span>
                              </div>
                              <div className="h-2 w-full bg-surface rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 w-[62%]" />
                              </div>
                              <div className="flex gap-3 items-start mt-3">
                                <div className="px-2 py-0.5 rounded-md bg-background border border-border/40 font-mono text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap shadow-sm">12:34</div>
                                <p className="text-xs text-muted-foreground italic border-l-2 border-border/50 pl-3">"I completely agree that scaling the sales team is your top priority right now..."</p>
                              </div>
                            </div>
                            {/* Bad category */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">Securing Next Steps</span>
                                <span className="text-sm font-mono font-bold text-rose-500">20/100</span>
                              </div>
                              <div className="h-2 w-full bg-surface rounded-full overflow-hidden">
                                <div className="h-full bg-rose-500 w-[20%]" />
                              </div>
                              <div className="flex gap-3 items-start mt-3">
                                <div className="px-2 py-0.5 rounded-md bg-background border border-border/40 font-mono text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap shadow-sm">45:12</div>
                                <p className="text-xs text-muted-foreground italic border-l-2 border-border/50 pl-3">"I'll just shoot you an email sometime next week and we can figure out a time to chat again."</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Column */}
                      <div className="flex flex-col gap-6">
                        {/* Buyer Context Panel */}
                        <div className="rounded-3xl border border-border/40 bg-card/40 p-6 backdrop-blur-xl transition-all">
                          <div className="flex flex-col gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground/90">Vektor Labs · Series A · 40-60 employees</p>
                              <p className="text-sm text-muted-foreground mt-1">Sarah Kim · VP Revenue · Decision-maker</p>
                            </div>
                          </div>
                        </div>

                        {/* Deal progress mock */}
                        <div className="rounded-3xl border border-border/40 bg-card/40 p-6 backdrop-blur-xl transition-all">
                          <div className="mb-6 flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/20 bg-blue-400/10 text-blue-400">
                              <BarChart2 className="w-4 h-4" />
                            </div>
                            <h2 className="text-lg font-semibold tracking-tight">Deal progress</h2>
                          </div>
                          
                          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 mb-6">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stage before</p>
                              <p className="mt-2 text-sm font-medium text-foreground/90">Discovery</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stage after</p>
                              <p className="mt-2 text-sm font-medium text-foreground/90">Stalled</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Outcome</p>
                              <div className="mt-2 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                <p className="text-sm font-medium text-foreground/90">Closed Lost</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline Amount</p>
                              <p className="mt-2 text-sm font-medium text-foreground/90">$120,000</p>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-border/30 bg-surface/30 p-5">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Loss reason</p>
                            <p className="mt-2 text-sm font-medium text-foreground/80 leading-relaxed">Rep pitched product features instead of uncovering Vektor's Q3 implementation timeline.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Outcomes Bridge Section */}
        <section className="mb-40 relative z-10 -mt-12">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "See who's actually running the playbook",
                body: "Rep-level adherence at a glance. Not vibes, not gut feel, evidence per call.",
                visual: (
                  <div className="w-full h-48 rounded-3xl bg-gradient-to-br from-surface/50 to-surface/10 border border-border/50 mb-6 flex flex-col justify-center p-6 relative overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] select-none pointer-events-none">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-lime-500/10 rounded-full blur-3xl" />
                    
                    <div className="flex items-center justify-between relative z-10 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg border border-white/10 bg-gradient-to-b from-white/10 to-transparent flex items-center justify-center text-[10px] font-bold text-white shadow-sm">AS</div>
                        <span className="text-sm font-medium text-white/80">Alex S.</span>
                      </div>
                      <span className="text-sm font-mono text-lime-400 drop-shadow-[0_0_8px_rgba(163,230,53,0.5)]">92%</span>
                    </div>
                    <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden relative z-10 mb-6 border border-white/5">
                      <div className="h-full bg-gradient-to-r from-lime-600 to-lime-400 w-[92%] rounded-full shadow-[0_0_10px_rgba(163,230,53,0.5)]" />
                    </div>

                    <div className="flex items-center justify-between relative z-10 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg border border-white/5 bg-gradient-to-b from-white/5 to-transparent flex items-center justify-center text-[10px] font-bold text-white/50">MJ</div>
                        <span className="text-sm font-medium text-white/50">Maria J.</span>
                      </div>
                      <span className="text-sm font-mono text-white/50">64%</span>
                    </div>
                    <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden relative z-10 border border-white/5">
                      <div className="h-full bg-gradient-to-r from-white/20 to-white/40 w-[64%] rounded-full" />
                    </div>
                  </div>
                )
              },
              {
                title: "Know why deals stall before they close",
                body: "Loss reasons grounded in what was said, not what the CRM guessed after the fact.",
                visual: (
                  <div className="w-full h-48 rounded-3xl bg-gradient-to-br from-surface/50 to-surface/10 border border-border/50 mb-6 flex flex-col justify-center p-6 relative overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] select-none pointer-events-none">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />
                    
                    <div className="relative z-10">
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Loss Reason</span>
                      </div>
                      <div className="p-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-2xl">
                        <p className="text-xs text-white/70 leading-relaxed italic border-l-2 border-rose-500/50 pl-3">
                          "Prospect required SOC2 Type II compliance immediately. Rep failed to mention it is slated for Q4."
                        </p>
                      </div>
                    </div>
                  </div>
                )
              },
              {
                title: "Spot objection patterns before they compound",
                body: "Find the security question killing your Q3 before it kills your Q4.",
                visual: (
                  <div className="w-full h-48 rounded-3xl bg-gradient-to-br from-surface/50 to-surface/10 border border-border/50 mb-6 flex flex-col justify-end p-6 relative overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] select-none pointer-events-none">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-rose-500/10 rounded-full blur-3xl" />
                    
                    <div className="relative z-10 w-full h-28 flex items-end justify-between gap-2 border-b border-white/10 pb-4">
                      {[30, 45, 25, 85, 40, 60, 20].map((h, i) => (
                        <div key={i} className="w-full bg-white/5 rounded-t-sm relative transition-all group-hover:bg-white/10" style={{ height: `${h}%` }}>
                          {h === 85 && (
                            <>
                              <div className="absolute inset-0 bg-gradient-to-t from-rose-500/40 to-rose-400/80 rounded-t-sm shadow-[0_0_15px_rgba(244,63,94,0.4)]" />
                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                14 calls
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group flex flex-col h-full p-2"
              >
                {item.visual}
                <div className="flex flex-col gap-2 flex-1 px-2">
                  <h3 className="text-base font-bold text-white/90 tracking-tight">{item.title}</h3>
                              <p className="text-sm text-white/50 leading-relaxed">{item.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Technical Features Grid */}
        <section className="mb-24 relative">
          {/* Ambient Background Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-lime-500/5 rounded-full blur-[120px] -z-10 pointer-events-none" />
          
          <div className="text-center mb-16 relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Coaching, not just intelligence</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Gong tells you what happened. Playcall tells you what was right, wrong, and what to drill next.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
            {[
              { icon: CheckCircle2, title: "No generic advice", desc: "Calls are scored strictly against your playbook criteria: your methodology, your sales motion, not one-size-fits-all AI feedback." },
              { icon: UserCheck, title: "Buyer-aware scoring", desc: "Company stage, contact role, and deal context dynamically shape every scorecard." },
              { icon: BookOpen, title: "Your methodology, not ours", desc: "Score against MEDDPICC, BANT, SPIN, or the framework you actually use. No framework? Paste your playbook and Playcall generates the rubric for you." },
              { icon: TrendingUp, title: "Outcome-tied scoring", desc: "Every score directly links to the deal stage, ultimate outcome, and pipeline impact." },
              { icon: Zap, title: "Coaching drills, not just feedback", desc: "Every score comes with a specific, actionable drill for the rep to run next." },
              { icon: Shield, title: "Self-hostable", desc: "Open source software. Deploy to your own infrastructure and keep your data secure." }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group p-6 rounded-[2rem] border border-border/40 bg-surface/20 backdrop-blur-sm hover:bg-surface/40 hover:border-lime-500/30 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-lime-500/5 hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-2xl border border-lime-500/20 bg-lime-500/10 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-lime-500/20 transition-all duration-300 shadow-sm">
                  <feature.icon className="w-6 h-6 text-lime-600 dark:text-lime-400" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-foreground/90 group-hover:text-foreground transition-colors">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Integrations Arc */}
        <section className="mb-32 relative pt-32 pb-24 flex flex-col items-center justify-center overflow-hidden">
          {/* Subtle glowing arc background */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] sm:w-[150%] h-[800px] rounded-[100%] border-t-[1px] border-white/10 bg-gradient-to-b from-lime-500/5 to-transparent" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[1px] bg-gradient-to-r from-transparent via-lime-500/30 to-transparent blur-sm" />

          <div className="text-center relative z-20 mb-20">
            <div className="inline-flex items-center justify-center px-4 py-1.5 mb-6 rounded-full border border-lime-500/20 bg-lime-500/10 text-lime-500 text-[10px] font-mono font-bold tracking-[0.2em] uppercase shadow-[0_0_15px_rgba(163,230,53,0.1)]">
              Bring Your Own Key
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">Plug & play with any LLM</h2>
          </div>

          <div className="relative z-20 w-full max-w-6xl mx-auto overflow-hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)" }}>
            <div className="flex flex-col gap-6">
              {/* Marquee Row 1 */}
              <motion.div 
                className="flex w-max gap-6 pr-6"
                animate={{ x: ["0%", "-50%"] }}
                transition={{ duration: 30, ease: "linear", repeat: Infinity }}
              >
                {[...Array(2)].map((_, idx) => (
                  <div key={idx} className="flex shrink-0 gap-6">
                    {[
                      { name: "OpenAI", icon: SvgOpenAI, className: "font-sans font-bold" },
                      { name: "Anthropic", icon: SvgAnthropic, className: "font-serif tracking-wider" },
                      { name: "Gemini", icon: SvgGoogleGemini, className: "font-sans font-medium" },
                      { name: "Mistral", icon: SvgMistral, className: "font-serif italic font-bold" },
                    ].map((provider, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-8 py-4 rounded-full border border-white/5 bg-white/5 backdrop-blur-md shadow-xl text-muted-foreground/60 hover:text-foreground hover:bg-white/10 hover:border-white/10 transition-all cursor-default select-none group"
                      >
                        <provider.icon className="h-5 w-auto text-muted-foreground grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300" />
                        <span className={`text-lg tracking-tight ${provider.className}`}>{provider.name}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </motion.div>

              {/* Marquee Row 2 */}
              <motion.div 
                className="flex w-max gap-6 pr-6"
                animate={{ x: ["-50%", "0%"] }}
                transition={{ duration: 35, ease: "linear", repeat: Infinity }}
              >
                {[...Array(2)].map((_, idx) => (
                  <div key={idx} className="flex shrink-0 gap-6">
                    {[
                      { name: "Groq", icon: SvgGroq, className: "font-mono font-bold lowercase tracking-tighter" },
                      { name: "Cohere", icon: SvgCohere, className: "font-sans font-semibold lowercase" },
                      { name: "Perplexity", icon: SvgPerplexity, className: "font-sans font-bold" },
                      { name: "Together AI", icon: SvgTogetherAI, className: "font-sans font-medium" },
                    ].map((provider, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-8 py-4 rounded-full border border-white/5 bg-white/5 backdrop-blur-md shadow-xl text-muted-foreground/60 hover:text-foreground hover:bg-white/10 hover:border-white/10 transition-all cursor-default select-none group"
                      >
                        <provider.icon className="h-5 w-auto text-muted-foreground grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300" />
                        <span className={`text-lg tracking-tight ${provider.className}`}>{provider.name}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* Deploy Section */}
        <motion.section 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative rounded-[3rem] border border-border/50 bg-card overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-lime/10 via-transparent to-transparent opacity-50" />
          <div className="relative p-8 md:p-16 flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Deploy in minutes</h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto md:mx-0">
                No $30K contracts or 10+ features your team never touches. No vendor lock-in. Playcall is fully open source. Spin up your own instance on Vercel and Supabase for free.
              </p>
              <Link
                href={`${GITHUB_URL}#readme`}
                target="_blank"
                className="inline-flex items-center gap-2 font-semibold text-lime-700 dark:text-lime-400 hover:text-lime-800 dark:hover:text-lime-300 transition-colors"
              >
                Read the deployment guide
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="flex-1 w-full max-w-md">
              <div className="rounded-2xl border border-border/50 bg-[#0d1117] shadow-2xl overflow-hidden">
                <div className="h-10 border-b border-white/10 flex items-center px-4 gap-2 bg-white/5">
                  <Terminal className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground">terminal</span>
                </div>
                <div className="p-6 font-mono text-sm space-y-3">
                  <div className="text-gray-300"><span className="text-lime-400">git</span> clone {GITHUB_URL}</div>
                  <div className="text-gray-300"><span className="text-lime-400">cd</span> playcall && pnpm install</div>
                  <div className="text-gray-300"><span className="text-lime-400">cp</span> .env.example .env.local</div>
                  <div className="text-gray-300"><span className="text-lime-400">pnpm</span> dev</div>
                  <div className="text-emerald-400 pt-2 opacity-80">Ready on http://localhost:3000</div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-surface/20">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-lime/20 flex items-center justify-center">
              <span className="text-lime font-mono text-xs font-bold">P</span>
            </div>
            <span className="text-sm font-bold">Playcall</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Open source under the MIT License.
          </p>
          <div className="flex items-center gap-4">
            <Link href={GITHUB_URL} className="text-muted-foreground hover:text-foreground transition-colors">
              <Github className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
