export default function Background() {
  return (
    <div aria-hidden className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div className="absolute inset-0 grid-lines [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="absolute -top-40 -left-40 h-[36rem] w-[36rem] rounded-full bg-saffron-500/10 blur-[120px] animate-drift" />
      <div className="absolute top-1/3 -right-40 h-[32rem] w-[32rem] rounded-full bg-teal-400/10 blur-[120px] animate-drift [animation-delay:-6s]" />
      <div className="absolute -bottom-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-violet-500/[0.07] blur-[120px] animate-drift [animation-delay:-12s]" />
    </div>
  );
}
