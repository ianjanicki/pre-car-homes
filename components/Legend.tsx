const STOPS: { value: number; color: string; label: string }[] = [
  { value: 0.0, color: '#f7f7f7', label: '0%' },
  { value: 0.1, color: '#fee5d9', label: '10%' },
  { value: 0.25, color: '#fcae91', label: '25%' },
  { value: 0.4, color: '#fb6a4a', label: '40%' },
  { value: 0.55, color: '#de2d26', label: '55%' },
  { value: 0.7, color: '#a50f15', label: '70%+' },
];

export default function Legend() {
  return (
    <div className="absolute bottom-6 left-4 bg-white/95 backdrop-blur rounded-md shadow-md p-3 text-xs font-sans">
      <div className="font-semibold text-zinc-800 mb-1">% built 1939 or earlier</div>
      <div className="flex items-center gap-0">
        {STOPS.map((s) => (
          <div key={s.value} className="w-8 h-3" style={{ background: s.color }} />
        ))}
      </div>
      <div className="flex justify-between mt-1 text-zinc-600" style={{ width: `${STOPS.length * 2}rem` }}>
        {STOPS.map((s) => (
          <span key={s.value} style={{ width: '2rem', textAlign: 'left' }}>{s.label}</span>
        ))}
      </div>
      <div className="text-zinc-500 mt-2 max-w-xs leading-snug">
        Source: US Census ACS 2023 5-yr B25034, tract level. Higher = more likely to be pre-car.
      </div>
    </div>
  );
}
