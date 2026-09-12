// A small "?" marker that reveals a short explanation on hover or focus.
// Use in place of standing interpretive prose, so the interface stays clean
// and the explanation is there when wanted.
export default function InfoTip({ text }) {
  return (
    <span className="infotip" tabIndex={0} role="note" aria-label={text}>
      <span className="infotip-mark">?</span>
      <span className="infotip-pop">{text}</span>
    </span>
  )
}
