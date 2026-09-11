/**
 * The app's background art.
 *
 * Manim draws mathematical constructions, so the backdrop is made of the same
 * vocabulary: a compass circle with its arcs, a plotted wave, a bezier with its
 * control handles, and scattered vertices. Everything is stroked at very low
 * opacity and drifts on a long cycle — it should read as depth in peripheral
 * vision and never resolve into something that competes with the content.
 *
 * Pure SVG plus CSS animation: no JS, no canvas, no per-frame work.
 */

function CompassCircle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" fill="none" className={className} aria-hidden="true">
      <circle cx="200" cy="200" r="150" stroke="currentColor" strokeWidth="1" />
      <circle cx="200" cy="200" r="106" stroke="currentColor" strokeWidth="1" strokeDasharray="4 8" opacity="0.6" />
      {/* Construction arcs — the ones you'd strike to bisect the circle. */}
      <path d="M 50 200 A 150 150 0 0 1 200 50" stroke="currentColor" strokeWidth="1.5" />
      <path d="M 200 350 A 150 150 0 0 1 50 200" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <line x1="200" y1="30" x2="200" y2="370" stroke="currentColor" strokeWidth="0.75" opacity="0.45" />
      <line x1="30" y1="200" x2="370" y2="200" stroke="currentColor" strokeWidth="0.75" opacity="0.45" />
      {/* Inscribed triangle */}
      <path d="M 200 50 L 330 275 L 70 275 Z" stroke="currentColor" strokeWidth="1" opacity="0.75" />
      <circle cx="200" cy="200" r="3" fill="currentColor" />
      <circle cx="200" cy="50" r="3" fill="currentColor" />
      <circle cx="330" cy="275" r="3" fill="currentColor" />
      <circle cx="70" cy="275" r="3" fill="currentColor" />
    </svg>
  );
}

function PlottedWave({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 220" fill="none" className={className} aria-hidden="true">
      {/* Axes */}
      <line x1="20" y1="110" x2="500" y2="110" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
      <line x1="20" y1="20" x2="20" y2="200" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
      {/* Ticks */}
      {[100, 180, 260, 340, 420].map((x) => (
        <line key={x} x1={x} y1="105" x2={x} y2="115" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      ))}
      {/* sin(x) */}
      <path
        d="M 20 110 C 60 110, 70 30, 100 30 C 130 30, 140 190, 180 190 C 220 190, 230 30, 260 30 C 290 30, 300 190, 340 190 C 380 190, 390 30, 420 30 C 450 30, 460 110, 500 110"
        stroke="currentColor"
        strokeWidth="1.75"
        className="animate-trace"
        style={{ ['--trace-length' as string]: '900' }}
      />
      {/* A damped companion curve, dashed */}
      <path
        d="M 20 110 C 60 110, 70 60, 100 62 C 130 64, 140 158, 180 156 C 220 154, 230 76, 260 78 C 290 80, 300 142, 340 140 C 380 138, 390 92, 420 94 C 450 96, 460 110, 500 110"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="3 6"
        opacity="0.55"
      />
      <circle cx="100" cy="30" r="3.5" fill="currentColor" />
      <circle cx="260" cy="30" r="3.5" fill="currentColor" />
      <circle cx="180" cy="190" r="3.5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function BezierHandles({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 260" fill="none" className={className} aria-hidden="true">
      <path
        d="M 30 220 C 90 40, 250 40, 310 220"
        stroke="currentColor"
        strokeWidth="1.75"
        className="animate-trace"
        style={{ ['--trace-length' as string]: '520' }}
      />
      {/* Control polygon */}
      <line x1="30" y1="220" x2="90" y2="40" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 5" opacity="0.6" />
      <line x1="310" y1="220" x2="250" y2="40" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 5" opacity="0.6" />
      <line x1="90" y1="40" x2="250" y2="40" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 5" opacity="0.35" />
      {/* Anchors filled, handles hollow — the usual convention */}
      <circle cx="30" cy="220" r="4" fill="currentColor" />
      <circle cx="310" cy="220" r="4" fill="currentColor" />
      <circle cx="90" cy="40" r="4" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="250" cy="40" r="4" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function VertexField({ className = '' }: { className?: string }) {
  const nodes = [
    [40, 60], [120, 30], [200, 80], [90, 140], [170, 170], [250, 130], [30, 200], [230, 40],
  ];
  const edges = [[0, 1], [1, 2], [0, 3], [3, 4], [2, 5], [4, 5], [3, 6], [1, 7], [2, 4]];
  return (
    <svg viewBox="0 0 290 230" fill="none" className={className} aria-hidden="true">
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a][0]} y1={nodes[a][1]}
          x2={nodes[b][0]} y2={nodes[b][1]}
          stroke="currentColor" strokeWidth="0.75" opacity="0.5"
        />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3.5 : 2.5} fill="currentColor" opacity={i % 3 === 0 ? 0.9 : 0.55} />
      ))}
    </svg>
  );
}

export default function Backdrop({ variant = 'app' }: { variant?: 'app' | 'focus' }) {
  const focus = variant === 'focus';

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {/* Ruled paper */}
      <div className="absolute inset-0 bg-ruled opacity-70" />

      {/* Ground wash — keeps the corners from reading as flat black */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 78% 8%, rgba(232,154,43,0.055) 0%, transparent 55%),' +
            'radial-gradient(100% 80% at 8% 95%, rgba(63,208,187,0.045) 0%, transparent 55%)',
        }}
      />

      {/* Construction drawings */}
      <div className="absolute -right-24 -top-32 w-[560px] text-amber-400/[0.13] animate-drift">
        <CompassCircle className="w-full h-auto" />
      </div>

      <div className="absolute left-[-90px] top-[46%] w-[420px] text-signal-400/[0.11] animate-drift-slow">
        <BezierHandles className="w-full h-auto" />
      </div>

      <div
        className="absolute bottom-[-40px] right-[6%] w-[620px] text-chalk-300/[0.09] animate-drift-slow"
        style={{ animationDelay: '-14s' }}
      >
        <PlottedWave className="w-full h-auto" />
      </div>

      {!focus && (
        <div
          className="absolute left-[38%] top-[8%] w-[300px] text-chalk-300/[0.07] animate-drift"
          style={{ animationDelay: '-9s' }}
        >
          <VertexField className="w-full h-auto" />
        </div>
      )}

      {/* Soft blooms behind the art */}
      <div className="absolute -top-[15%] right-[-10%] h-[55%] w-[55%] rounded-full bg-amber-500/[0.05] blur-[130px] animate-breathe" />
      <div
        className="absolute bottom-[-20%] left-[-10%] h-[50%] w-[50%] rounded-full bg-signal-500/[0.04] blur-[130px] animate-breathe"
        style={{ animationDelay: '-3.5s' }}
      />

      {/* Vignette, so content in the centre always has contrast */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(110% 80% at 50% 40%, transparent 40%, rgba(10,11,16,0.75) 100%)' }}
      />
    </div>
  );
}
