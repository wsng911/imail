const COLORS = ['#FF3B3B','#FF8C00','#FFD700','#00CC66','#1A8FFF','#7B5EFF','#FF4DAD','#FF3B3B','#FF8C00','#FFD700']
const COUNT = 10, R = 9, SIZE = 24, DOT = 3

export default function SpinnerDots({ duration = 5 }: { duration?: number }) {
  const dots = Array.from({ length: COUNT }, (_, i) => {
    const rad = (i / COUNT * 360 - 90) * Math.PI / 180
    return { x: SIZE / 2 + R * Math.cos(rad) - DOT / 2, y: SIZE / 2 + R * Math.sin(rad) - DOT / 2, delay: -(i / COUNT * duration) }
  })
  return (
    <div style={{ width: SIZE, height: SIZE, animation: `spin ${duration}s linear infinite`, flexShrink: 0 }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes dotfade{0%{opacity:1}50%{opacity:0.15}100%{opacity:1}}`}</style>
      <svg width={SIZE} height={SIZE}>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x + DOT / 2} cy={d.y + DOT / 2} r={DOT / 2}
            fill={COLORS[i]}
            style={{ animation: `dotfade ${duration}s linear infinite`, animationDelay: `${d.delay}s` }} />
        ))}
      </svg>
    </div>
  )
}
