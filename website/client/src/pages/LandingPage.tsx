import { PhysicalCard, GlassCard } from "@/components/ui/physical-card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { 
  ArrowRight, 
  Layers, 
  Network, 
  Brain, 
  Check, 
  Cpu, 
  GitMerge, 
  LayoutDashboard,
  Zap
} from "lucide-react";
import heroBg from "@/assets/images/real-architecture-hero.jpg";
import productShot from "@assets/generated_images/minimalist_architectural_product_story_map_interface.png";

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-white dark:bg-zinc-950 selection:bg-black selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-6">
        <div className="mx-auto max-w-[1400px]">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-4">
            <div className="flex items-center gap-4">
              <span className="font-display font-bold text-2xl tracking-tighter uppercase">
                Dossier
              </span>
              <div className="h-4 w-px bg-zinc-300" />
              <span className="text-xs font-medium tracking-widest uppercase text-zinc-400">AI-Native Product Building Platform</span>
            </div>
            
            <div className="hidden md:flex items-center gap-12 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500">
              <a href="#features" className="hover:text-black transition-colors">System</a>
              <a href="#how-it-works" className="hover:text-black transition-colors">Process</a>
              <a href="#pricing" className="hover:text-black transition-colors">Tiers</a>
            </div>

            <div className="flex items-center gap-8">
              <Button variant="ghost" className="text-[10px] font-bold tracking-[0.2em] uppercase">
                Log In
              </Button>
              <Button className="rounded-none px-8 bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black transition-none">
                Start Build
              </Button>
            </div>
          </div>
        </div>
      </nav>
      {/* Hero Section */}
      <section className="relative pt-60 pb-40 px-6 border-b border-zinc-100">
        <div className="mx-auto max-w-[1400px] grid lg:grid-cols-2 gap-20 items-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          >
            <div className="text-[10px] font-bold tracking-[0.3em] uppercase text-zinc-400 mb-12 flex items-center gap-4">
              <div className="w-12 h-px bg-zinc-200" />
              Product Orchestration Layer
            </div>
            
            <h1 className="font-display text-7xl md:text-[8rem] font-bold tracking-[-0.04em] mb-16 leading-[0.9] uppercase">
              You <span className="text-zinc-200 dark:text-zinc-400">create</span> <br />
              User value. <br />
              Agents <span className="text-zinc-200 dark:text-zinc-400">create</span> <br />
              Code.
            </h1>

            <p className="max-w-md text-lg text-zinc-500 mb-16 leading-relaxed font-medium uppercase tracking-[0.1em]">Share Vision. Build Context. Ship Product.</p>

            <div className="flex items-center gap-8">
              <Button size="lg" className="h-16 rounded-none px-12 text-xs font-bold tracking-[0.2em] uppercase bg-black text-white hover:bg-zinc-800">
                Deploy System
              </Button>
              <div className="w-12 h-px bg-zinc-200" />
              <a href="#" className="text-[10px] font-bold tracking-[0.2em] uppercase hover:underline">Read Spec</a>
            </div>
          </motion.div>

          <div className="relative h-full min-h-[600px]">
            <img 
              src={heroBg} 
              alt="Architectural Context" 
              className="absolute inset-0 w-full h-full object-cover grayscale opacity-80"
            />
          </div>
        </div>
      </section>
      {/* Quote Section */}
      <section className="px-6 py-40 border-b border-zinc-100 bg-zinc-50/50">
        <div className="mx-auto max-w-4xl text-center">
          <div className="text-[10px] font-bold tracking-[0.4em] uppercase text-zinc-400 mb-12 flex items-center justify-center gap-4">
            <div className="w-12 h-px bg-zinc-200" />
            Market Sentiment
            <div className="w-12 h-px bg-zinc-200" />
          </div>
          <p className="text-4xl md:text-5xl font-display font-bold tracking-tighter leading-tight italic text-zinc-800">
            &ldquo;It would be nice to see some competition vs JIRA in the next few years. Something that frees teams instead of slowing them down w/ hideous screens &amp; painful disorganization.&rdquo;
          </p>
          <div className="mt-12 flex flex-col items-center gap-2">
            <div className="w-px h-12 bg-zinc-200" />
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Bobby Tahir</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-widest">4x CTO</span>
          </div>
        </div>
      </section>
      {/* Principles Section */}
      <section id="features" className="px-6 py-40 bg-zinc-50 border-b border-zinc-100">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-32 max-w-2xl">
            <h2 className="text-[10px] font-bold tracking-[0.4em] uppercase text-zinc-400 mb-8 italic">Structure / Purpose</h2>
            <p className="text-4xl font-display font-bold tracking-tighter leading-tight">
              A high-precision interface designed to replace the chaos of scattered chat threads with architectural clarity.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-px bg-zinc-200 border border-zinc-200">
            {[
              { title: "Navigation", desc: "A visual map of customer value, not a list of tasks. Spot gaps and relationships across the whole product." },
              { title: "Context", desc: "Rich cards storing Known Facts and Working Assumptions. Feedback loops that improve agent quality." },
              { title: "Parallelism", desc: "The interface for building at AI speed. Run multiple features and versions simultaneously without losing the forest." }
            ].map((item, i) => (
              <div key={i} className="bg-white p-16 group hover:bg-black transition-colors duration-500">
                <span className="text-xs font-bold text-zinc-300 group-hover:text-zinc-700">0{i+1}</span>
                <h3 className="text-2xl font-bold mt-8 mb-4 group-hover:text-white">{item.title}</h3>
                <p className="text-zinc-500 group-hover:text-zinc-400 leading-relaxed text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Product Image */}
      <section className="px-6 py-40 border-b border-zinc-100">
        <div className="mx-auto max-w-[1400px]">
          <PhysicalCard className="rounded-none border-zinc-100 overflow-hidden">
             <img 
              src={productShot} 
              alt="System Interface" 
              className="w-full grayscale hover:grayscale-0 transition-all duration-1000"
            />
          </PhysicalCard>
        </div>
      </section>
      {/* How It Works */}
      <section id="how-it-works" className="px-6 py-40 border-b border-zinc-100">
        <div className="mx-auto max-w-[1400px]">
          <div className="grid lg:grid-cols-2 gap-20">
            <div>
              <h2 className="text-[10px] font-bold tracking-[0.4em] uppercase text-zinc-400 mb-12 italic">The Process / Execution</h2>
              <h3 className="text-6xl font-display font-bold tracking-tighter uppercase mb-12">Orchestration <br /> Flow</h3>
            </div>
            <div className="space-y-32">
              {[
                { step: "01", title: "Set Objective", desc: "Define exactly what customer value you are building. The north star that anchors every parallel agent stream." },
                { step: "02", title: "Map the Forest", desc: "Visual user story mapping of workflows and relationships. See how pieces connect before they become code." },
                { step: "03", title: "Clarify the Trees", desc: "Surface assumptions and open questions. Building the context agents need to avoid mischaracterizations." },
                { step: "04", title: "Orchestrate Build", desc: "Agents build in parallel, updating Dossier with blockers and Known Facts. You shape the work as it happens." },
                { step: "05", title: "Stay Organized", desc: "Iterate on multiple features simultaneously. Dossier keeps the whole product vision from scattering into chat logs." }
              ].map((item) => (
                <div key={item.step} className="grid grid-cols-[100px_1fr] gap-8">
                  <span className="text-4xl font-display font-bold text-zinc-200">{item.step}</span>
                  <div>
                    <h4 className="text-2xl font-bold mb-4 uppercase tracking-tight">{item.title}</h4>
                    <p className="text-zinc-500 leading-relaxed font-medium">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      {/* Pricing Section */}
      <section id="pricing" className="px-6 py-40 border-b border-zinc-100">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-24">
            <h2 className="text-[10px] font-bold tracking-[0.4em] uppercase text-zinc-400 mb-8 italic">Tiers / Scale</h2>
            <h3 className="text-6xl font-display font-bold tracking-tighter uppercase">Investment</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-px bg-zinc-200 border border-zinc-200">
            {[
              { tier: "Free", price: "$0", desc: "For solo builders", features: ["1 Product", "3 Workflows", "Basic Sync"] },
              { tier: "Pro", price: "$49", desc: "For serious creators", features: ["Unlimited Products", "Multi-Agent Sync", "Test Generation"] },
              { tier: "Team", price: "Custom", desc: "For agentic studios", features: ["Per-Seat Pricing", "Shared Workspaces", "Role-based Access", "Audit Logs"] }
            ].map((plan) => (
              <div key={plan.tier} className="bg-white p-16 flex flex-col">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400 mb-2">{plan.tier}</span>
                <div className="text-6xl font-display font-bold tracking-tighter mb-4">{plan.price}</div>
                <p className="text-zinc-500 text-sm mb-12 font-medium">{plan.desc}</p>
                <div className="mt-auto space-y-4">
                  {plan.features.map(f => (
                    <div key={f} className="text-[10px] font-bold tracking-[0.1em] uppercase flex items-center gap-3">
                      <div className="w-1 h-1 bg-black" /> {f}
                    </div>
                  ))}
                  <Button className="w-full mt-12 rounded-none bg-black text-white hover:bg-zinc-800 transition-none h-14 text-[10px] font-bold tracking-[0.2em] uppercase">
                    Select Plan
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* CTA Tier */}
      <section className="px-6 py-60 bg-black text-white text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          className="mx-auto max-w-4xl"
        >
          <h2 className="font-display text-8xl md:text-[12rem] font-bold tracking-[-0.05em] uppercase leading-[0.7] mb-20">
            Build <br /> Better
          </h2>
          <Button size="lg" className="h-20 rounded-none px-16 text-xs font-bold tracking-[0.4em] uppercase bg-white text-black hover:bg-zinc-200">
            Initialize Project
          </Button>
        </motion.div>
      </section>
      {/* Footer */}
      <footer className="px-6 py-20 border-t border-zinc-100">
        <div className="mx-auto max-w-[1400px] flex justify-between items-end">
          <div>
            <span className="font-display font-bold text-4xl tracking-tighter uppercase">Dossier</span>
            <p className="mt-4 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400">© 2026 Architectural Systems</p>
          </div>
          <div className="flex gap-12 text-[10px] font-bold tracking-[0.2em] uppercase">
             <a href="#" className="hover:text-zinc-400 transition-colors">Twitter</a>
             <a href="#" className="hover:text-zinc-400 transition-colors">GitHub</a>
             <a href="#" className="hover:text-zinc-400 transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
