// A small accessible on/off switch.
export default function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={'toggle' + (checked ? ' on' : '')}
      onClick={() => onChange && onChange(!checked)}
    >
      <span className="knob" />
    </button>
  )
}
